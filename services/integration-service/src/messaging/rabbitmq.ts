import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import prisma from "../prisma/client.ts";

const managementUrl = process.env.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672";
const rabbitUser = process.env.RABBITMQ_USER ?? "guest";
const rabbitPassword = process.env.RABBITMQ_PASSWORD ?? "guest";
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? "saasplug.events";
const queueName = process.env.INTEGRATION_EVENTS_QUEUE ?? "integration.webhook-events";
const vhost = encodeURIComponent("/");

const bindings = [
  "integration.chargers.synced",
  "provider.registered",
  "reservation.created",
  "reservation.cancelled",
  "session.started",
  "session.stopped",
  "billing.provider_invoice.created",
];

const eventTypeNames: Record<string, string> = {
  "integration.chargers.synced": "CHARGERS_SYNCED",
  "provider.registered": "PROVIDER_REGISTERED",
  "reservation.created": "RESERVATION_CREATED",
  "reservation.cancelled": "RESERVATION_CANCELLED",
  "session.started": "SESSION_STARTED",
  "session.stopped": "SESSION_STOPPED",
  "billing.provider_invoice.created": "PROVIDER_INVOICE_CREATED",
};

const authHeader = () =>
  `Basic ${Buffer.from(`${rabbitUser}:${rabbitPassword}`).toString("base64")}`;

async function rabbitRequest(path: string, init: RequestInit = {}) {
  return fetch(`${managementUrl}/api${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function ensureRabbitTopology() {
  await rabbitRequest(`/exchanges/${vhost}/${encodeURIComponent(exchangeName)}`, {
    method: "PUT",
    body: JSON.stringify({ type: "topic", durable: true, auto_delete: false }),
  });
  await rabbitRequest(`/queues/${vhost}/${encodeURIComponent(queueName)}`, {
    method: "PUT",
    body: JSON.stringify({ durable: true, auto_delete: false }),
  });

  for (const routingKey of bindings) {
    await rabbitRequest(
      `/bindings/${vhost}/e/${encodeURIComponent(exchangeName)}/q/${encodeURIComponent(queueName)}`,
      {
        method: "POST",
        body: JSON.stringify({ routing_key: routingKey }),
      },
    );
  }
}

export async function publishDomainEvent(routingKey: string, payload: Record<string, unknown>) {
  if (process.env.MESSAGING_ENABLED === "false") return false;

  try {
    await rabbitRequest(`/exchanges/${vhost}/${encodeURIComponent(exchangeName)}`, {
      method: "PUT",
      body: JSON.stringify({ type: "topic", durable: true, auto_delete: false }),
    });

    const envelope = {
      id: randomUUID(),
      type: routingKey,
      occurredAt: new Date().toISOString(),
      payload,
    };

    const response = await rabbitRequest(
      `/exchanges/${vhost}/${encodeURIComponent(exchangeName)}/publish`,
      {
        method: "POST",
        body: JSON.stringify({
          properties: { content_type: "application/json", delivery_mode: 2 },
          routing_key: routingKey,
          payload: JSON.stringify(envelope),
          payload_encoding: "string",
        }),
      },
    );

    if (!response.ok) throw new Error(`RabbitMQ publish failed with ${response.status}`);
    const result = (await response.json()) as { routed?: boolean };
    return Boolean(result.routed);
  } catch (error) {
    console.warn(`[messaging] could not publish ${routingKey}:`, error);
    return false;
  }
}

async function consumeBatch() {
  const response = await rabbitRequest(`/queues/${vhost}/${encodeURIComponent(queueName)}/get`, {
    method: "POST",
    body: JSON.stringify({
      count: 20,
      ackmode: "ack_requeue_false",
      encoding: "auto",
      truncate: 50000,
    }),
  });

  if (!response.ok) throw new Error(`RabbitMQ consume failed with ${response.status}`);
  const messages = (await response.json()) as Array<{
    routing_key: string;
    payload: string;
  }>;

  for (const message of messages) {
    const envelope = JSON.parse(message.payload) as {
      type?: string;
      payload?: { providerId?: number; userId?: number; [key: string]: unknown };
    };
    const routingKey = envelope.type ?? message.routing_key;
    const eventType =
      eventTypeNames[routingKey] ?? routingKey.split(".").join("_").toUpperCase();
    const providerId = envelope.payload?.providerId;

    // Cache ProviderAccount for new providers so resolveProviderId works immediately.
    if (routingKey === "provider.registered") {
      const userId = envelope.payload?.userId;
      if (typeof providerId === "number" && typeof userId === "number") {
        try {
          await prisma.providerAccount.upsert({
            where: { userId },
            update: { providerId },
            create: { userId, providerId, role: "OWNER" },
          });
          console.log(
            `[messaging] provider.registered: cached ProviderAccount userId=${userId} → providerId=${providerId}`,
          );
        } catch (err) {
          console.warn("[messaging] provider.registered: failed to upsert ProviderAccount", err);
        }
      }
      continue; // A newly registered provider has no webhook subscriptions yet
    }

    if (typeof providerId !== "number") continue;

    const subscriptions = await prisma.webhookSubscription.findMany({
      where: {
        providerId,
        OR: [{ eventTypes: { has: eventType } }, { eventTypes: { has: "*" } }],
      },
    });

    for (const subscription of subscriptions) {
      await prisma.webhookEvent.create({
        data: {
          subscriptionId: subscription.id,
          type: eventType,
          payloadJson: JSON.parse(JSON.stringify(envelope)) as Prisma.InputJsonValue,
          deliveryStatus: "PENDING",
        },
      });
    }
  }
}

export async function startRabbitConsumer() {
  if (process.env.MESSAGING_ENABLED === "false") return;

  try {
    await ensureRabbitTopology();
    console.log(
      `[messaging] RabbitMQ consumer ready on exchange ${exchangeName}, queue ${queueName}`,
    );
  } catch (error) {
    console.warn("[messaging] RabbitMQ is not ready yet; consumer will retry.", error);
  }

  const poll = async () => {
    try {
      await ensureRabbitTopology();
      await consumeBatch();
    } catch (error) {
      console.warn("[messaging] RabbitMQ poll failed:", error);
    }
  };

  setInterval(() => {
    void poll();
  }, 5000);
}

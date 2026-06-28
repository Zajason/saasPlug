import { Prisma } from "@prisma/client";
import prisma from "../prisma/client.ts";

const managementUrl = process.env.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672";
const rabbitUser = process.env.RABBITMQ_USER ?? "guest";
const rabbitPassword = process.env.RABBITMQ_PASSWORD ?? "guest";
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? "saasplug.events";
const queueName = process.env.AUDIT_EVENTS_QUEUE ?? "audit.events";
const vhost = encodeURIComponent("/");

const bindings = [
  "provider.registered",
  "reservation.created",
  "reservation.cancelled",
  "session.started",
  "session.stopped",
  "billing.provider_invoice.created",
  "billing.provider_invoice.paid",
  "integration.chargers.synced",
  "charger.created",
  "charger.upserted",
  "subscription.changed",
];

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

function eventTypeFromRoutingKey(routingKey: string) {
  return routingKey.split(".").join("_").toUpperCase();
}

function sourceServiceFromRoutingKey(routingKey: string) {
  const [source] = routingKey.split(".");
  const names: Record<string, string> = {
    provider: "ProviderService",
    reservation: "ReservationService",
    session: "SessionService",
    billing: "BillingService",
    integration: "IntegrationService",
    charger: "ChargerService",
    subscription: "BillingService",
  };
  return names[source] ?? "UnknownService";
}

function maybeNumber(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function entityFor(routingKey: string, payload: Record<string, unknown>) {
  if (routingKey.startsWith("provider.")) {
    return { entityType: "Provider", entityId: maybeNumber(payload.providerId) };
  }
  if (routingKey.startsWith("reservation.")) {
    return { entityType: "Reservation", entityId: maybeNumber(payload.reservationId) };
  }
  if (routingKey.startsWith("session.")) {
    return { entityType: "Session", entityId: maybeNumber(payload.sessionId) };
  }
  if (routingKey.startsWith("billing.provider_invoice.")) {
    return { entityType: "ProviderInvoice", entityId: maybeNumber(payload.invoiceId) };
  }
  if (routingKey.startsWith("integration.chargers.")) {
    return { entityType: "ProviderApiConfig", entityId: maybeNumber(payload.providerId) };
  }
  if (routingKey.startsWith("charger.")) {
    return { entityType: "Charger", entityId: maybeNumber(payload.chargerId) };
  }
  if (routingKey.startsWith("subscription.")) {
    return { entityType: "ProviderSubscription", entityId: maybeNumber(payload.subscriptionId) };
  }
  return { entityType: null, entityId: null };
}

async function consumeBatch() {
  const response = await rabbitRequest(`/queues/${vhost}/${encodeURIComponent(queueName)}/get`, {
    method: "POST",
    body: JSON.stringify({
      count: 50,
      ackmode: "ack_requeue_false",
      encoding: "auto",
      truncate: 100000,
    }),
  });

  if (!response.ok) throw new Error(`RabbitMQ consume failed with ${response.status}`);

  const messages = (await response.json()) as Array<{
    routing_key: string;
    payload: string;
  }>;

  for (const message of messages) {
    const envelope = JSON.parse(message.payload) as {
      id?: string;
      type?: string;
      occurredAt?: string;
      payload?: Record<string, unknown>;
    };
    const routingKey = envelope.type ?? message.routing_key;
    const payload = envelope.payload ?? {};
    const eventId = envelope.id ?? `${routingKey}:${envelope.occurredAt ?? Date.now()}:${JSON.stringify(payload)}`;
    const occurredAt = envelope.occurredAt ? new Date(envelope.occurredAt) : new Date();
    const entity = entityFor(routingKey, payload);

    await prisma.auditEvent.upsert({
      where: { eventId },
      update: {},
      create: {
        eventId,
        routingKey,
        eventType: eventTypeFromRoutingKey(routingKey),
        sourceService: sourceServiceFromRoutingKey(routingKey),
        actorUserId: maybeNumber(payload.userId),
        providerId: maybeNumber(payload.providerId),
        entityType: entity.entityType,
        entityId: entity.entityId,
        payloadJson: JSON.parse(JSON.stringify(envelope)) as Prisma.InputJsonValue,
        metadata: {
          consumedFromQueue: queueName,
        },
        occurredAt: Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt,
      },
    });
  }
}

export async function startRabbitConsumer() {
  if (process.env.MESSAGING_ENABLED === "false") return;

  try {
    await ensureRabbitTopology();
    console.log(`[audit] RabbitMQ consumer ready on exchange ${exchangeName}, queue ${queueName}`);
  } catch (error) {
    console.warn("[audit] RabbitMQ is not ready yet; consumer will retry.", error);
  }

  const poll = async () => {
    try {
      await ensureRabbitTopology();
      await consumeBatch();
    } catch (error) {
      console.warn("[audit] RabbitMQ poll failed:", error);
    }
  };

  setInterval(() => {
    void poll();
  }, 5000);
}

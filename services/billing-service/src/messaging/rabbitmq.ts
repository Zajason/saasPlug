import { randomUUID } from "node:crypto";

const managementUrl = process.env.RABBITMQ_MANAGEMENT_URL ?? "http://localhost:15672";
const rabbitUser = process.env.RABBITMQ_USER ?? "guest";
const rabbitPassword = process.env.RABBITMQ_PASSWORD ?? "guest";
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? "saasplug.events";
const vhost = encodeURIComponent("/");

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
    return true;
  } catch (error) {
    console.warn(`[messaging] could not publish ${routingKey}:`, error);
    return false;
  }
}

import amqp from 'amqplib';

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? 'saasplug.events';

let channel: amqp.Channel | null = null;

async function connect() {
  const connection = await amqp.connect(rabbitUrl);
  channel = await connection.createChannel();
  await channel.assertExchange(exchangeName, 'topic', { durable: true });
  console.log(`[charger-service] Publisher connected to RabbitMQ exchange: ${exchangeName}`);
}

export async function publishEvent(routingKey: string, payload: Record<string, unknown>) {
  if (process.env.MESSAGING_ENABLED === 'false') return false;
  try {
    if (!channel) await connect();
    const envelope = {
      id: `${routingKey}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
      type: routingKey,
      occurredAt: new Date().toISOString(),
      payload,
    };
    channel!.publish(exchangeName, routingKey, Buffer.from(JSON.stringify(envelope)));
    console.log(`[charger-service] Published event: ${routingKey}`);
    return true;
  } catch (err) {
    console.warn(`[charger-service] Failed to publish ${routingKey}:`, err);
    return false;
  }
}

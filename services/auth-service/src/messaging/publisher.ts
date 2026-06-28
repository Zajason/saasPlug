import amqp from 'amqplib';

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? 'saasplug.events';

let channel: amqp.Channel | null = null;

export async function connectRabbitMQ() {
  try {
    const connection = await amqp.connect(rabbitUrl);
    channel = await connection.createChannel();
    // Ensure the exchange exists before we try to publish to it
    await channel.assertExchange(exchangeName, 'topic', { durable: true });
    console.log(`[auth-service] Connected to RabbitMQ exchange: ${exchangeName}`);
  } catch (error) {
    console.error(`[auth-service] Failed to connect to RabbitMQ:`, error);
  }
}

export async function publishEvent(routingKey: string, payload: Record<string, unknown>) {
  if (!channel) {
    await connectRabbitMQ();
  }

  // Formatting the envelope EXACTLY how your audit-service expects it
  const envelope = {
    id: `${routingKey}:${Date.now()}`,
    type: routingKey,
    occurredAt: new Date().toISOString(),
    payload: payload,
  };

  channel?.publish(
    exchangeName,
    routingKey,
    Buffer.from(JSON.stringify(envelope))
  );
  
  console.log(`[auth-service] Published event: ${routingKey}`);
}
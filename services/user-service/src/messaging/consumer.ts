import amqp from 'amqplib';
import prisma from '../prisma/client.ts';

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? 'saasplug.events';
const queueName = 'user-service.events'; // Specific queue for this service

export async function startRabbitConsumer() {
  if (process.env.MESSAGING_ENABLED === 'false') return;

  try {
    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    // Ensure the exchange and queue exist
    await channel.assertExchange(exchangeName, 'topic', { durable: true });
    await channel.assertQueue(queueName, { durable: true });

    // Bind the queue to listen ONLY for 'user.registered' events
    await channel.bindQueue(queueName, exchangeName, 'user.registered');

    console.log(`[user-service] RabbitMQ consumer ready. Listening for 'user.registered'`);

    channel.consume(queueName, async (msg) => {
      if (!msg) return;

      try {
        const envelope = JSON.parse(msg.content.toString());
        const { type, payload } = envelope;

        if (type === 'user.registered') {
          console.log(`[user-service] Received user.registered for ID: ${payload.userId}`);
          
          // Create the User Profile using the ID sent by the Auth Service!
          await prisma.user.create({
            data: {
              id: payload.userId, // MUST use the exact ID from Auth
              email: payload.email,
              firstName: payload.firstName || '',
              lastName: payload.lastName || '',
              phone: payload.phone || null,
              role: payload.role,
              authProvider: payload.authProvider || 'LOCAL',
            },
          });
        }

        channel.ack(msg); // Tell RabbitMQ we successfully processed it
      } catch (err) {
        console.error(`[user-service] Error processing message:`, err);
        // If it fails (e.g. database down), do not ack so RabbitMQ retries it later
      }
    });
  } catch (error) {
    console.warn(`[user-service] RabbitMQ not ready. Retrying in 5s...`);
    setTimeout(startRabbitConsumer, 5000);
  }
}
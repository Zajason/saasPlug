import amqp from 'amqplib';
import prisma from '../prisma/client.ts';

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? 'saasplug.events';
const queueName = 'analytics-service.events';

function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

async function bumpMetric(
  providerId: number | null,
  chargerId: number | null,
  metricName: string,
  delta: number,
  timeBucket: Date,
  period: string = 'DAILY',
) {
  const existing = await prisma.aggregatedMetric.findFirst({
    where: { providerId, chargerId, metricName, timeBucket, period },
  });
  if (existing) {
    await prisma.aggregatedMetric.update({
      where: { id: existing.id },
      data: { value: { increment: delta } },
    });
  } else {
    await prisma.aggregatedMetric.create({
      data: { providerId, chargerId, metricName, value: delta, timeBucket, period },
    });
  }
}

export async function startRabbitConsumer() {
  if (process.env.MESSAGING_ENABLED === 'false') return;

  try {
    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    await channel.assertExchange(exchangeName, 'topic', { durable: true });
    await channel.assertQueue(queueName, { durable: true });

    await channel.bindQueue(queueName, exchangeName, 'provider.registered');
    await channel.bindQueue(queueName, exchangeName, 'session.stopped');
    await channel.bindQueue(queueName, exchangeName, 'reservation.created');
    await channel.bindQueue(queueName, exchangeName, 'billing.provider_invoice.created');
    await channel.bindQueue(queueName, exchangeName, 'billing.provider_invoice.paid');

    console.log(`[analytics-service] RabbitMQ consumer ready. Listening on queue: ${queueName}`);

    channel.consume(queueName, async (msg) => {
      if (!msg) return;

      try {
        const envelope = JSON.parse(msg.content.toString());
        const { type, payload } = envelope;

        if (type === 'provider.registered') {
          const providerId = payload.providerId != null ? Number(payload.providerId) : null;
          const userId = payload.userId != null ? Number(payload.userId) : null;

          if (!providerId || !userId) {
            console.warn(`[analytics-service] provider.registered: missing providerId or userId`, payload);
            channel.ack(msg);
            return;
          }

          // Ensure Provider exists in analytics DB (same ID as provider-service)
          const existingProvider = await prisma.provider.findUnique({ where: { id: providerId } });
          if (!existingProvider) {
            await prisma.provider.create({
              data: {
                id: providerId,
                name: String(payload.providerName ?? `Provider ${providerId}`),
                contactEmail: String(payload.contactEmail ?? `provider-${providerId}@saasplug.local`),
                status: (payload.status as any) ?? 'PENDING',
              },
            });
          }

          // Ensure ProviderAccount exists so resolveProviderId works
          await prisma.providerAccount.upsert({
            where: { userId },
            update: { providerId },
            create: { userId, providerId, role: 'OWNER' },
          });

          console.log(`[analytics-service] provider.registered: synced provider ${providerId}, user ${userId}`);
        }

        else if (type === 'session.stopped') {
          const providerId = payload.providerId != null ? Number(payload.providerId) : null;
          const chargerId = Number.isInteger(Number(payload.chargerId)) ? Number(payload.chargerId) : null;
          const kWh = Number(payload.kWh ?? 0);
          const costEur = Number(payload.costEur ?? 0);
          const day = startOfUtcDay(new Date(payload.endedAt ?? Date.now()));

          await bumpMetric(providerId, null, 'SESSION_COUNT', 1, day);
          await bumpMetric(providerId, null, 'TOTAL_KWH', kWh, day);
          await bumpMetric(providerId, null, 'REVENUE_EUR', costEur, day);

          if (chargerId !== null) {
            await bumpMetric(providerId, chargerId, 'SESSION_COUNT', 1, day);
            await bumpMetric(providerId, chargerId, 'TOTAL_KWH', kWh, day);
            await bumpMetric(providerId, chargerId, 'REVENUE_EUR', costEur, day);
          }

          console.log(`[analytics-service] session.stopped: +1 session, +${kWh} kWh, +€${costEur} for provider ${providerId}`);
        }

        else if (type === 'reservation.created') {
          const providerId = payload.providerId != null ? Number(payload.providerId) : null;
          const day = startOfUtcDay(new Date(payload.startsAt ?? Date.now()));

          await bumpMetric(providerId, null, 'RESERVATION_COUNT', 1, day);

          console.log(`[analytics-service] reservation.created: +1 reservation for provider ${providerId}`);
        }

        else if (type === 'billing.provider_invoice.created') {
          const providerId = payload.providerId != null ? Number(payload.providerId) : null;
          const totalEur = Number(payload.totalEur ?? 0);
          const day = startOfUtcDay(new Date(payload.dueDate ?? Date.now()));

          await bumpMetric(providerId, null, 'PROVIDER_INVOICE_COUNT', 1, day);
          await bumpMetric(providerId, null, 'PROVIDER_INVOICE_TOTAL_EUR', totalEur, day);

          console.log(`[analytics-service] provider_invoice.created: provider ${providerId} +1 invoice (€${totalEur})`);
        }

        else if (type === 'billing.provider_invoice.paid') {
          const providerId = payload.providerId != null ? Number(payload.providerId) : null;
          const amountEur = Number(payload.amountEur ?? 0);
          const day = startOfUtcDay(new Date(payload.paidAt ?? Date.now()));

          await bumpMetric(providerId, null, 'PROVIDER_REVENUE_EUR', amountEur, day);

          console.log(`[analytics-service] provider_invoice.paid: provider ${providerId} +€${amountEur} revenue`);
        }

        channel.ack(msg);
      } catch (err) {
        console.error(`[analytics-service] Error processing message:`, err);
        // Do not ack so RabbitMQ retries
      }
    });
  } catch (error) {
    console.warn(`[analytics-service] RabbitMQ not ready. Retrying in 5s...`);
    setTimeout(startRabbitConsumer, 5000);
  }
}

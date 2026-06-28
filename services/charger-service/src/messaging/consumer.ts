import amqp from 'amqplib';
import { ChargerStatus } from '@prisma/client';
import prisma from '../prisma/client.ts';

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? 'saasplug.events';
const queueName = 'charger-service.events';

export async function startRabbitConsumer() {
  if (process.env.MESSAGING_ENABLED === 'false') return;

  try {
    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    await channel.assertExchange(exchangeName, 'topic', { durable: true });
    await channel.assertQueue(queueName, { durable: true });

    // Charger status follows the reservation and session lifecycle
    await channel.bindQueue(queueName, exchangeName, 'reservation.created');
    await channel.bindQueue(queueName, exchangeName, 'reservation.cancelled');
    await channel.bindQueue(queueName, exchangeName, 'reservation.expired');
    await channel.bindQueue(queueName, exchangeName, 'session.started');
    await channel.bindQueue(queueName, exchangeName, 'session.stopped');
    // Charger catalog: integration-service publishes one event per external charger sync
    await channel.bindQueue(queueName, exchangeName, 'charger.upserted');

    console.log(`[charger-service] RabbitMQ consumer ready. Listening on queue: ${queueName}`);

    channel.consume(queueName, async (msg) => {
      if (!msg) return;

      try {
        const envelope = JSON.parse(msg.content.toString());
        const { type, payload } = envelope;

        // --- HANDLE EXTERNAL CHARGER SYNC (upsert by providerId + name) ---
        if (type === 'charger.upserted') {
          const providerId = payload.providerId != null ? Number(payload.providerId) : null;
          const name = String(payload.name ?? '').trim();
          if (!providerId || !name) {
            console.warn(`[charger-service] charger.upserted: missing providerId or name`, payload);
            channel.ack(msg);
            return;
          }

          const existing = await prisma.charger.findFirst({ where: { providerId, name } });
          const data = {
            providerName: String(payload.providerName ?? 'Unknown'),
            providerId,
            name,
            address: payload.address ?? null,
            lat: Number(payload.lat),
            lng: Number(payload.lng),
            connectorType: payload.connectorType,
            maxKW: Number(payload.maxKW ?? 0),
            status: payload.status ?? ChargerStatus.AVAILABLE,
            kwhprice: Number(payload.kwhPrice ?? 0.25),
          };

          if (existing) {
            // Do not overwrite OUTAGE — operator may have flagged it out of service
            const shouldUpdateStatus = existing.status !== ChargerStatus.OUTAGE;
            await prisma.charger.update({
              where: { id: existing.id },
              data: shouldUpdateStatus ? data : { ...data, status: existing.status },
            });
            console.log(`[charger-service] charger.upserted: updated charger ${existing.id} (${name})`);
          } else {
            const created = await prisma.charger.create({ data });
            console.log(`[charger-service] charger.upserted: created charger ${created.id} (${name})`);
          }

          channel.ack(msg);
          return;
        }

        // --- HANDLE RESERVATION & SESSION LIFECYCLE (status updates) ---
        const chargerId = Number(payload?.chargerId);
        if (!Number.isInteger(chargerId)) {
          console.warn(`[charger-service] Skipping ${type}: invalid chargerId`, payload?.chargerId);
          channel.ack(msg);
          return;
        }

        let nextStatus: ChargerStatus | null = null;

        if (type === 'reservation.created' || type === 'session.started') {
          nextStatus = ChargerStatus.IN_USE;
        } else if (type === 'reservation.cancelled' || type === 'reservation.expired' || type === 'session.stopped') {
          nextStatus = ChargerStatus.AVAILABLE;
        }

        if (nextStatus) {
          await prisma.charger.updateMany({
            where: { id: chargerId, status: { not: ChargerStatus.OUTAGE } },
            data: { status: nextStatus },
          });
          console.log(`[charger-service] ${type}: charger ${chargerId} -> ${nextStatus}`);
        }

        channel.ack(msg);
      } catch (err) {
        console.error(`[charger-service] Error processing message:`, err);
        // Do not ack so RabbitMQ retries
      }
    });
  } catch (error) {
    console.warn(`[charger-service] RabbitMQ not ready. Retrying in 5s...`);
    setTimeout(startRabbitConsumer, 5000);
  }
}

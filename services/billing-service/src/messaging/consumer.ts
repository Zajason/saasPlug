import amqp from 'amqplib';
import { PaymentStatus } from '@prisma/client';
import prisma from '../prisma/client.js';
import stripe from '../services/stripe.js';
import { captureOrRecharge, chargeSession } from '../controllers/paymentController.js';

const rabbitUrl = process.env.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
const exchangeName = process.env.RABBITMQ_EXCHANGE ?? 'saasplug.events';
const queueName = 'billing-service.events';

export async function startRabbitConsumer() {
  if (process.env.MESSAGING_ENABLED === 'false') return;

  try {
    const connection = await amqp.connect(rabbitUrl);
    const channel = await connection.createChannel();

    await channel.assertExchange(exchangeName, 'topic', { durable: true });
    await channel.assertQueue(queueName, { durable: true });

    // The Billing service wants to know when Users AND Providers register
    await channel.bindQueue(queueName, exchangeName, 'user.registered');
    await channel.bindQueue(queueName, exchangeName, 'provider.registered');
    // Session lifecycle: when a session stops we capture the pre-auth and invoice
    await channel.bindQueue(queueName, exchangeName, 'session.stopped');

    console.log(`[billing-service] RabbitMQ consumer ready. Listening on queue: ${queueName}`);

    channel.consume(queueName, async (msg) => {
      if (!msg) return;

      try {
        const envelope = JSON.parse(msg.content.toString());
        const { type, payload } = envelope;

        // --- HANDLE NEW USER REGISTRATION ---
        if (type === 'user.registered') {
          console.log(`[billing-service] Setting up billing for new user ID: ${payload.userId}`);
          
          // 1. Create the Stripe Customer
          let stripeCustomerId = `mock_cus_${Math.random().toString(36).substring(7)}`;
          const hasRealStripeKey = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_replace_me';
          
          if (hasRealStripeKey) {
            const customer = await stripe.customers.create({
              email: payload.email,
              metadata: { appUserId: String(payload.userId), role: payload.role },
            });
            stripeCustomerId = customer.id;
          }

          // 2. Save it to the CustomerBilling table. Upsert keeps replayed
          // RabbitMQ messages and seeded users idempotent.
          await prisma.customerBilling.upsert({
            where: { userId: payload.userId },
            update: { stripeCustomerId },
            create: {
              userId: payload.userId,
              stripeCustomerId,
              outstandingBalanceEur: 0,
            },
          });
        }

        // --- HANDLE NEW PROVIDER REGISTRATION ---
        else if (type === 'provider.registered') {
          console.log(`[billing-service] Setting up billing for new provider ID: ${payload.providerId}`);

          // 1. Create a Stripe Customer for the provider company
          let stripeCustomerId = `mock_cus_provider_${Math.random().toString(36).substring(7)}`;
          const hasRealStripeKey = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_replace_me';

          if (hasRealStripeKey) {
            const customer = await stripe.customers.create({
              name: payload.providerName,
              email: payload.contactEmail,
              phone: payload.contactPhone ?? undefined,
              metadata: {
                appProviderId: String(payload.providerId),
                appUserId: String(payload.userId),
              },
            });
            stripeCustomerId = customer.id;
          }

          // 2. Upsert the local Provider record with Stripe info
          await prisma.provider.upsert({
            where: { id: payload.providerId },
            update: {
              name: payload.providerName,
              legalName: payload.legalName ?? null,
              contactEmail: payload.contactEmail,
              contactPhone: payload.contactPhone ?? null,
              country: payload.country ?? null,
              status: payload.status,
              stripeCustomerId,
            },
            create: {
              id: payload.providerId,
              name: payload.providerName,
              legalName: payload.legalName ?? null,
              contactEmail: payload.contactEmail,
              contactPhone: payload.contactPhone ?? null,
              country: payload.country ?? null,
              status: payload.status,
              stripeCustomerId,
            },
          });
        }

        // --- HANDLE SESSION STOPPED: capture pre-auth + create invoice ---
        else if (type === 'session.stopped') {
          const sessionId = Number(payload.sessionId);
          const userId = Number(payload.userId);
          const costEur = Number(payload.costEur ?? 0);

          if (!Number.isInteger(sessionId) || !Number.isInteger(userId)) {
            console.warn(`[billing-service] session.stopped: invalid sessionId/userId`, payload);
            channel.ack(msg);
            return;
          }

          // Idempotency: if we already captured for this session, skip
          const existingAuth = await prisma.paymentAuth.findUnique({ where: { sessionId } });
          if (existingAuth?.status === PaymentStatus.CAPTURED) {
            console.log(`[billing-service] session.stopped: session ${sessionId} already captured, skipping`);
            channel.ack(msg);
            return;
          }

          console.log(`[billing-service] session.stopped: billing session ${sessionId} for €${costEur}`);

          if (existingAuth?.providerRef) {
            // Pre-auth was created at reservation time — capture or recharge as needed
            await captureOrRecharge(existingAuth.providerRef, costEur, sessionId, userId);
          } else {
            // No pre-auth (edge case: session without prior reservation) — charge directly
            await chargeSession(sessionId, costEur, userId);
          }
        }

        channel.ack(msg);
      } catch (err) {
        console.error(`[billing-service] Error processing message:`, err);
        // Do not ack so it retries
      }
    });
  } catch (error) {
    console.warn(`[billing-service] RabbitMQ not ready. Retrying in 5s...`);
    setTimeout(startRabbitConsumer, 5000);
  }
}

import { Request, Response } from 'express';
import { PaymentStatus } from '@prisma/client';
import prisma from '../prisma/client.js';
import stripe from '../services/stripe.js';
import { z } from 'zod';

// --- SCHEMAS ---
const setupIntentSchema = z.object({});

const saveMethodSchema = z.object({
  paymentMethodId: z.string().min(1, 'paymentMethodId is required'),
  provider: z.string().optional(),
  tokenLast4: z.string().optional(),
});

const executePaymentSchema = z.object({
  sessionId: z.number().int().positive(),
  amountEur: z.number().positive(), // Made this strictly required now!
});

// --- HELPER ---
const ensureStripeCustomer = async (userId: number) => {
  const billingProfile = await prisma.customerBilling.findUnique({
    where: { userId } 
  });

  if (billingProfile?.stripeCustomerId) {
    return billingProfile.stripeCustomerId;
  }

  const hasRealStripeKey = process.env.STRIPE_SECRET_KEY && process.env.STRIPE_SECRET_KEY !== 'sk_test_replace_me';
  let stripeCustomerId = `mock_cus_${userId}`;

  if (hasRealStripeKey) {
    const customer = await stripe.customers.create({
      metadata: { appUserId: String(userId) },
    });
    stripeCustomerId = customer.id;
  }

  await prisma.customerBilling.upsert({
    where: { userId },
    update: { stripeCustomerId },
    create: { userId, stripeCustomerId, outstandingBalanceEur: 0 },
  });

  return stripeCustomerId;
};

// --- CONTROLLERS ---

export const createSetupIntent = async (req: Request, res: Response) => {
  const parseResult = setupIntentSchema.safeParse(req.body);
  if (!parseResult.success) {
    return res.status(400).json({ error: z.treeifyError(parseResult.error) });
  }

  try {
    const userId = req.userId!;
    const customerId = await ensureStripeCustomer(userId);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      usage: 'off_session',
    });

    return res.status(201).json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    console.error('createSetupIntent error:', error);
    return res.status(500).json({ error: 'Failed to create setup intent' });
  }
};

export const savePaymentMethod = async (req: Request, res: Response) => {
  const parsed = saveMethodSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const userId = req.userId!;
    const { paymentMethodId, provider, tokenLast4 } = parsed.data;

    // --- MOCK FLOW ---
    if (provider === 'mock') {
        const mockLast4 = tokenLast4 || '4242';
        const savedMethod = await prisma.paymentMethod.upsert({
            where: { stripePaymentMethodId: paymentMethodId },
            update: { tokenLast4: mockLast4, status: 'valid', userId, provider: 'stripe' },
            create: { userId, provider: 'stripe', tokenLast4: mockLast4, stripePaymentMethodId: paymentMethodId, status: 'valid' },
        });
        return res.status(201).json({ paymentMethod: savedMethod });
    }

    // --- REAL FLOW ---
    const customerId = await ensureStripeCustomer(userId);

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!paymentMethod || paymentMethod.type !== 'card') {
      return res.status(400).json({ error: 'Unsupported payment method type' });
    }

    if (paymentMethod.customer && paymentMethod.customer !== customerId) {
      return res.status(409).json({ error: 'Payment method already linked to another customer' });
    }

    if (!paymentMethod.customer) {
      await stripe.paymentMethods.attach(paymentMethodId, { customer: customerId });
    }

    const card = paymentMethod.card;
    const last4 = card?.last4 ?? '****';

    const existing = await prisma.paymentMethod.findUnique({ where: { stripePaymentMethodId: paymentMethodId } });
    if (existing && existing.userId !== userId) {
      return res.status(409).json({ error: 'Payment method already saved for another user' });
    }

    const savedMethod = await prisma.paymentMethod.upsert({
      where: { stripePaymentMethodId: paymentMethodId },
      update: { tokenLast4: last4, status: 'valid', userId },
      create: { userId, provider: 'stripe', tokenLast4: last4, stripePaymentMethodId: paymentMethodId, status: 'valid' },
    });

    return res.status(201).json({ paymentMethod: savedMethod });
  } catch (error) {
    console.error('savePaymentMethod error:', error);
    return res.status(500).json({ error: 'Failed to save payment method' });
  }
};

export const listPaymentMethods = async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    await ensureStripeCustomer(userId);

    const methods = await prisma.paymentMethod.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return res.json(methods);
  } catch (error) {
    console.error('listPaymentMethods error:', error);
    return res.status(500).json({ error: 'Failed to load payment methods' });
  }
};

export const deletePaymentMethod = async (req: Request, res: Response) => {
  const methodId = Number(req.params.id);
  if (!Number.isInteger(methodId) || methodId <= 0) {
    return res.status(400).json({ error: 'Invalid payment method id' });
  }

  try {
    const userId = req.userId!;
    const method = await prisma.paymentMethod.findUnique({ where: { id: methodId } });
    if (!method || method.userId !== userId) {
      return res.status(404).json({ error: 'Payment method not found' });
    }

    await prisma.paymentMethod.delete({ where: { id: methodId } });
    return res.status(204).send();
  } catch (error) {
    console.error('deletePaymentMethod error:', error);
    return res.status(500).json({ error: 'Failed to delete payment method' });
  }
};

/* ── Pre-auth helpers for reservation flow ── */

export const preAuthorize = async (userId: number, amountEur: number = 3) => {
  const customerId = await ensureStripeCustomer(userId);

  const methods = await prisma.paymentMethod.findMany({
    where: { userId, status: 'valid', stripePaymentMethodId: { not: null }, provider: 'stripe' },
    orderBy: { createdAt: 'desc' },
  });

  const defaultMethod = methods[0];
  if (!defaultMethod?.stripePaymentMethodId) {
    throw new Error('You must add a payment method before reserving. Go to Billing to add a card.');
  }

  // MOCK CHECK
  if (defaultMethod.stripePaymentMethodId.startsWith('mock_')) {
      return { id: 'pi_mock_preauth_' + Date.now(), status: 'succeeded', client_secret: 'mock_secret' } as any;
  }

  const intent = await stripe.paymentIntents.create({
    customer: customerId,
    payment_method: defaultMethod.stripePaymentMethodId,
    amount: Math.round(amountEur * 100),
    currency: 'eur',
    capture_method: 'manual',
    confirm: true,
    off_session: true,
  });

  return intent;
};

export const cancelPreAuth = async (paymentIntentId: string) => {
  if (paymentIntentId.startsWith('pi_mock_')) return;
  try {
    await stripe.paymentIntents.cancel(paymentIntentId);
  } catch (err: any) {
    if (err.code !== 'payment_intent_unexpected_state') throw err;
  }
};

export const captureOrRecharge = async (paymentIntentId: string, finalAmountEur: number, sessionId: number, userId: number) => {
  const PRE_AUTH_AMOUNT = 3;
  const chargeAmount = Math.max(finalAmountEur, PRE_AUTH_AMOUNT);

  // MOCK CHECK
  if (paymentIntentId.startsWith('pi_mock_')) {
      await prisma.paymentAuth.upsert({
        where: { sessionId },
        update: { userId, amountEur: chargeAmount, providerRef: paymentIntentId, status: PaymentStatus.CAPTURED },
        create: { userId, sessionId, amountEur: chargeAmount, providerRef: paymentIntentId, status: PaymentStatus.CAPTURED },
      });

      await prisma.invoice.upsert({
        where: { sessionId },
        update: { totalEur: chargeAmount },
        create: { userId, sessionId, pdfUrl: 'pending', totalEur: chargeAmount },
      });
      return { status: 'succeeded', id: paymentIntentId } as any;
  }

  if (chargeAmount <= PRE_AUTH_AMOUNT) {
    const intent = await stripe.paymentIntents.capture(paymentIntentId, {
      amount_to_capture: Math.round(chargeAmount * 100),
    });

    const status = intent.status === 'succeeded' ? PaymentStatus.CAPTURED : PaymentStatus.PREAUTHORIZED;

    await prisma.paymentAuth.upsert({
      where: { sessionId },
      update: { userId, amountEur: chargeAmount, providerRef: intent.id, status },
      create: { userId, sessionId, amountEur: chargeAmount, providerRef: intent.id, status },
    });

    if (status === PaymentStatus.CAPTURED) {
      await prisma.invoice.upsert({
        where: { sessionId },
        update: { totalEur: chargeAmount },
        create: { userId, sessionId, pdfUrl: 'pending', totalEur: chargeAmount },
      });
    }

    return intent;
  }

  // Amount exceeds pre-auth: capture the 3 EUR first, then charge the remainder
  const capturedIntent = await stripe.paymentIntents.capture(paymentIntentId, {
    amount_to_capture: Math.round(PRE_AUTH_AMOUNT * 100),
  });

  await prisma.paymentAuth.upsert({
    where: { sessionId },
    update: { userId, amountEur: PRE_AUTH_AMOUNT, providerRef: capturedIntent.id, status: PaymentStatus.CAPTURED },
    create: { userId, sessionId, amountEur: PRE_AUTH_AMOUNT, providerRef: capturedIntent.id, status: PaymentStatus.CAPTURED },
  });

  const remainderEur = parseFloat((chargeAmount - PRE_AUTH_AMOUNT).toFixed(2));

  try {
    const remainderIntent = await chargeSession(sessionId, remainderEur, userId);

    await prisma.invoice.upsert({
      where: { sessionId },
      update: { totalEur: chargeAmount },
      create: { userId, sessionId, pdfUrl: 'pending', totalEur: chargeAmount },
    });

    return remainderIntent;
  } catch (remainderErr) {
    console.error('[captureOrRecharge] remainder charge failed:', remainderErr);

    // FIXED: Added await and changed `id` to `userId`
    await prisma.customerBilling.update({
      where: { userId }, 
      data: { outstandingBalanceEur: { increment: remainderEur } },
    });

    await prisma.invoice.upsert({
      where: { sessionId },
      update: { totalEur: PRE_AUTH_AMOUNT },
      create: { userId, sessionId, pdfUrl: 'pending', totalEur: PRE_AUTH_AMOUNT },
    });

    return { status: 'partial', id: capturedIntent.id, outstandingBalanceEur: remainderEur } as any;
  }
};

export const chargeSession = async (sessionId: number, amountEur: number, userId: number) => {
  const customerId = await ensureStripeCustomer(userId);
  const methods = await prisma.paymentMethod.findMany({
    where: { userId, status: 'valid', provider: 'stripe', stripePaymentMethodId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });

  const defaultMethod = methods[0];
  if (!defaultMethod?.stripePaymentMethodId) throw new Error('No valid Stripe payment method found');

  if (defaultMethod.stripePaymentMethodId.startsWith('mock_')) {
      const mockIntentId = 'pi_mock_charge_' + sessionId;
      
      await prisma.paymentAuth.upsert({
        where: { sessionId },
        update: { userId, amountEur, providerRef: mockIntentId, status: PaymentStatus.CAPTURED },
        create: { userId, sessionId, amountEur, providerRef: mockIntentId, status: PaymentStatus.CAPTURED },
      });

      await prisma.invoice.upsert({
        where: { sessionId },
        update: { totalEur: amountEur },
        create: { userId, sessionId, pdfUrl: 'pending', totalEur: amountEur },
      });

      return { id: mockIntentId, status: 'succeeded' } as any;
  }

  const amountCents = Math.round(amountEur * 100);

  try {
    const intent = await stripe.paymentIntents.create({
      customer: customerId,
      payment_method: defaultMethod.stripePaymentMethodId,
      amount: amountCents,
      currency: 'eur',
      confirm: true,
      off_session: true,
    });

    const status = intent.status === 'succeeded' ? PaymentStatus.CAPTURED : PaymentStatus.PREAUTHORIZED;

    await prisma.paymentAuth.upsert({
      where: { sessionId },
      update: { userId, amountEur, providerRef: intent.id, status },
      create: { userId, sessionId, amountEur, providerRef: intent.id, status },
    });

    if (status === PaymentStatus.CAPTURED) {
      await prisma.invoice.upsert({
        where: { sessionId },
        update: { totalEur: amountEur },
        create: { userId, sessionId, pdfUrl: 'pending', totalEur: amountEur },
      });
    }

    return intent;
  } catch (error) {
    await prisma.paymentAuth.upsert({
      where: { sessionId },
      update: { userId, amountEur, status: PaymentStatus.FAILED },
      create: { userId, sessionId, amountEur, status: PaymentStatus.FAILED },
    });
    throw error;
  }
};

export const executePayment = async (req: Request, res: Response) => {
  const parsed = executePaymentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const userId = req.userId!;
    const { sessionId, amountEur } = parsed.data;

    // DELETED: The prisma.session.findUnique block that checked the Session table.
    // The Session Service will now trigger this endpoint and pass the exact amountEur to charge.

    const intent = await chargeSession(sessionId, amountEur, userId);

    return res.status(201).json({
      paymentIntentId: intent.id,
      status: intent.status,
      amountEur: amountEur,
    });
  } catch (error: any) {
    console.error('executePayment error:', error);
    return res.status(502).json({ error: 'Payment attempt failed', details: error?.message });
  }
};

export const listBillingHistory = async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;
    const invoices = await prisma.invoice.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
    return res.json({ invoices });
  } catch (error: any) {
    console.error('listBillingHistory error:', error);
    return res.status(500).json({ error: 'Failed to load billing history' });
  }
};

export const payOutstandingBalance = async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    await ensureStripeCustomer(userId);
    const billingProfile = await prisma.customerBilling.findUniqueOrThrow({ where: { userId } });
    const balance = Number(billingProfile.outstandingBalanceEur);
    
    if (balance <= 0) {
      return res.status(400).json({ error: 'No outstanding balance' });
    }

    const customerId = await ensureStripeCustomer(userId);

    const methods = await prisma.paymentMethod.findMany({
      where: { userId, status: 'valid', provider: 'stripe', stripePaymentMethodId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });

    const defaultMethod = methods[0];
    if (!defaultMethod?.stripePaymentMethodId) {
      return res.status(400).json({ error: 'No valid payment method found. Please add a card first.' });
    }

    if (defaultMethod.stripePaymentMethodId.startsWith('mock_')) {
      // FIXED: Added await and changed `id` to `userId`
      await prisma.customerBilling.update({
        where: { userId },
        data: { outstandingBalanceEur: 0 },
      });
      return res.json({ status: 'succeeded', amountEur: balance, outstandingBalanceEur: 0 });
    }

    const intent = await stripe.paymentIntents.create({
      customer: customerId,
      payment_method: defaultMethod.stripePaymentMethodId,
      amount: Math.round(balance * 100),
      currency: 'eur',
      confirm: true,
      off_session: true,
    });

    if (intent.status === 'succeeded') {
      // FIXED: Added await and changed `id` to `userId`
      await prisma.customerBilling.update({
        where: { userId },
        data: { outstandingBalanceEur: 0 },
      });
      return res.json({ status: 'succeeded', amountEur: balance, outstandingBalanceEur: 0 });
    }

    return res.status(402).json({ error: 'Payment failed', stripeStatus: intent.status });
  } catch (error: any) {
    console.error('payOutstandingBalance error:', error);
    return res.status(502).json({ error: 'Payment failed', details: error?.message });
  }
};

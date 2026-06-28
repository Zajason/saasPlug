import { Request, Response } from "express";
import {
  ProviderInvoiceStatus,
  ProviderPaymentStatus,
  ProviderPlan,
  ProviderSubscription,
  SubscriptionStatus,
} from "@prisma/client";
import { z } from "zod";
import prisma from "../prisma/client.js";
import { publishDomainEvent } from "../messaging/rabbitmq.ts";
import stripe from "../services/stripe.js";

const providerInvoiceStatuses = Object.values(ProviderInvoiceStatus) as [ProviderInvoiceStatus, ...ProviderInvoiceStatus[]];

const listProviderInvoicesQuerySchema = z.object({
  status: z.enum(providerInvoiceStatuses).optional(),
  providerId: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const providerInvoiceIdSchema = z.object({
  id: z.coerce.number().int().positive(),
});

const startProviderSubscriptionBodySchema = z.object({
  planCode: z.string().min(1).default("PRO").optional(),
});

const confirmProviderPaymentBodySchema = z.object({
  paymentIntentId: z.string().min(1),
});

// Resolves the caller to a real Provider.id.
// - PLATFORM_OPERATOR may target any provider via ?providerId=.
// - A PROVIDER_ADMIN is mapped to their own provider through ProviderAccount.
// Returns null when the caller has no linked provider.
const resolveProviderId = async (
  req: Request,
  requestedProviderId?: number,
): Promise<number | null> => {
  if (req.userRole === "PLATFORM_OPERATOR" && requestedProviderId) {
    return requestedProviderId;
  }

  const account = await prisma.providerAccount.findUnique({
    where: { userId: req.userId! },
  });
  return account?.providerId ?? null;
};

const loadProviderNameMap = async (providerIds: number[]) => {
  const uniqueIds = [...new Set(providerIds)];
  if (uniqueIds.length === 0) return new Map<number, string>();

  const providers = await prisma.provider.findMany({
    where: { id: { in: uniqueIds } },
    select: { id: true, name: true },
  });

  return new Map(providers.map((provider) => [provider.id, provider.name]));
};

const serializeProviderPlan = (plan: ProviderPlan) => ({
  id: plan.id,
  code: plan.code,
  name: plan.name,
  monthlyFeeEur: Number(plan.monthlyFeeEur),
  perSessionFeeEur: Number(plan.perSessionFeeEur),
  features: plan.features,
  active: plan.active,
});

const serializeProviderSubscription = (
  subscription: (ProviderSubscription & { plan?: ProviderPlan }) | null,
) => {
  if (!subscription) return null;

  return {
    id: subscription.id,
    providerId: subscription.providerId,
    planId: subscription.planId,
    status: subscription.status,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
    currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
    startedAt: subscription.startedAt.toISOString(),
    endedAt: subscription.endedAt?.toISOString() ?? null,
    plan: subscription.plan ? serializeProviderPlan(subscription.plan) : null,
  };
};

const serializeProviderInvoice = (invoice: any, providerNames?: Map<number, string>) => ({
  id: invoice.id,
  providerId: invoice.providerId,
  providerName: providerNames?.get(invoice.providerId) ?? invoice.providerName ?? null,
  invoiceNumber: invoice.invoiceNumber,
  periodStart: invoice.periodStart.toISOString(),
  periodEnd: invoice.periodEnd.toISOString(),
  status: invoice.status,
  subtotalEur: Number(invoice.subtotalEur),
  taxEur: Number(invoice.taxEur),
  totalEur: Number(invoice.totalEur),
  dueDate: invoice.dueDate.toISOString(),
  paidAt: invoice.paidAt ? invoice.paidAt.toISOString() : null,
  createdAt: invoice.createdAt.toISOString(),
  updatedAt: invoice.updatedAt.toISOString(),
  usageRecordCount: invoice._count?.usageRecords ?? invoice.usageRecords?.length ?? 0,
  paymentCount: invoice._count?.payments ?? invoice.payments?.length ?? 0,
});

const serializeProviderInvoiceDetail = (invoice: any) => ({
  ...serializeProviderInvoice(invoice),
  usageRecords: invoice.usageRecords.map((record: any) => ({
    id: record.id,
    providerId: record.providerId,
    invoiceId: record.invoiceId,
    sourceType: record.sourceType,
    sourceId: record.sourceId,
    quantity: record.quantity,
    amountEur: Number(record.amountEur),
    occurredAt: record.occurredAt.toISOString(),
    metadata: record.metadata,
    createdAt: record.createdAt.toISOString(),
  })),
  payments: invoice.payments.map((payment: any) => ({
    id: payment.id,
    providerId: payment.providerId,
    invoiceId: payment.invoiceId,
    amountEur: Number(payment.amountEur),
    providerRef: payment.providerRef,
    status: payment.status,
    paidAt: payment.paidAt ? payment.paidAt.toISOString() : null,
    createdAt: payment.createdAt.toISOString(),
    updatedAt: payment.updatedAt.toISOString(),
  })),
});

const ensureDefaultProviderPlans = async () => {
  await prisma.providerPlan.upsert({
    where: { code: "PRO" },
    update: {},
    create: {
      code: "PRO",
      name: "Professional",
      monthlyFeeEur: 99,
      perSessionFeeEur: 0.25,
      features: ["analytics", "exports", "api-sync"],
    },
  });

  await prisma.providerPlan.upsert({
    where: { code: "BASIC" },
    update: {},
    create: {
      code: "BASIC",
      name: "Basic",
      monthlyFeeEur: 29,
      perSessionFeeEur: 0.4,
      features: ["provider-console", "basic-api-sync"],
    },
  });
};

const currentUtcMonth = () => {
  const now = new Date();
  const periodStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
  const dueDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 15, 0, 0, 0, 0));
  const periodKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return { periodStart, periodEnd, dueDate, periodKey };
};

const ensureProviderSubscriptionInvoice = async (providerId: number, plan: ProviderPlan) => {
  const { periodStart, periodEnd, dueDate, periodKey } = currentUtcMonth();
  const invoiceNumber = `PINV-SUB-${providerId}-${periodKey}`;
  const amountEur = Number(plan.monthlyFeeEur);

  const invoice = await prisma.providerInvoice.upsert({
    where: { invoiceNumber },
    update: {},
    create: {
      providerId,
      invoiceNumber,
      periodStart,
      periodEnd,
      status: ProviderInvoiceStatus.OPEN,
      subtotalEur: amountEur,
      taxEur: 0,
      totalEur: amountEur,
      dueDate,
      usageRecords: {
        create: {
          providerId,
          sourceType: "MONTHLY_SUBSCRIPTION",
          sourceId: plan.id,
          quantity: 1,
          amountEur,
          occurredAt: periodStart,
          metadata: {
            planCode: plan.code,
            planName: plan.name,
            description: `${plan.name} monthly platform subscription`,
          },
        },
      },
    },
    include: {
      usageRecords: { orderBy: { occurredAt: "desc" } },
      payments: { orderBy: { createdAt: "desc" } },
    },
  });

  return invoice;
};

const ensureStripeCustomer = async (providerId: number) => {
  const provider = await prisma.provider.findUniqueOrThrow({ where: { id: providerId } });
  if (provider.stripeCustomerId) return provider.stripeCustomerId;

  const customer = await stripe.customers.create({
    name: provider.legalName ?? provider.name,
    email: provider.contactEmail,
    metadata: { providerId: String(provider.id) },
  });

  await prisma.provider.update({
    where: { id: provider.id },
    data: { stripeCustomerId: customer.id },
  });

  return customer.id;
};

const stripeUnixDate = (value?: number | null) => (value ? new Date(value * 1000) : null);

export const listProviderInvoices = async (req: Request, res: Response) => {
  const parsed = listProviderInvoicesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const providerId = await resolveProviderId(req, parsed.data.providerId);
    const isOperatorWideView = req.userRole === "PLATFORM_OPERATOR" && !parsed.data.providerId;

    const invoices = await prisma.providerInvoice.findMany({
      where: {
        ...(isOperatorWideView ? {} : providerId === null ? { providerId: -1 } : { providerId }),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: parsed.data.limit,
      include: {
        _count: {
          select: {
            usageRecords: true,
            payments: true,
          },
        },
      },
    });

    const providerNames = await loadProviderNameMap(invoices.map((invoice) => invoice.providerId));

    return res.json({ invoices: invoices.map((invoice) => serializeProviderInvoice(invoice, providerNames)) });
  } catch (error) {
    console.error("listProviderInvoices error:", error);
    return res.status(500).json({ error: "Failed to load provider invoices" });
  }
};

export const getProviderInvoice = async (req: Request, res: Response) => {
  const params = providerInvoiceIdSchema.safeParse(req.params);
  const query = z.object({ providerId: z.coerce.number().int().positive().optional() }).safeParse(req.query);

  if (!params.success) {
    return res.status(400).json({ error: z.treeifyError(params.error) });
  }

  if (!query.success) {
    return res.status(400).json({ error: z.treeifyError(query.error) });
  }

  try {
    const providerId = await resolveProviderId(req, query.data.providerId);
    const isOperatorWideView = req.userRole === "PLATFORM_OPERATOR" && !query.data.providerId;
    if (providerId === null && !isOperatorWideView) {
      return res.status(404).json({ error: "Provider invoice not found" });
    }

    const invoice = await prisma.providerInvoice.findFirst({
      where: {
        id: params.data.id,
        ...(isOperatorWideView ? {} : { providerId: providerId! }),
      },
      include: {
        usageRecords: { orderBy: { occurredAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Provider invoice not found" });
    }

    return res.json({ invoice: serializeProviderInvoiceDetail(invoice) });
  } catch (error) {
    console.error("getProviderInvoice error:", error);
    return res.status(500).json({ error: "Failed to load provider invoice" });
  }
};

export const getProviderSubscriptionBilling = async (req: Request, res: Response) => {
  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider linked to this account" });
    }

    await ensureDefaultProviderPlans();

    const [provider, plans, subscription, invoices] = await Promise.all([
      prisma.provider.findUniqueOrThrow({ where: { id: providerId } }),
      prisma.providerPlan.findMany({ where: { active: true }, orderBy: [{ monthlyFeeEur: "asc" }, { id: "asc" }] }),
      prisma.providerSubscription.findFirst({
        where: { providerId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
        include: { plan: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.providerInvoice.findMany({
        where: { providerId },
        orderBy: { createdAt: "desc" },
        take: 20,
        include: {
          usageRecords: { orderBy: { occurredAt: "desc" } },
          payments: { orderBy: { createdAt: "desc" } },
        },
      }),
    ]);

    const providerNames = new Map([[provider.id, provider.name]]);

    return res.json({
      provider: {
        id: provider.id,
        name: provider.name,
        status: provider.status,
        contactEmail: provider.contactEmail,
      },
      plans: plans.map(serializeProviderPlan),
      subscription: serializeProviderSubscription(subscription),
      invoices: invoices.map((invoice) => serializeProviderInvoiceDetail({ ...invoice, providerName: provider.name })),
      invoiceSummary: invoices.map((invoice) => serializeProviderInvoice(invoice, providerNames)),
    });
  } catch (error) {
    console.error("getProviderSubscriptionBilling error:", error);
    return res.status(500).json({ error: "Failed to load provider subscription billing" });
  }
};

export const startProviderSubscription = async (req: Request, res: Response) => {
  const parsed = startProviderSubscriptionBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider linked to this account" });
    }

    await ensureDefaultProviderPlans();

    const plan = await prisma.providerPlan.findUnique({
      where: { code: parsed.data.planCode ?? "PRO" },
    });

    if (!plan || !plan.active) {
      return res.status(404).json({ error: "Provider plan not found" });
    }

    const invoice = await ensureProviderSubscriptionInvoice(providerId, plan);
    const amountEur = Number(invoice.totalEur);
    const now = new Date();

    if (useMockPayment()) {
      const subscription = await prisma.providerSubscription.upsert({
        where: {
          id:
            (
              await prisma.providerSubscription.findFirst({
                where: { providerId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
                select: { id: true },
                orderBy: { createdAt: "desc" },
              })
            )?.id ?? -1,
        },
        update: {
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: invoice.periodStart,
          currentPeriodEnd: invoice.periodEnd,
          endedAt: null,
        },
        create: {
          providerId,
          planId: plan.id,
          status: SubscriptionStatus.ACTIVE,
          currentPeriodStart: invoice.periodStart,
          currentPeriodEnd: invoice.periodEnd,
        },
        include: { plan: true },
      });

      await publishDomainEvent("subscription.changed", {
        providerId,
        subscriptionId: subscription.id,
        planId: plan.id,
        planCode: plan.code,
        status: subscription.status,
      });

      const [payment, paidInvoice] = await prisma.$transaction([
        prisma.providerPayment.create({
          data: {
            providerId,
            invoiceId: invoice.id,
            amountEur,
            providerRef: `mock_provider_subscription_${Date.now()}`,
            status: ProviderPaymentStatus.SUCCEEDED,
            paidAt: now,
          },
        }),
        prisma.providerInvoice.update({
          where: { id: invoice.id },
          data: { status: ProviderInvoiceStatus.PAID, paidAt: now },
          include: {
            usageRecords: { orderBy: { occurredAt: "desc" } },
            payments: { orderBy: { createdAt: "desc" } },
          },
        }),
      ]);

      await publishDomainEvent("billing.provider_invoice.paid", {
        providerId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountEur,
        paidAt: now.toISOString(),
      });

      return res.json({
        success: true,
        mock: true,
        subscription: serializeProviderSubscription(subscription),
        invoice: serializeProviderInvoiceDetail(paidInvoice),
        payment: {
          id: payment.id,
          providerRef: payment.providerRef,
          status: payment.status,
          paidAt: payment.paidAt?.toISOString() ?? null,
        },
      });
    }

    const customerId = await ensureStripeCustomer(providerId);
    const product = await stripe.products.create({
      name: `saasPlug ${plan.name}`,
      metadata: { providerPlanId: String(plan.id), providerPlanCode: plan.code },
    });
    const price = await stripe.prices.create({
      unit_amount: Math.round(Number(plan.monthlyFeeEur) * 100),
      currency: "eur",
      recurring: { interval: "month" },
      product: product.id,
      metadata: { providerPlanId: String(plan.id), providerPlanCode: plan.code },
    });

    const stripeSubscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: price.id }],
      payment_behavior: "default_incomplete",
      payment_settings: { save_default_payment_method: "on_subscription" },
      expand: ["latest_invoice.payment_intent"],
      metadata: {
        providerId: String(providerId),
        providerPlanId: String(plan.id),
        providerPlanCode: plan.code,
        localInvoiceId: String(invoice.id),
      },
    });

    const latestInvoice = stripeSubscription.latest_invoice as any;
    const paymentIntent = latestInvoice?.payment_intent as any;
    if (!paymentIntent?.id || !paymentIntent?.client_secret) {
      return res.status(502).json({ error: "Stripe did not return a payment intent for the subscription" });
    }

    const existingSubscription = await prisma.providerSubscription.findFirst({
      where: { providerId, status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] } },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });

    const subscription = existingSubscription
      ? await prisma.providerSubscription.update({
          where: { id: existingSubscription.id },
          data: {
            planId: plan.id,
            status: SubscriptionStatus.PAST_DUE,
            stripeSubscriptionId: stripeSubscription.id,
            stripePriceId: price.id,
            currentPeriodStart: stripeUnixDate((stripeSubscription as any).current_period_start),
            currentPeriodEnd: stripeUnixDate((stripeSubscription as any).current_period_end),
            endedAt: null,
          },
          include: { plan: true },
        })
      : await prisma.providerSubscription.create({
          data: {
            providerId,
            planId: plan.id,
            status: SubscriptionStatus.PAST_DUE,
            stripeSubscriptionId: stripeSubscription.id,
            stripePriceId: price.id,
            currentPeriodStart: stripeUnixDate((stripeSubscription as any).current_period_start),
            currentPeriodEnd: stripeUnixDate((stripeSubscription as any).current_period_end),
          },
          include: { plan: true },
        });

    await publishDomainEvent("subscription.changed", {
      providerId,
      subscriptionId: subscription.id,
      planId: plan.id,
      planCode: plan.code,
      status: subscription.status,
    });

    const payment = await prisma.providerPayment.create({
      data: {
        providerId,
        invoiceId: invoice.id,
        amountEur,
        providerRef: paymentIntent.id,
        status: ProviderPaymentStatus.PENDING,
      },
    });

    return res.json({
      success: true,
      mock: false,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      subscription: serializeProviderSubscription(subscription),
      invoice: serializeProviderInvoiceDetail(invoice),
      payment: {
        id: payment.id,
        providerRef: payment.providerRef,
        status: payment.status,
        paidAt: null,
      },
    });
  } catch (error) {
    console.error("startProviderSubscription error:", error);
    return res.status(500).json({ error: "Failed to start provider subscription" });
  }
};

export const confirmProviderPayment = async (req: Request, res: Response) => {
  const parsed = confirmProviderPaymentBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider linked to this account" });
    }

    const payment = await prisma.providerPayment.findFirst({
      where: {
        providerId,
        providerRef: parsed.data.paymentIntentId,
      },
      include: { invoice: true },
    });

    if (!payment) {
      return res.status(404).json({ error: "Provider payment not found" });
    }

    const intent = await stripe.paymentIntents.retrieve(parsed.data.paymentIntentId);
    if (intent.status !== "succeeded") {
      return res.status(402).json({
        error: "Stripe payment is not complete",
        stripeStatus: intent.status,
      });
    }

    const now = new Date();
    const [updatedPayment, updatedInvoice, updatedSubscription] = await prisma.$transaction([
      prisma.providerPayment.update({
        where: { id: payment.id },
        data: {
          status: ProviderPaymentStatus.SUCCEEDED,
          paidAt: now,
        },
      }),
      prisma.providerInvoice.update({
        where: { id: payment.invoiceId },
        data: {
          status: ProviderInvoiceStatus.PAID,
          paidAt: now,
        },
        include: {
          usageRecords: { orderBy: { occurredAt: "desc" } },
          payments: { orderBy: { createdAt: "desc" } },
        },
      }),
      prisma.providerSubscription.updateMany({
        where: {
          providerId,
          status: SubscriptionStatus.PAST_DUE,
        },
        data: {
          status: SubscriptionStatus.ACTIVE,
        },
      }),
    ]);

    await publishDomainEvent("billing.provider_invoice.paid", {
      providerId,
      invoiceId: updatedInvoice.id,
      invoiceNumber: updatedInvoice.invoiceNumber,
      amountEur: Number(updatedPayment.amountEur),
      paidAt: now.toISOString(),
    });

    return res.json({
      success: true,
      invoice: serializeProviderInvoiceDetail(updatedInvoice),
      payment: {
        id: updatedPayment.id,
        providerId: updatedPayment.providerId,
        invoiceId: updatedPayment.invoiceId,
        amountEur: Number(updatedPayment.amountEur),
        providerRef: updatedPayment.providerRef,
        status: updatedPayment.status,
        paidAt: updatedPayment.paidAt?.toISOString() ?? null,
        createdAt: updatedPayment.createdAt.toISOString(),
        updatedAt: updatedPayment.updatedAt.toISOString(),
      },
      subscriptionUpdated: updatedSubscription.count > 0,
    });
  } catch (error) {
    console.error("confirmProviderPayment error:", error);
    return res.status(500).json({ error: "Failed to confirm provider payment" });
  }
};

export const seedDemoProviderInvoice = async (req: Request, res: Response) => {
  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(409).json({
        error:
          "No provider is linked to this account. Register a provider first via POST /api/v1/providers/register.",
      });
    }

    const invoiceNumber = `PINV-DEMO-${providerId}-2026-05`;

    const existing = await prisma.providerInvoice.findUnique({
      where: { invoiceNumber },
      include: {
        usageRecords: { orderBy: { occurredAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (existing) {
      return res.json({ created: false, invoice: serializeProviderInvoiceDetail(existing) });
    }

    const invoice = await prisma.providerInvoice.create({
      data: {
        providerId,
        invoiceNumber,
        periodStart: new Date("2026-05-01T00:00:00.000Z"),
        periodEnd: new Date("2026-05-31T23:59:59.999Z"),
        status: ProviderInvoiceStatus.OPEN,
        subtotalEur: 184.4,
        taxEur: 0,
        totalEur: 184.4,
        dueDate: new Date("2026-06-05T00:00:00.000Z"),
        usageRecords: {
          create: [
            {
              providerId,
              sourceType: "SESSION_FEES",
              sourceId: 1001,
              quantity: 148,
              amountEur: 86.4,
              occurredAt: new Date("2026-05-10T10:00:00.000Z"),
              metadata: { description: "NTUA Gate Fast Charger sessions" },
            },
            {
              providerId,
              sourceType: "CONNECTOR_SUBSCRIPTION",
              sourceId: 2001,
              quantity: 3,
              amountEur: 62,
              occurredAt: new Date("2026-05-15T10:00:00.000Z"),
              metadata: { description: "Provider charger monthly subscription" },
            },
            {
              providerId,
              sourceType: "API_USAGE",
              sourceId: 3001,
              quantity: 9000,
              amountEur: 36,
              occurredAt: new Date("2026-05-25T10:00:00.000Z"),
              metadata: { description: "ExternalProviderAPI sync calls" },
            },
          ],
        },
      },
      include: {
        usageRecords: { orderBy: { occurredAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    await publishDomainEvent("billing.provider_invoice.created", {
      providerId,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      totalEur: Number(invoice.totalEur),
      dueDate: invoice.dueDate.toISOString(),
    });

    return res.status(201).json({ created: true, invoice: serializeProviderInvoiceDetail(invoice) });
  } catch (error) {
    console.error("seedDemoProviderInvoice error:", error);
    return res.status(500).json({ error: "Failed to seed provider invoice" });
  }
};

// ── Pay Provider Invoice ────────────────────────────────────────────────────

const payProviderInvoiceBodySchema = z.object({
  method: z.enum(["CARD", "BANK_TRANSFER"]).default("CARD").optional(),
});

const PAYABLE_STATUSES: ProviderInvoiceStatus[] = [
  ProviderInvoiceStatus.OPEN,
  ProviderInvoiceStatus.OVERDUE,
];

const useMockPayment = (): boolean => {
  const key = process.env.STRIPE_SECRET_KEY;
  return !key || key === "sk_test_replace_me";
};

export const payProviderInvoice = async (req: Request, res: Response) => {
  const params = providerInvoiceIdSchema.safeParse(req.params);
  if (!params.success) {
    return res.status(400).json({ error: z.treeifyError(params.error) });
  }

  const body = payProviderInvoiceBodySchema.safeParse(req.body ?? {});
  if (!body.success) {
    return res.status(400).json({ error: z.treeifyError(body.error) });
  }

  try {
    const providerId = await resolveProviderId(req);
    if (providerId === null) {
      return res.status(404).json({ error: "No provider linked to this account" });
    }

    // Fetch the invoice
    const invoice = await prisma.providerInvoice.findFirst({
      where: { id: params.data.id, providerId },
      include: {
        usageRecords: { orderBy: { occurredAt: "desc" } },
        payments: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Provider invoice not found" });
    }

    // Validate status transition
    if (!PAYABLE_STATUSES.includes(invoice.status)) {
      const messages: Record<string, string> = {
        DRAFT: "Invoice is still in draft state and cannot be paid yet",
        PAID: "Invoice is already paid",
        CANCELLED: "Invoice has been cancelled and cannot be paid",
      };
      return res.status(400).json({
        error: messages[invoice.status] ?? `Invoice cannot be paid (status: ${invoice.status})`,
        currentStatus: invoice.status,
      });
    }

    const amountEur = Number(invoice.totalEur);
    const now = new Date();

    if (useMockPayment()) {
      // ── MOCK FLOW ───────────────────────────────────────────────
      const mockRef = `mock_provider_pi_${Date.now()}`;

      const [payment, updatedInvoice] = await prisma.$transaction([
        prisma.providerPayment.create({
          data: {
            providerId,
            invoiceId: invoice.id,
            amountEur,
            providerRef: mockRef,
            status: ProviderPaymentStatus.SUCCEEDED,
            paidAt: now,
          },
        }),
        prisma.providerInvoice.update({
          where: { id: invoice.id },
          data: {
            status: ProviderInvoiceStatus.PAID,
            paidAt: now,
          },
          include: {
            usageRecords: { orderBy: { occurredAt: "desc" } },
            payments: { orderBy: { createdAt: "desc" } },
          },
        }),
      ]);

      await publishDomainEvent("billing.provider_invoice.paid", {
        providerId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        amountEur,
        paidAt: now.toISOString(),
      });

      return res.json({
        success: true,
        mock: true,
        payment: {
          id: payment.id,
          providerId: payment.providerId,
          invoiceId: payment.invoiceId,
          amountEur: Number(payment.amountEur),
          providerRef: payment.providerRef,
          status: payment.status,
          paidAt: payment.paidAt!.toISOString(),
          createdAt: payment.createdAt.toISOString(),
          updatedAt: payment.updatedAt.toISOString(),
        },
        invoice: serializeProviderInvoiceDetail(updatedInvoice),
      });
    }

    // ── REAL STRIPE FLOW ────────────────────────────────────────
    const amountCents = Math.round(amountEur * 100);

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amountCents,
      currency: "eur",
      payment_method_types: ["card"],
      metadata: {
        providerInvoiceId: String(invoice.id),
        providerId: String(providerId),
        invoiceNumber: invoice.invoiceNumber,
      },
    });

    const payment = await prisma.providerPayment.create({
      data: {
        providerId,
        invoiceId: invoice.id,
        amountEur,
        providerRef: paymentIntent.id,
        status: ProviderPaymentStatus.PENDING,
      },
    });

    return res.json({
      success: true,
      mock: false,
      clientSecret: paymentIntent.client_secret,
      payment: {
        id: payment.id,
        providerId: payment.providerId,
        invoiceId: payment.invoiceId,
        amountEur: Number(payment.amountEur),
        providerRef: payment.providerRef,
        status: payment.status,
        paidAt: null,
        createdAt: payment.createdAt.toISOString(),
        updatedAt: payment.updatedAt.toISOString(),
      },
    });
  } catch (error) {
    console.error("payProviderInvoice error:", error);
    return res.status(500).json({ error: "Failed to process provider invoice payment" });
  }
};

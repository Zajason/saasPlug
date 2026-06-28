import { Request, Response } from "express";
import {
  ChargerStatus,
  ConnectorType,
  Prisma,
  ProviderStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { z } from "zod";
import prisma from "../prisma/client.ts";
import { publishDomainEvent } from "../messaging/rabbitmq.ts";

// ---------- Validation ----------
const registerProviderSchema = z.object({
  name: z.string().min(2).max(120),
  legalName: z.string().max(160).optional(),
  contactEmail: z.email(),
  contactPhone: z.string().max(40).optional(),
  country: z.string().max(80).optional(),
});

const updateProviderSchema = z
  .object({
    name: z.string().min(2).max(120).optional(),
    legalName: z.string().max(160).nullable().optional(),
    contactEmail: z.email().optional(),
    contactPhone: z.string().max(40).nullable().optional(),
    country: z.string().max(80).nullable().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "Provide at least one field to update",
  });

// ---------- Serializers ----------
const serializeProvider = (provider: any) => ({
  id: provider.id,
  name: provider.name,
  legalName: provider.legalName ?? null,
  contactEmail: provider.contactEmail,
  contactPhone: provider.contactPhone ?? null,
  country: provider.country ?? null,
  status: provider.status,
  createdAt: provider.createdAt.toISOString(),
  updatedAt: provider.updatedAt.toISOString(),
});

const serializeCharger = (charger: any) => ({
  id: charger.id,
  name: charger.name,
  address: charger.address ?? null,
  lat: Number(charger.lat),
  lng: Number(charger.lng),
  connectorType: charger.connectorType,
  maxKW: charger.maxKW,
  status: charger.status,
  kwhprice: charger.kwhprice,
  providerName: charger.providerName,
  providerId: charger.providerId ?? null,
});

// ---------- RegisterProvider (#31, #33) ----------
// Any authenticated user may register a provider. On success the user is
// promoted to PROVIDER_ADMIN and linked to the new Provider via ProviderAccount.
export const registerProvider = async (req: Request, res: Response) => {
  const parsed = registerProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  const userId = req.userId!;

  try {
    const existingAccount = await prisma.providerAccount.findUnique({
      where: { userId },
      include: { provider: true },
    });
    if (existingAccount) {
      // Idempotent: return the existing provider rather than failing.
      // This allows the signup flow to safely retry without orphaning state.
      return res.status(200).json({ provider: serializeProvider(existingAccount.provider) });
    }

    const provider = await prisma.$transaction(async (tx) => {
      const created = await tx.provider.create({
        data: {
          name: parsed.data.name,
          legalName: parsed.data.legalName,
          contactEmail: parsed.data.contactEmail,
          contactPhone: parsed.data.contactPhone,
          country: parsed.data.country,
          status: ProviderStatus.PENDING,
          accounts: { create: { userId, role: "OWNER" } },
        },
      });

      return created;
    });

    await publishDomainEvent("provider.registered", {
      providerId: provider.id,
      providerName: provider.name,
      userId,
      status: provider.status,
      legalName: provider.legalName,
      contactEmail: provider.contactEmail,
      contactPhone: provider.contactPhone,
      country: provider.country,
    });

    return res.status(201).json({ provider: serializeProvider(provider) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      // Another provider already has this contactEmail.
      // If it has no OWNER yet, link the current user as OWNER (idempotent onboarding retry).
      try {
        const existing = await prisma.provider.findUnique({
          where: { contactEmail: parsed.data.contactEmail },
        });
        if (existing) {
          const ownerAccount = await prisma.providerAccount.findFirst({
            where: { providerId: existing.id, role: "OWNER" },
          });
          if (!ownerAccount) {
            await prisma.providerAccount.create({
              data: { userId, providerId: existing.id, role: "OWNER" },
            });
            return res.status(200).json({ provider: serializeProvider(existing) });
          }
          if (ownerAccount.userId === userId) {
            return res.status(200).json({ provider: serializeProvider(existing) });
          }
        }
      } catch (innerErr) {
        console.error("registerProvider fallback error:", innerErr);
      }
      return res.status(409).json({ error: "A provider with this contact email already exists" });
    }
    console.error("registerProvider error:", error);
    return res.status(500).json({ error: "Failed to register provider" });
  }
};

// ---------- GetProviderProfile (#31) ----------
export const getProviderProfile = async (req: Request, res: Response) => {
  try {
    const account = await prisma.providerAccount.findUnique({
      where: { userId: req.userId! },
      include: { provider: true },
    });

    if (!account) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    return res.json({ provider: serializeProvider(account.provider) });
  } catch (error) {
    console.error("getProviderProfile error:", error);
    return res.status(500).json({ error: "Failed to load provider profile" });
  }
};

// ---------- UpdateProviderProfile (#31) ----------
export const updateProviderProfile = async (req: Request, res: Response) => {
  const parsed = updateProviderSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: z.treeifyError(parsed.error) });
  }

  try {
    const account = await prisma.providerAccount.findUnique({ where: { userId: req.userId! } });
    if (!account) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const provider = await prisma.provider.update({
      where: { id: account.providerId },
      data: parsed.data,
    });

    return res.json({ provider: serializeProvider(provider) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return res.status(409).json({ error: "A provider with this contact email already exists" });
    }
    console.error("updateProviderProfile error:", error);
    return res.status(500).json({ error: "Failed to update provider profile" });
  }
};

// ---------- ListOwnedChargers (#32) ----------
export const listOwnedChargers = async (req: Request, res: Response) => {
  try {
    const account = await prisma.providerAccount.findUnique({ where: { userId: req.userId! } });
    if (!account) {
      return res.status(404).json({ error: "No provider is linked to this account" });
    }

    const chargers = await prisma.charger.findMany({
      where: { providerId: account.providerId },
      orderBy: { id: "asc" },
    });

    return res.json({
      providerId: account.providerId,
      count: chargers.length,
      chargers: chargers.map(serializeCharger),
    });
  } catch (error) {
    console.error("listOwnedChargers error:", error);
    return res.status(500).json({ error: "Failed to load owned chargers" });
  }
};

// ---------- SeedDemoProvider (#34) ----------
// Idempotently seeds the default SaaS plans and a demo provider (with two
// owned chargers and an active subscription) for the current user.
export const seedDemoProvider = async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    // 1. Ensure the default SaaS plans exist (global, idempotent).
    const planSeeds = [
      { code: "BASIC", name: "Basic", monthlyFeeEur: 0, perSessionFeeEur: 0.05 },
      { code: "PRO", name: "Pro", monthlyFeeEur: 49, perSessionFeeEur: 0.02 },
    ];
    for (const plan of planSeeds) {
      await prisma.providerPlan.upsert({
        where: { code: plan.code },
        update: {},
        create: plan,
      });
    }
    const basicPlan = await prisma.providerPlan.findUniqueOrThrow({ where: { code: "BASIC" } });

    // 2. Ensure this user already has a demo provider (idempotent).
    const existing = await prisma.providerAccount.findUnique({
      where: { userId },
      include: { provider: true },
    });
    if (existing) {
      return res.json({ created: false, provider: serializeProvider(existing.provider) });
    }

    const provider = await prisma.$transaction(async (tx) => {
      const created = await tx.provider.create({
        data: {
          name: "Demo Charging Co",
          legalName: "Demo Charging Co S.A.",
          contactEmail: `demo-provider-${userId}@saasplug.local`,
          contactPhone: "+302100000000",
          country: "GR",
          status: ProviderStatus.ACTIVE,
          accounts: { create: { userId, role: "OWNER" } },
          subscriptions: {
            create: { plan: { connect: { id: basicPlan.id } }, status: SubscriptionStatus.ACTIVE },
          },
          chargers: {
            create: [
              {
                providerName: "Demo Charging Co",
                name: "Demo NTUA Gate Charger",
                address: "Iroon Polytechniou 9, Zografou",
                lat: 37.9792,
                lng: 23.7833,
                connectorType: ConnectorType.CCS,
                maxKW: 50,
                status: ChargerStatus.AVAILABLE,
                kwhprice: 0.39,
              },
              {
                providerName: "Demo Charging Co",
                name: "Demo Zografou Campus Charger",
                address: "Zografou Campus",
                lat: 37.9755,
                lng: 23.787,
                connectorType: ConnectorType.TYPE2,
                maxKW: 22,
                status: ChargerStatus.AVAILABLE,
                kwhprice: 0.29,
              },
            ],
          },
        },
      });

      return created;
    });

    await publishDomainEvent("provider.registered", {
      providerId: provider.id,
      providerName: provider.name,
      userId,
      status: provider.status,
      legalName: provider.legalName,
      contactEmail: provider.contactEmail,
      contactPhone: provider.contactPhone,
      country: provider.country,
    });

    return res.status(201).json({ created: true, provider: serializeProvider(provider) });
  } catch (error) {
    console.error("seedDemoProvider error:", error);
    return res.status(500).json({ error: "Failed to seed demo provider" });
  }
};

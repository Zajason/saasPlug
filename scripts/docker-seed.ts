import { PrismaClient } from "@prisma/client";
import type { ConnectorType, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import { parse } from "csv-parse/sync";
import { getAdapter } from "../services/integration-service/src/adapters/externalProviderApi.ts";

const prisma = new PrismaClient();

const seedServiceName = process.env.SEED_SERVICE_NAME ?? "full";
const serviceModels: Record<string, string[]> = {
  "auth-service": ["User"],
  "user-service": ["User"],
  "vehicle-service": ["Car", "CarOwnership"],
  "charger-service": ["Charger", "PricingProfile"],
  "reservation-service": ["Reservation"],
  "session-service": ["Session"],
  "billing-service": [
    "CustomerBilling",
    "PaymentMethod",
    "PaymentAuth",
    "Invoice",
    "Provider",
    "ProviderAccount",
    "ProviderPlan",
    "ProviderSubscription",
    "ProviderInvoice",
    "ProviderUsageRecord",
    "ProviderPayment",
  ],
  "provider-service": ["User", "Provider", "ProviderAccount", "ProviderPlan", "ProviderSubscription", "Charger"],
  "integration-service": [
    "Provider",
    "ProviderAccount",
    "ProviderApiConfig",
    "Charger",
    "ProviderCharger",
    "WebhookSubscription",
    "WebhookEvent",
  ],
  "analytics-service": [
    "Provider",
    "ProviderAccount",
    "ProviderApiConfig",
    "Charger",
    "Session",
    "ProviderInvoice",
    "ProviderUsageRecord",
    "ProviderPayment",
    "ExportJob",
  ],
  "audit-service": ["AuditEvent"],
};
const activeModels = new Set(serviceModels[seedServiceName] ?? []);
const hasModel = (model: string) => seedServiceName === "full" || activeModels.has(model);

const providerApiKey = process.env.INTEGRATION_DEFAULT_API_KEY ?? "sk_saas_replace_me";
const externalProviderConfigs = [
  {
    externalProvider: "redPlug",
    baseUrl: "https://davinci.softlab.ntua.gr/saas26/redPlug/api",
    providerName: "redPlug",
    legalName: "redPlug Infrastructure SA",
    contactEmail: "billing@redplug.saasplug.local",
    contactPhone: "+30 210 100 0001",
    adminEmail: "red@saasplug.local",
    firstName: "Red",
    lastName: "Provider",
  },
  {
    externalProvider: "greenPlug",
    baseUrl: "https://davinci.softlab.ntua.gr/saas26/greenPlug/api",
    providerName: "greenPlug",
    legalName: "greenPlug Infrastructure SA",
    contactEmail: "billing@greenplug.saasplug.local",
    contactPhone: "+30 210 100 0002",
    adminEmail: "green@saasplug.local",
    firstName: "Green",
    lastName: "Provider",
  },
  {
    externalProvider: "bluePlug",
    baseUrl: "https://davinci.softlab.ntua.gr/saas26/bluePlug/api",
    providerName: "bluePlug",
    legalName: "bluePlug Infrastructure SA",
    contactEmail: "billing@blueplug.saasplug.local",
    contactPhone: "+30 210 100 0003",
    adminEmail: "blue@saasplug.local",
    firstName: "Blue",
    lastName: "Provider",
  },
];

type ExternalProviderSeedConfig = (typeof externalProviderConfigs)[number];

type CarCsvRow = {
  Brand: string;
  Model: string;
  Variant?: string;
  Usable_Battery_kWh: string;
  AC_Max_kW: string;
  DC_Max_kW: string;
  DC_Charging_Curve: string;
  DC_Curve_Is_Default: string;
  DC_Ports: string;
  AC_Ports: string;
};

const popularEvBrands = [
  "Tesla",
  "Volkswagen",
  "BMW",
  "Mercedes-Benz",
  "Audi",
  "Hyundai",
  "Kia",
  "Nissan",
  "Renault",
  "Peugeot",
  "Opel",
  "Volvo",
  "Polestar",
  "Porsche",
  "Ford",
  "Skoda",
  "Cupra",
  "MG",
  "BYD",
  "Fiat",
  "Mini",
  "Smart",
  "Honda",
  "Toyota",
  "Lexus",
  "Jeep",
  "Dacia",
  "Citroen",
  "Citroën",
];

function normalizePorts(value: string): ConnectorType[] {
  if (!value) return [];
  return value
    .split(",")
    .map((port) => port.trim().toUpperCase())
    .filter((port): port is ConnectorType =>
      ["CCS", "CHADEMO", "TYPE2", "TYPE1", "SCHUKO"].includes(port),
    );
}

function parseNumber(value: string) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function carKey(car: { brand: string; model: string; variant?: string | null }) {
  return `${car.brand.trim().toLowerCase()}|${car.model.trim().toLowerCase()}|${(car.variant ?? "").trim().toLowerCase()}`;
}

function mapCarRow(row: CarCsvRow) {
  let dcChargingCurve: Prisma.InputJsonValue = [];
  try {
    const parsed = JSON.parse(row.DC_Charging_Curve.replace(/""/g, "\"")) as Prisma.JsonValue;
    dcChargingCurve = Array.isArray(parsed) ? parsed : [];
  } catch {
    dcChargingCurve = [];
  }

  return {
    brand: row.Brand,
    model: row.Model,
    variant: row.Variant || null,
    usableBatteryKWh: parseNumber(row.Usable_Battery_kWh),
    acMaxKW: parseNumber(row.AC_Max_kW),
    dcMaxKW: parseNumber(row.DC_Max_kW),
    dcChargingCurve,
    dcCurveIsDefault: row.DC_Curve_Is_Default?.toLowerCase() === "true",
    dcPorts: normalizePorts(row.DC_Ports),
    acPorts: normalizePorts(row.AC_Ports),
  };
}

async function seedPopularCars(targetCount = 120) {
  const existingCars = await prisma.car.findMany({
    select: { brand: true, model: true, variant: true },
  });
  const existingKeys = new Set(existingCars.map(carKey));
  if (existingCars.length >= targetCount) {
    return existingCars.length;
  }

  const rows = parse(fs.readFileSync("services/vehicle-service/src/data/ev_models_battery_variants.csv", "utf8"), {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as CarCsvRow[];

  const grouped = new Map<string, ReturnType<typeof mapCarRow>[]>();
  for (const row of rows) {
    if (!popularEvBrands.includes(row.Brand)) continue;
    const car = mapCarRow(row);
    const key = carKey(car);
    if (existingKeys.has(key)) continue;
    const list = grouped.get(car.brand) ?? [];
    list.push(car);
    grouped.set(car.brand, list);
  }

  const selected: ReturnType<typeof mapCarRow>[] = [];
  while (existingCars.length + selected.length < targetCount) {
    let addedThisRound = false;
    for (const brand of popularEvBrands) {
      const list = grouped.get(brand);
      const next = list?.shift();
      if (!next) continue;
      const key = carKey(next);
      if (existingKeys.has(key)) continue;
      existingKeys.add(key);
      selected.push(next);
      addedThisRound = true;
      if (existingCars.length + selected.length >= targetCount) break;
    }
    if (!addedThisRound) break;
  }

  if (selected.length > 0) {
    await prisma.car.createMany({ data: selected });
  }

  return existingCars.length + selected.length;
}

async function syncExternalProviderChargers(
  providerId: number,
  providerName: string,
  pricingProfileId: number | null,
  configs: ExternalProviderSeedConfig[],
) {
  if (process.env.INTEGRATION_USE_MOCK === "true") {
    return 0;
  }

  let synced = 0;
  for (const config of configs) {
    try {
      const adapter = getAdapter(config.externalProvider, {
        baseUrl: config.baseUrl,
        apiKey: providerApiKey,
        useMock: false,
      });
      const chargers = await adapter.listChargers();

      for (const external of chargers) {
        const chargerData = {
          providerName,
          providerId,
          name: external.name,
          address: external.address,
          lat: external.lat,
          lng: external.lng,
          connectorType: external.connectorType,
          maxKW: external.maxKW,
          status: external.status,
          kwhprice: external.kwhPrice,
          pricingProfileId,
        };

        const existing = await prisma.providerCharger.findUnique({
          where: {
            providerId_externalProvider_externalId: {
              providerId,
              externalProvider: config.externalProvider,
              externalId: external.externalId,
            },
          },
        });

        if (existing) {
          await prisma.charger.update({ where: { id: existing.chargerId }, data: chargerData });
          await prisma.providerCharger.update({
            where: { id: existing.id },
            data: { lastSyncedAt: new Date() },
          });
        } else {
          const charger = await prisma.charger.create({ data: chargerData });
          await prisma.providerCharger.create({
            data: {
              providerId,
              externalProvider: config.externalProvider,
              externalId: external.externalId,
              chargerId: charger.id,
            },
          });
        }
        synced++;
      }

      await prisma.providerApiConfig.update({
        where: {
          providerId_externalProvider: {
            providerId,
            externalProvider: config.externalProvider,
          },
        },
        data: { lastSyncedAt: new Date() },
      });
      console.log(`Synced ${chargers.length} chargers from ${config.externalProvider}.`);
    } catch (error) {
      console.warn(`Could not sync ${config.externalProvider}; leaving existing seed data in place.`);
      console.warn(error instanceof Error ? error.message : error);
    }
  }

  return synced;
}

async function seedDemoSessions(
  userId: number,
  providerTenants: Array<{ provider: { id: number; name: string }; config: ExternalProviderSeedConfig }>,
  targetCount = 180,
) {
  const existingCount = await prisma.session.count({
    where: {
      userId,
      startedAt: { gte: new Date("2026-05-13T00:00:00Z") },
    },
  });
  if (existingCount >= targetCount) return existingCount;

  const chargers = await prisma.charger.findMany({
    where: {
      providerId: { in: providerTenants.map((tenant) => tenant.provider.id) },
    },
    orderBy: [{ providerId: "asc" }, { id: "asc" }],
    take: Math.max(30, targetCount),
  });
  if (chargers.length === 0) return existingCount;

  const missingCount = targetCount - existingCount;
  const base = new Date("2026-05-14T07:30:00Z");
  const sessions = Array.from({ length: missingCount }, (_, index) => {
    const charger = chargers[(index + existingCount) % chargers.length];
    const dayOffset = (index + existingCount) % 29;
    const hourOffset = ((index + existingCount) * 3) % 14;
    const startedAt = new Date(base.getTime() + dayOffset * 24 * 60 * 60_000 + hourOffset * 60 * 60_000);
    const durationMinutes = 28 + ((index + existingCount) % 8) * 9;
    const endedAt = new Date(startedAt.getTime() + durationMinutes * 60_000);
    const avgKW = Math.max(7, Math.min(charger.maxKW, 18 + ((index + existingCount) % 9) * 6));
    const kWh = Number(((avgKW * durationMinutes) / 60).toFixed(2));
    const pricePerKWh = Number(charger.kwhprice || 0.39);
    const costEur = Number((kWh * pricePerKWh).toFixed(2));

    return {
      userId,
      chargerId: charger.id,
      startedAt,
      endedAt,
      kWh,
      maxKWh: Number((kWh + 8 + ((index + existingCount) % 14)).toFixed(2)),
      avgKW: Number(avgKW.toFixed(2)),
      pricePerKWh: pricePerKWh.toFixed(5),
      costEur: costEur.toFixed(2),
      status: index % 4 === 0 ? "USER_STOPPED" as const : "COMPLETED" as const,
    };
  });

  await prisma.session.createMany({ data: sessions });
  return existingCount + sessions.length;
}

async function main() {
  const password = await bcrypt.hash("admin123", 10);

  let operator = { id: 1 };
  let evUser = { id: 2 };

  if (hasModel("User")) {
    // auth-service's User model was reduced and no longer has firstName/lastName
    // (those moved to user-service as the profile read model)
    const authOnlyUser = seedServiceName === "auth-service";

    operator = await prisma.user.upsert({
      where: { email: "operator@saasplug.local" },
      update: { role: "PLATFORM_OPERATOR" },
      create: {
        email: "operator@saasplug.local",
        password,
        role: "PLATFORM_OPERATOR",
        ...(authOnlyUser ? {} : { firstName: "Platform", lastName: "Operator" }),
      },
    });

    evUser = await prisma.user.upsert({
      where: { email: "user@saasplug.local" },
      update: {},
      create: {
        email: "user@saasplug.local",
        password,
        role: "EV_USER",
        ...(authOnlyUser ? {} : { firstName: "Demo", lastName: "Driver" }),
      },
    });

    // auth-service needs provider admin credentials so they can sign in.
    // (Provider-service seeds the Provider row itself; auth-service only needs the User row.)
    if (authOnlyUser) {
      for (const config of externalProviderConfigs) {
        await prisma.user.upsert({
          where: { email: config.adminEmail },
          update: { role: "PROVIDER_ADMIN" },
          create: {
            email: config.adminEmail,
            password,
            role: "PROVIDER_ADMIN",
          },
        });
      }
    }
  }

  const plan = hasModel("ProviderPlan")
    ? await prisma.providerPlan.upsert({
        where: { code: "PRO" },
        update: {},
        create: {
          code: "PRO",
          name: "Professional",
          monthlyFeeEur: "99.00",
          perSessionFeeEur: "0.2500",
          features: ["analytics", "exports", "api-sync"],
        },
      })
    : { id: 1 };

  const providerTenants = [];
  if (hasModel("Provider")) {
    for (const [index, config] of externalProviderConfigs.entries()) {
      const providerAdmin = hasModel("User")
        ? await prisma.user.upsert({
            where: { email: config.adminEmail },
            update: { role: "PROVIDER_ADMIN" },
            create: {
              email: config.adminEmail,
              password,
              firstName: config.firstName,
              lastName: config.lastName,
              role: "PROVIDER_ADMIN",
            },
          })
        : { id: index + 3 };

      const provider = await prisma.provider.upsert({
        where: { contactEmail: config.contactEmail },
        update: {
          name: config.providerName,
          legalName: config.legalName,
          contactPhone: config.contactPhone,
          country: "GR",
          status: "ACTIVE",
        },
        create: {
          name: config.providerName,
          legalName: config.legalName,
          contactEmail: config.contactEmail,
          contactPhone: config.contactPhone,
          country: "GR",
          status: "ACTIVE",
        },
      });

      if (hasModel("ProviderAccount")) {
        await prisma.providerAccount.upsert({
          where: { userId: providerAdmin.id },
          update: { providerId: provider.id, role: "OWNER" },
          create: {
            providerId: provider.id,
            userId: providerAdmin.id,
            role: "OWNER",
          },
        });
      }

      if (hasModel("ProviderSubscription") && hasModel("ProviderPlan")) {
        const existingSubscription = await prisma.providerSubscription.findFirst({
          where: { providerId: provider.id, status: "ACTIVE" },
        });
        if (!existingSubscription) {
          await prisma.providerSubscription.create({
            data: {
              providerId: provider.id,
              planId: plan.id,
              status: "ACTIVE",
            },
          });
        }
      }

      if (hasModel("ProviderApiConfig")) {
        await prisma.providerApiConfig.upsert({
          where: {
            providerId_externalProvider: {
              providerId: provider.id,
              externalProvider: config.externalProvider,
            },
          },
          update: {
            baseUrl: config.baseUrl,
            apiKey: providerApiKey,
            enabled: true,
          },
          create: {
            providerId: provider.id,
            externalProvider: config.externalProvider,
            baseUrl: config.baseUrl,
            apiKey: providerApiKey,
            enabled: true,
          },
        });
      }

      providerTenants.push({ provider, config });
    }
  } else if (hasModel("ProviderCharger") || hasModel("Charger")) {
    externalProviderConfigs.forEach((config, index) => {
      providerTenants.push({
        provider: { id: index + 1, name: config.providerName },
        config,
      });
    });
  }

  const pricingProfile = hasModel("PricingProfile")
    ? await prisma.pricingProfile.upsert({
        where: { name: "Default" },
        update: {},
        create: {
          name: "Default",
          rulesJson: {
            base: 0.25,
            tod: [{ from: 18, to: 23, adj: 0.05 }],
            wholesaleMultiplier: 0.3,
          },
        },
      })
    : { id: null };

  if (hasModel("Charger") && hasModel("ProviderCharger") && hasModel("ProviderApiConfig")) {
    for (const tenant of providerTenants) {
      await syncExternalProviderChargers(
        tenant.provider.id,
        tenant.provider.name,
        pricingProfile.id,
        [tenant.config],
      );
    }
  }

  if (hasModel("Charger")) {
    const chargerCount = await prisma.charger.count();
    if (chargerCount === 0) {
      const demoChargers = [
        {
          name: "NTUA Gate Fast Charger",
          address: "Iroon Polytechniou 9, Zografou",
          lat: 37.9789,
          lng: 23.7838,
          connectorType: "CCS" as const,
          maxKW: 150,
          status: "AVAILABLE" as const,
          kwhprice: 0.32,
        },
        {
          name: "Metro Katechaki Type 2",
          address: "Katechaki Station, Athens",
          lat: 37.9934,
          lng: 23.7762,
          connectorType: "TYPE2" as const,
          maxKW: 22,
          status: "IN_USE" as const,
          kwhprice: 0.25,
        },
        {
          name: "Port DC Charger",
          address: "Piraeus Port",
          lat: 37.9447,
          lng: 23.6401,
          connectorType: "CCS" as const,
          maxKW: 120,
          status: "OUTAGE" as const,
          kwhprice: 0.3,
        },
      ];

      const tenants = providerTenants.length > 0 ? providerTenants : [{ provider: { id: null, name: "saasPlug" }, config: externalProviderConfigs[0] }];
      for (const tenant of tenants) {
        for (const [index, item] of demoChargers.entries()) {
          const charger = await prisma.charger.create({
            data: {
              ...item,
              name: `${tenant.provider.name} ${item.name}`,
              providerName: tenant.provider.name,
              providerId: tenant.provider.id,
              pricingProfileId: pricingProfile.id,
            },
          });

          if (hasModel("ProviderCharger")) {
            await prisma.providerCharger.upsert({
              where: {
                providerId_externalProvider_externalId: {
                  providerId: tenant.provider.id ?? index + 1,
                  externalProvider: tenant.config.externalProvider,
                  externalId: `${tenant.config.externalProvider}-demo-${index + 1}`,
                },
              },
              update: {
                chargerId: charger.id,
                lastSyncedAt: new Date(),
              },
              create: {
                providerId: tenant.provider.id ?? index + 1,
                externalProvider: tenant.config.externalProvider,
                externalId: `${tenant.config.externalProvider}-demo-${index + 1}`,
                chargerId: charger.id,
              },
            });
          }
        }
      }
    }
  }

  let demoCar: { id: number } | null = null;
  if (hasModel("Car")) {
    const seededCarCount = await seedPopularCars();
    demoCar =
      (await prisma.car.findFirst({
        where: { brand: "Tesla", model: "Model 3", variant: { contains: "Long Range", mode: "insensitive" } },
        orderBy: { usableBatteryKWh: "desc" },
      })) ??
      (await prisma.car.findFirst({
        where: { brand: "Tesla", model: { contains: "Model 3", mode: "insensitive" } },
        orderBy: { usableBatteryKWh: "desc" },
      })) ??
      (await prisma.car.findFirst({ orderBy: { usableBatteryKWh: "desc" } }));

    if (seededCarCount > 0) {
      console.log(`Seeded/verified ${seededCarCount} EV catalogue cars.`);
    }
  }

  if (hasModel("CarOwnership") && demoCar) {
    const existingOwnership = await prisma.carOwnership.findFirst({
      where: { userId: evUser.id, carId: demoCar.id },
    });
    if (!existingOwnership) {
      await prisma.carOwnership.create({
        data: {
          userId: evUser.id,
          carId: demoCar.id,
          color: "BLUE",
        },
      });
    }
  }

  if (hasModel("Car") && !demoCar) {
    console.warn("No EV catalogue car was available to attach to the demo user.");
  }

  if (hasModel("Session") && hasModel("Charger")) {
    const demoSessionCount = await seedDemoSessions(evUser.id, providerTenants);
    console.log(`Seeded/verified ${demoSessionCount} demo charging sessions.`);
  }

  if (hasModel("ProviderInvoice") && hasModel("ProviderUsageRecord")) {
    for (const [index, tenant] of providerTenants.entries()) {
      const invoice = await prisma.providerInvoice.upsert({
        where: { invoiceNumber: `PINV-${tenant.config.externalProvider}-2026-05` },
        update: {},
        create: {
          providerId: tenant.provider.id,
          invoiceNumber: `PINV-${tenant.config.externalProvider}-2026-05`,
          periodStart: new Date("2026-05-01T00:00:00Z"),
          periodEnd: new Date("2026-05-31T23:59:59Z"),
          status: "OPEN",
          subtotalEur: String(160 + index * 25),
          taxEur: String(38.4 + index * 6),
          totalEur: String(198.4 + index * 31),
          dueDate: new Date("2026-06-05T00:00:00Z"),
        },
      });

      const usageCount = await prisma.providerUsageRecord.count({
        where: { invoiceId: invoice.id },
      });
      if (usageCount === 0) {
        await prisma.providerUsageRecord.createMany({
          data: [
            {
              providerId: tenant.provider.id,
              invoiceId: invoice.id,
              sourceType: "SESSION",
              sourceId: 1,
              quantity: 120 + index * 35,
              amountEur: String(110 + index * 22),
              occurredAt: new Date("2026-05-15T12:00:00Z"),
              metadata: { externalProvider: tenant.config.externalProvider },
            },
            {
              providerId: tenant.provider.id,
              invoiceId: invoice.id,
              sourceType: "EXPORT",
              sourceId: 1,
              quantity: 1,
              amountEur: "50",
              occurredAt: new Date("2026-05-20T12:00:00Z"),
              metadata: { format: "CSV" },
            },
          ],
        });
      }
    }
  }

  if (hasModel("PaymentMethod")) {
    await prisma.paymentMethod.upsert({
      where: { stripePaymentMethodId: `mock_pm_${evUser.id}` },
      update: { status: "valid" },
      create: {
        userId: evUser.id,
        provider: "mock",
        tokenLast4: "4242",
        stripePaymentMethodId: `mock_pm_${evUser.id}`,
        status: "valid",
      },
    });
  }

  console.log("Docker demo seed complete.");
  console.log("Demo users:");
  console.log("  EV user: user@saasplug.local / admin123");
  console.log("  redPlug provider admin: red@saasplug.local / admin123");
  console.log("  greenPlug provider admin: green@saasplug.local / admin123");
  console.log("  bluePlug provider admin: blue@saasplug.local / admin123");
  console.log("  Platform operator: operator@saasplug.local / admin123");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

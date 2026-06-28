import { Prisma, PrismaClient, type Role } from "@prisma/client";

type ReplicatedUser = {
  id: number;
  email: string;
  password: string | null;
  googleId: string | null;
  authProvider: string;
  firstName: string | null;
  lastName: string | null;
  phone: string | null;
  role: Role;
  stripeCustomerId: string | null;
  preferences: Prisma.JsonValue | null;
  outstandingBalanceEur: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

function replicaUrls() {
  return (process.env.REPLICA_DATABASE_URLS ?? "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean);
}

export async function replicateUserToServiceDatabases(user: ReplicatedUser) {
  const urls = replicaUrls();
  if (urls.length === 0) return;

  const results = await Promise.allSettled(
    urls.map(async (url) => {
      const prisma = new PrismaClient({ datasources: { db: { url } } });
      const preferences = user.preferences === null ? Prisma.JsonNull : user.preferences;
      try {
        await prisma.user.upsert({
          where: { id: user.id },
          update: {
            email: user.email,
            password: user.password,
            googleId: user.googleId,
            authProvider: user.authProvider,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            role: user.role,
            stripeCustomerId: user.stripeCustomerId,
            preferences,
            outstandingBalanceEur: user.outstandingBalanceEur,
          },
          create: {
            id: user.id,
            email: user.email,
            password: user.password,
            googleId: user.googleId,
            authProvider: user.authProvider,
            firstName: user.firstName,
            lastName: user.lastName,
            phone: user.phone,
            role: user.role,
            stripeCustomerId: user.stripeCustomerId,
            preferences,
            outstandingBalanceEur: user.outstandingBalanceEur,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
          },
        });
      } finally {
        await prisma.$disconnect();
      }
    }),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    throw new Error(`Failed to replicate user to ${failures.length} service database(s)`);
  }
}

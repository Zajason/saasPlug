import { beforeEach, describe, expect, it, vi } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";

process.env.JWT_SECRET = "test-secret";

// Mock the Prisma client so the RegisterProvider flow can be tested without a DB.
const mockPrisma = vi.hoisted(() => ({
  providerAccount: { findUnique: vi.fn() },
  provider: { create: vi.fn() },
  user: { update: vi.fn() },
  $transaction: vi.fn(),
}));

vi.mock("../prisma/client.ts", () => ({
  default: mockPrisma,
  prisma: mockPrisma,
}));

// Imported after vi.mock so the controller picks up the mocked client.
import app from "../index.ts";

const signToken = (userId: number, role = "EV_USER") =>
  jwt.sign({ userId, role }, process.env.JWT_SECRET as string);

const validBody = {
  name: "Acme Charging",
  contactEmail: "ops@acme.example",
  country: "GR",
};

beforeEach(() => {
  vi.clearAllMocks();
  // Interactive transactions run the callback against the mocked client.
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(mockPrisma));
});

describe("RegisterProvider flow", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const res = await request(app).post("/api/v1/providers/register").send(validBody);
    expect(res.status).toBe(401);
  });

  it("rejects invalid input with 400", async () => {
    const res = await request(app)
      .post("/api/v1/providers/register")
      .set("Authorization", `Bearer ${signToken(1)}`)
      .send({ name: "x" }); // name too short, contactEmail missing

    expect(res.status).toBe(400);
    expect(mockPrisma.provider.create).not.toHaveBeenCalled();
  });

  it("registers a provider and links the user as OWNER", async () => {
    mockPrisma.providerAccount.findUnique.mockResolvedValue(null);
    mockPrisma.provider.create.mockResolvedValue({
      id: 7,
      name: validBody.name,
      legalName: null,
      contactEmail: validBody.contactEmail,
      contactPhone: null,
      country: validBody.country,
      status: "PENDING",
      createdAt: new Date("2026-05-22T00:00:00.000Z"),
      updatedAt: new Date("2026-05-22T00:00:00.000Z"),
    });

    const res = await request(app)
      .post("/api/v1/providers/register")
      .set("Authorization", `Bearer ${signToken(1)}`)
      .send(validBody);

    expect(res.status).toBe(201);
    expect(res.body.provider).toMatchObject({
      id: 7,
      name: validBody.name,
      status: "PENDING",
    });
    // The user is linked as OWNER on the new provider in the same transaction.
    // Promotion to PROVIDER_ADMIN happens asynchronously via the
    // provider.registered domain event, not a direct user.update here.
    expect(mockPrisma.provider.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          accounts: { create: { userId: 1, role: "OWNER" } },
        }),
      }),
    );
  });

  it("returns the existing provider (idempotent) when the user already owns one", async () => {
    mockPrisma.providerAccount.findUnique.mockResolvedValue({
      id: 3,
      userId: 1,
      providerId: 9,
      provider: {
        id: 9,
        name: "Existing Co",
        legalName: null,
        contactEmail: "owner@existing.example",
        contactPhone: null,
        country: "GR",
        status: "ACTIVE",
        createdAt: new Date("2026-04-01T00:00:00.000Z"),
        updatedAt: new Date("2026-04-01T00:00:00.000Z"),
      },
    });

    const res = await request(app)
      .post("/api/v1/providers/register")
      .set("Authorization", `Bearer ${signToken(1)}`)
      .send(validBody);

    expect(res.status).toBe(200);
    expect(res.body.provider).toMatchObject({ id: 9, status: "ACTIVE" });
    expect(mockPrisma.provider.create).not.toHaveBeenCalled();
  });
});

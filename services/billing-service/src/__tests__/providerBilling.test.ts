import { describe, it, expect, beforeAll, afterAll } from "vitest";
import request from "supertest";
import jwt from "jsonwebtoken";
import { PrismaClient, ProviderInvoiceStatus, ProviderPaymentStatus } from "@prisma/client";
import app from "../index.ts";

const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "a-very-secret-key";

/* ── helpers ─────────────────────────────────────────────────────────── */

const signToken = (userId: number, role: string) =>
  jwt.sign({ userId, role }, JWT_SECRET, { expiresIn: "1h" });

/* ── shared state ────────────────────────────────────────────────────── */

let providerAdminToken: string;
let evUserToken: string;
let testProviderId: number;
let testUserId: number;
let testEvUserId: number;
let openInvoiceId: number;
let paidInvoiceId: number;
let cancelledInvoiceId: number;
let draftInvoiceId: number;

/* ── setup / teardown ────────────────────────────────────────────────── */

beforeAll(async () => {
  // Create test users
  const providerAdmin = await prisma.user.create({
    data: {
      email: `test-provider-admin-${Date.now()}@test.local`,
      password: "hashed",
      role: "PROVIDER_ADMIN",
    },
  });
  testUserId = providerAdmin.id;

  const evUser = await prisma.user.create({
    data: {
      email: `test-ev-user-${Date.now()}@test.local`,
      password: "hashed",
      role: "EV_USER",
    },
  });
  testEvUserId = evUser.id;

  // Create a test provider
  const provider = await prisma.provider.create({
    data: {
      name: "TestProvider",
      contactEmail: `test-provider-${Date.now()}@test.local`,
      status: "ACTIVE",
    },
  });
  testProviderId = provider.id;

  // Link user to provider
  await prisma.providerAccount.create({
    data: {
      providerId: testProviderId,
      userId: testUserId,
      role: "OWNER",
    },
  });

  // Generate tokens
  providerAdminToken = signToken(testUserId, "PROVIDER_ADMIN");
  evUserToken = signToken(testEvUserId, "EV_USER");

  // Create OPEN invoice (payable)
  const openInvoice = await prisma.providerInvoice.create({
    data: {
      providerId: testProviderId,
      invoiceNumber: `PINV-TEST-OPEN-${Date.now()}`,
      periodStart: new Date("2026-05-01"),
      periodEnd: new Date("2026-05-31"),
      status: ProviderInvoiceStatus.OPEN,
      subtotalEur: 100,
      taxEur: 24,
      totalEur: 124,
      dueDate: new Date("2026-06-15"),
      usageRecords: {
        create: [
          {
            providerId: testProviderId,
            sourceType: "SESSION_FEES",
            sourceId: 9001,
            quantity: 50,
            amountEur: 60,
            occurredAt: new Date("2026-05-10"),
            metadata: { description: "Test session fees" },
          },
          {
            providerId: testProviderId,
            sourceType: "API_USAGE",
            sourceId: 9002,
            quantity: 5000,
            amountEur: 40,
            occurredAt: new Date("2026-05-20"),
            metadata: { description: "Test API calls" },
          },
        ],
      },
    },
  });
  openInvoiceId = openInvoice.id;

  // Create PAID invoice (not payable)
  const paidInvoice = await prisma.providerInvoice.create({
    data: {
      providerId: testProviderId,
      invoiceNumber: `PINV-TEST-PAID-${Date.now()}`,
      periodStart: new Date("2026-04-01"),
      periodEnd: new Date("2026-04-30"),
      status: ProviderInvoiceStatus.PAID,
      subtotalEur: 80,
      taxEur: 0,
      totalEur: 80,
      dueDate: new Date("2026-05-15"),
      paidAt: new Date("2026-05-10"),
    },
  });
  paidInvoiceId = paidInvoice.id;

  // Create CANCELLED invoice (not payable)
  const cancelledInvoice = await prisma.providerInvoice.create({
    data: {
      providerId: testProviderId,
      invoiceNumber: `PINV-TEST-CANCELLED-${Date.now()}`,
      periodStart: new Date("2026-03-01"),
      periodEnd: new Date("2026-03-31"),
      status: ProviderInvoiceStatus.CANCELLED,
      subtotalEur: 50,
      taxEur: 0,
      totalEur: 50,
      dueDate: new Date("2026-04-15"),
    },
  });
  cancelledInvoiceId = cancelledInvoice.id;

  // Create DRAFT invoice (not payable)
  const draftInvoice = await prisma.providerInvoice.create({
    data: {
      providerId: testProviderId,
      invoiceNumber: `PINV-TEST-DRAFT-${Date.now()}`,
      periodStart: new Date("2026-06-01"),
      periodEnd: new Date("2026-06-30"),
      status: ProviderInvoiceStatus.DRAFT,
      subtotalEur: 0,
      taxEur: 0,
      totalEur: 0,
      dueDate: new Date("2026-07-15"),
    },
  });
  draftInvoiceId = draftInvoice.id;
});

afterAll(async () => {
  // Clean up in reverse dependency order
  await prisma.providerPayment.deleteMany({ where: { providerId: testProviderId } });
  await prisma.providerUsageRecord.deleteMany({ where: { providerId: testProviderId } });
  await prisma.providerInvoice.deleteMany({ where: { providerId: testProviderId } });
  await prisma.providerAccount.deleteMany({ where: { providerId: testProviderId } });
  await prisma.provider.deleteMany({ where: { id: testProviderId } });
  await prisma.user.deleteMany({ where: { id: { in: [testUserId, testEvUserId] } } });
  await prisma.$disconnect();
});

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("Provider Invoice Listing", () => {
  it("GET /invoices — should return provider invoices", async () => {
    const res = await request(app)
      .get("/api/v1/payments/provider/invoices")
      .set("Authorization", `Bearer ${providerAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.invoices).toBeDefined();
    expect(Array.isArray(res.body.invoices)).toBe(true);
    expect(res.body.invoices.length).toBeGreaterThanOrEqual(1);

    const inv = res.body.invoices.find((i: any) => i.id === openInvoiceId);
    expect(inv).toBeDefined();
    expect(inv.status).toBe("OPEN");
    expect(inv.totalEur).toBe(124);
  });

  it("GET /invoices — should return 401 without auth", async () => {
    const res = await request(app).get("/api/v1/payments/provider/invoices");
    expect(res.status).toBe(401);
  });
});

describe("Provider Invoice Details", () => {
  it("GET /invoices/:id — should return invoice with usage records", async () => {
    const res = await request(app)
      .get(`/api/v1/payments/provider/invoices/${openInvoiceId}`)
      .set("Authorization", `Bearer ${providerAdminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.invoice).toBeDefined();
    expect(res.body.invoice.id).toBe(openInvoiceId);
    expect(res.body.invoice.usageRecords).toBeDefined();
    expect(res.body.invoice.usageRecords.length).toBe(2);
    expect(res.body.invoice.payments).toBeDefined();
  });

  it("GET /invoices/:id — should return 404 for non-existent invoice", async () => {
    const res = await request(app)
      .get("/api/v1/payments/provider/invoices/999999")
      .set("Authorization", `Bearer ${providerAdminToken}`);

    expect(res.status).toBe(404);
  });
});

describe("Pay Provider Invoice — Happy Path", () => {
  it("POST /invoices/:id/pay — should pay an OPEN invoice in mock mode", async () => {
    const res = await request(app)
      .post(`/api/v1/payments/provider/invoices/${openInvoiceId}/pay`)
      .set("Authorization", `Bearer ${providerAdminToken}`)
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.mock).toBe(true);

    // Payment created
    expect(res.body.payment).toBeDefined();
    expect(res.body.payment.status).toBe("SUCCEEDED");
    expect(res.body.payment.amountEur).toBe(124);
    expect(res.body.payment.providerRef).toMatch(/^mock_provider_pi_/);
    expect(res.body.payment.paidAt).toBeDefined();

    // Invoice updated
    expect(res.body.invoice).toBeDefined();
    expect(res.body.invoice.status).toBe("PAID");
    expect(res.body.invoice.paidAt).toBeDefined();
  });

  it("should have persisted the PAID status in the database", async () => {
    const invoice = await prisma.providerInvoice.findUnique({
      where: { id: openInvoiceId },
    });

    expect(invoice).not.toBeNull();
    expect(invoice!.status).toBe(ProviderInvoiceStatus.PAID);
    expect(invoice!.paidAt).not.toBeNull();
  });

  it("should have created a ProviderPayment with SUCCEEDED status", async () => {
    const payments = await prisma.providerPayment.findMany({
      where: { invoiceId: openInvoiceId },
    });

    expect(payments.length).toBe(1);
    expect(payments[0].status).toBe(ProviderPaymentStatus.SUCCEEDED);
    expect(Number(payments[0].amountEur)).toBe(124);
    expect(payments[0].paidAt).not.toBeNull();
  });
});

describe("Pay Provider Invoice — Error Cases", () => {
  it("should return 400 for already-PAID invoice", async () => {
    const res = await request(app)
      .post(`/api/v1/payments/provider/invoices/${paidInvoiceId}/pay`)
      .set("Authorization", `Bearer ${providerAdminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already paid/i);
    expect(res.body.currentStatus).toBe("PAID");
  });

  it("should return 400 for CANCELLED invoice", async () => {
    const res = await request(app)
      .post(`/api/v1/payments/provider/invoices/${cancelledInvoiceId}/pay`)
      .set("Authorization", `Bearer ${providerAdminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/cancelled/i);
    expect(res.body.currentStatus).toBe("CANCELLED");
  });

  it("should return 400 for DRAFT invoice", async () => {
    const res = await request(app)
      .post(`/api/v1/payments/provider/invoices/${draftInvoiceId}/pay`)
      .set("Authorization", `Bearer ${providerAdminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/draft/i);
    expect(res.body.currentStatus).toBe("DRAFT");
  });

  it("should return 404 for non-existent invoice", async () => {
    const res = await request(app)
      .post("/api/v1/payments/provider/invoices/999999/pay")
      .set("Authorization", `Bearer ${providerAdminToken}`)
      .send({});

    expect(res.status).toBe(404);
  });

  it("should return 403 for EV_USER role", async () => {
    const res = await request(app)
      .post(`/api/v1/payments/provider/invoices/${openInvoiceId}/pay`)
      .set("Authorization", `Bearer ${evUserToken}`)
      .send({});

    expect(res.status).toBe(403);
  });

  it("should return 400 when paying the same invoice again (was OPEN, now PAID)", async () => {
    // The openInvoice was paid in the happy-path test above
    const res = await request(app)
      .post(`/api/v1/payments/provider/invoices/${openInvoiceId}/pay`)
      .set("Authorization", `Bearer ${providerAdminToken}`)
      .send({});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already paid/i);
  });
});

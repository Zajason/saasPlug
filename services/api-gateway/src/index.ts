import "dotenv/config";
import express, { Request, Response } from "express";
import cors from "cors";

const app = express();

app.use(cors());

const serviceTargets = {
  auth: process.env.AUTH_SERVICE_URL ?? "http://localhost:8081",
  user: process.env.USER_SERVICE_URL ?? "http://localhost:8082",
  vehicle: process.env.VEHICLE_SERVICE_URL ?? "http://localhost:8083",
  charger: process.env.CHARGER_SERVICE_URL ?? "http://localhost:8084",
  reservation: process.env.RESERVATION_SERVICE_URL ?? "http://localhost:8085",
  session: process.env.SESSION_SERVICE_URL ?? "http://localhost:8086",
  billing: process.env.BILLING_SERVICE_URL ?? "http://localhost:8087",
  provider: process.env.PROVIDER_SERVICE_URL ?? "http://localhost:8088",
  integration: process.env.INTEGRATION_SERVICE_URL ?? "http://localhost:8090",
  analytics: process.env.ANALYTICS_SERVICE_URL ?? "http://localhost:8089",
  audit: process.env.AUDIT_SERVICE_URL ?? "http://localhost:8091",
};

function targetFor(path: string): string | undefined {
  if (path.startsWith("/api/v1/auth")) return serviceTargets.auth;
  if (path.startsWith("/api/v1/me")) return serviceTargets.user;
  if (path.startsWith("/api/v1/cars")) return serviceTargets.vehicle;
  if (path.startsWith("/api/v1/car-ownership")) return serviceTargets.vehicle;
  if (path.startsWith("/api/v1/chargers")) return serviceTargets.charger;
  if (path.startsWith("/api/v1/points")) return serviceTargets.charger;
  if (path.startsWith("/api/v1/point")) return serviceTargets.charger;
  if (path.startsWith("/api/v1/pointstatus")) return serviceTargets.charger;
  if (path.startsWith("/api/v1/updpoint")) return serviceTargets.charger;
  if (path.startsWith("/api/v1/admin")) return serviceTargets.charger;
  if (path.startsWith("/api/v1/reserve")) return serviceTargets.reservation;
  if (path.startsWith("/api/v1/newsession")) return serviceTargets.session;
  if (path.startsWith("/api/v1/sessions")) return serviceTargets.session;
  if (path.startsWith("/api/v1/charging")) return serviceTargets.session;
  if (path.startsWith("/api/v1/payments")) return serviceTargets.billing;
  if (path.startsWith("/api/v1/providers")) return serviceTargets.provider;
  if (path.startsWith("/api/v1/integration")) return serviceTargets.integration;
  if (path.startsWith("/api/v1/analytics")) return serviceTargets.analytics;
  if (path.startsWith("/api/v1/audit")) return serviceTargets.audit;
  return undefined;
}

app.get("/api/health", (_req, res) => {
  res.json({ service: "ApiGateway", ok: true, serviceTargets });
});

app.use(async (req: Request, res: Response) => {
  const target = targetFor(req.path);
  if (!target) {
    return res.status(404).json({ error: `No service route for ${req.path}` });
  }

  const targetUrl = new URL(req.originalUrl, target);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string" && key.toLowerCase() !== "host") {
      headers.set(key, value);
    }
  }

  const bodyless = req.method === "GET" || req.method === "HEAD";
  const upstream = await fetch(targetUrl, {
    method: req.method,
    headers,
    body: bodyless ? undefined : req,
    duplex: bodyless ? undefined : "half",
  } as RequestInit & { duplex?: "half" });

  res.status(upstream.status);
  upstream.headers.forEach((value, key) => {
    if (!["content-encoding", "transfer-encoding"].includes(key.toLowerCase())) {
      res.setHeader(key, value);
    }
  });

  const buffer = Buffer.from(await upstream.arrayBuffer());
  return res.send(buffer);
});

const port = Number(process.env.PORT ?? 8080);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`ApiGateway running on http://localhost:${port}`));
}

export default app;

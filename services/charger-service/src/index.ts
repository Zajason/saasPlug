import "dotenv/config";
import express from "express";
import cors from "cors";
import chargersRouter from "./routes/chargers.ts";
import pointsRouter from "./routes/points.ts";
import pointStatusRouter from "./routes/pointstatus.ts";
import updpointRouter from "./routes/updpoint.ts";
import adminChargersRouter from "./routes/admin/adminChargers.ts";
import addPointsRouter from "./routes/admin/addPoints.ts";
import resetPointsRouter from "./routes/admin/resetPoints.ts";
import pricingRouter from "./routes/admin/pricing.ts";
import healthcheckRouter from "./routes/admin/healthcheck.ts";
import { schedulePricingUpdates } from "./pricing/scheduler.ts";
import { startRabbitConsumer } from "./messaging/consumer.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/chargers", chargersRouter);
app.use("/api/v1/points", pointsRouter);
app.use("/api/v1/point", pointsRouter);
app.use("/api/v1/pointstatus", pointStatusRouter);
app.use("/api/v1/updpoint", updpointRouter);
app.use("/api/v1/admin/chargers", adminChargersRouter);
app.use("/api/v1/admin", addPointsRouter);
app.use("/api/v1/admin", resetPointsRouter);
app.use("/api/v1/admin/pricing", pricingRouter);
app.use("/api/v1/admin", healthcheckRouter);
app.get("/api/health", (_req, res) => res.json({ service: "ChargerService", ok: true }));

const port = Number(process.env.PORT ?? 8084);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`ChargerService running on http://localhost:${port}`));
  void startRabbitConsumer();
}

if (process.env.ENABLE_PRICING === "1") {
  schedulePricingUpdates();
}

export default app;

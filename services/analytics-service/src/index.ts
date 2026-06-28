import "dotenv/config";
import express from "express";
import cors from "cors";
import analyticsRouter from "./routes/analytics.ts";
import { startRabbitConsumer } from "./messaging/consumer.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/analytics", analyticsRouter);
app.get("/api/health", (_req, res) => res.json({ service: "AnalyticsService", ok: true }));

const port = Number(process.env.PORT ?? 8089);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`AnalyticsService running on http://localhost:${port}`));
  void startRabbitConsumer();
}

export default app;

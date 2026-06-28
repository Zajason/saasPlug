import "dotenv/config";
import express from "express";
import cors from "cors";
import integrationRouter from "./routes/integration.ts";
import internalProviderChargersRouter from "./routes/internalProviderChargers.ts";
import { startRabbitConsumer } from "./messaging/rabbitmq.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/integration", integrationRouter);
app.use("/api/v1/internal", internalProviderChargersRouter);
app.get("/api/health", (_req, res) => res.json({ service: "IntegrationService", ok: true }));

const port = Number(process.env.PORT ?? 8090);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`IntegrationService running on http://localhost:${port}`));
  void startRabbitConsumer();
}

export default app;

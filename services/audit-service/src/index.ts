import "dotenv/config";
import express from "express";
import cors from "cors";
import auditRouter from "./routes/audit.ts";
import { startRabbitConsumer } from "./messaging/rabbitmq.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/audit", auditRouter);
app.get("/api/health", (_req, res) => res.json({ service: "AuditService", ok: true }));

const port = Number(process.env.PORT ?? 8091);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`AuditService running on http://localhost:${port}`));
  void startRabbitConsumer();
}

export default app;

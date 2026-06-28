import "dotenv/config";
import express from "express";
import cors from "cors";
import paymentRouter from "./routes/payment.ts";
import providerBillingRouter from "./routes/providerBilling.ts";
import { startRabbitConsumer } from "./messaging/consumer.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/payments/provider", providerBillingRouter);
app.use("/api/v1/payments", paymentRouter);
app.get("/api/health", (_req, res) => res.json({ service: "BillingService", ok: true }));

const port = Number(process.env.PORT ?? 8087);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`BillingService running on http://localhost:${port}`));
  startRabbitConsumer();
}

export default app;

import "dotenv/config";
import express from "express";
import cors from "cors";
import meRouter from "./routes/me.ts";
import { startRabbitConsumer } from "./messaging/consumer.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/me", meRouter);
app.get("/api/health", (_req, res) => res.json({ service: "UserService", ok: true }));

const port = Number(process.env.PORT ?? 8082);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(`UserService running on http://localhost:${port}`);
    
    // Start listening to RabbitMQ right after the web server boots up
    startRabbitConsumer(); 
  });
}

export default app;
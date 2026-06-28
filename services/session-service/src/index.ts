import "dotenv/config";
import express from "express";
import cors from "cors";
import newsessionRouter from "./routes/newsession.ts";
import sessionsRouter from "./routes/sessions.ts";
import chargingRouter from "./routes/charging.ts";
import internalSessionsRouter from "./routes/internalSessions.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/newsession", newsessionRouter);
app.use("/api/v1/sessions", sessionsRouter);
app.use("/api/v1/charging", chargingRouter);
app.use("/api/v1/internal/sessions", internalSessionsRouter);
app.get("/api/health", (_req, res) => res.json({ service: "SessionService", ok: true }));

const port = Number(process.env.PORT ?? 8086);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`SessionService running on http://localhost:${port}`));
}

export default app;

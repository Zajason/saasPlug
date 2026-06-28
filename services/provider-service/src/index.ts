import "dotenv/config";
import express from "express";
import cors from "cors";
import providersRouter from "./routes/providers.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/providers", providersRouter);
app.get("/api/health", (_req, res) => res.json({ service: "ProviderService", ok: true }));

const port = Number(process.env.PORT ?? 8088);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`ProviderService running on http://localhost:${port}`));
}

export default app;

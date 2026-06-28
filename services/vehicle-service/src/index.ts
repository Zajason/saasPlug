import "dotenv/config";
import express from "express";
import cors from "cors";
import carsRouter from "./routes/cars.ts";
import carOwnershipRouter from "./routes/carOwnership.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/cars", carsRouter);
app.use("/api/v1/car-ownership", carOwnershipRouter);
app.get("/api/health", (_req, res) => res.json({ service: "VehicleService", ok: true }));

const port = Number(process.env.PORT ?? 8083);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`VehicleService running on http://localhost:${port}`));
}

export default app;

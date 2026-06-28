import "dotenv/config";
import express from "express";
import cors from "cors";
import reserveRouter from "./routes/reserve.ts";
import internalReservationsRouter from "./routes/internalReservations.ts";

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/v1/reserve", reserveRouter);
app.use("/api/v1/internal/reservations", internalReservationsRouter);
app.get("/api/health", (_req, res) => res.json({ service: "ReservationService", ok: true }));

const port = Number(process.env.PORT ?? 8085);
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => console.log(`ReservationService running on http://localhost:${port}`));
}

export default app;

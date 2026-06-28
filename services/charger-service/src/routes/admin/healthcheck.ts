import { Router } from "express";
import prisma from "../../prisma/client.js";
import { makeErrorLog } from "../../middleware/errorHandler.ts";

const router = Router();

/**
 * GET /admin/healthcheck
 * Checks DB connectivity and basic stats.
 */
router.get("/healthcheck", async (req, res) => {
  try {
    const chargers = await prisma.charger.findMany({ select: { status: true } });

    const total = chargers.length;
    const online = chargers.filter(c =>
      ["AVAILABLE", "IN_USE"].includes(c.status)
    ).length;
    const offline = chargers.filter(c => c.status === "OUTAGE").length;

    res.status(200).json({
      status: "OK",
      dbconnection: process.env.DATABASE_URL || "postgresql://localhost:5432",
      n_charge_points: total,
      n_charge_points_online: online,
      n_charge_points_offline: offline,
    });
  } catch (err: any) {
    const errorLog = makeErrorLog(
      req,
      400,
      "Database connection or query failed",
      err.message,
    );
    res.status(400).json(errorLog);
  }
});

export default router;
import express, { Request, Response } from "express";
import { requireAdmin } from "../../middleware/verifyToken.ts";
import { updatePricesForAllChargers } from "../../pricing/engine.ts";

const router = express.Router();

router.post("/update", requireAdmin, async (_req: Request, res: Response) => {
  try {
    await updatePricesForAllChargers();
    res.json({ status: "ok", message: "Prices updated" });
  } catch (err: any) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
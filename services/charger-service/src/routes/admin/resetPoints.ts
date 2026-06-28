import express from "express";
import fs from "fs";
import path from "path";
import prisma from "../../prisma/client.js";
import { makeErrorLog } from "../../middleware/errorHandler.js";

const router = express.Router();

// Hardwired path to demo dataset
const DEMO_CHARGERS_PATH = path.join(
  process.cwd(),
  "src",
  "data",
  "demo-chargers.json"
);

router.post("/resetpoints", async (req, res) => {
  try {
    // --- 1. Read and parse JSON file ---
    if (!fs.existsSync(DEMO_CHARGERS_PATH)) {
      const errorLog = makeErrorLog(req, 400,
        `Demo dataset not found at path: ${DEMO_CHARGERS_PATH}`);
      return res.status(400).json(errorLog);
    }

    const dataRaw = fs.readFileSync(DEMO_CHARGERS_PATH, "utf8");
    const chargers = JSON.parse(dataRaw);

    if (!Array.isArray(chargers)) {
      const errorLog = makeErrorLog(req, 400,
        "Invalid file format — expected an array of chargers");
      return res.status(400).json(errorLog);
    }

    // --- 2. Light validation ---
    const invalidItem = chargers.find(c =>
      !c.name || typeof c.lat !== "number" || typeof c.lng !== "number" ||
      !c.connectorType || typeof c.maxKW !== "number"
    );
    if (invalidItem) {
      const errorLog = makeErrorLog(req, 400,
        "One or more charger records are missing required fields");
      return res.status(400).json(errorLog);
    }

    // --- 3. Reinitialize table in a transaction ---
    await prisma.$transaction([
      prisma.charger.deleteMany(),
      prisma.charger.createMany({ data: chargers })
    ]);

    // --- 4. Success response ---
    res.status(200).json({
      status: "OK",
      message: `Reset ${chargers.length} chargers from demo dataset.`
    });

  } catch (err: any) {
    const errorLog = makeErrorLog(req, 400,
      "Failed to reset charger data", err.message);
    res.status(400).json(errorLog);
  }
});

export default router;
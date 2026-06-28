import express, { Request, Response } from "express";
import multer from "multer";
import { parse } from "csv-parse/sync";
import prisma from "../../prisma/client.ts";
import { makeErrorLog } from "../../middleware/errorHandler.ts";

// Multer setup: keep file in memory (no disk save)
const upload = multer({ storage: multer.memoryStorage() });

const router = express.Router();

router.post(
  "/addpoints",
  upload.single("file"),
  async (req: Request, res: Response) => {
    try {
      // 1️⃣ Ensure file provided
      if (!req.file) {
        const errorLog = makeErrorLog(req, 400, "No CSV file provided");
        return res.status(400).json(errorLog);
      }

      // 2️⃣ Ensure correct mime type
      if (req.file.mimetype !== "text/csv") {
        const errorLog = makeErrorLog(
          req,
          400,
          `Invalid file type: ${req.file.mimetype}. Expected 'text/csv'`
        );
        return res.status(400).json(errorLog);
      }

      // 3️⃣ Parse CSV
      const csvText = req.file.buffer.toString("utf8");
      const records = parse(csvText, {
        columns: true,       // map headers -> object keys
        skip_empty_lines: true,
        trim: true,
      }) as Array<{
        name: string;
        address?: string;
        lat: string;
        lng: string;
        connectorType: string;
        maxKW: string;
        status: string;
      }>;

      // 4️⃣ Light validation of structure
      if (!Array.isArray(records) || records.length === 0) {
        const errorLog = makeErrorLog(req, 400, "Empty or invalid CSV content");
        return res.status(400).json(errorLog);
      }

      const invalid = records.find(
        c =>
          !c.name ||
          !c.lat ||
          !c.lng ||
          !c.connectorType ||
          !c.maxKW ||
          !c.status
      );
      if (invalid) {
        const errorLog = makeErrorLog(
          req,
          400,
          "One or more CSV rows missing required fields"
        );
        return res.status(400).json(errorLog);
      }

      // 5️⃣ Insert new chargers
      // Convert numeric fields (csv parser returns strings)
      const chargers = records.map(c => ({
        name: c.name,
        address: c.address || null,
        lat: Number(c.lat),
        lng: Number(c.lng),
        connectorType: c.connectorType as any,
        maxKW: Number(c.maxKW),
        status: c.status as any,
      }));

      await prisma.charger.createMany({ data: chargers });

      // 6️⃣ Success response
      res.status(200).json({
        status: "OK",
        added: chargers.length,
      });
    } catch (err: any) {
      const errorLog = makeErrorLog(
        req,
        400,
        "Failed to add charger points from CSV",
        err.message
      );
      res.status(400).json(errorLog);
    }
  }
);

export default router;
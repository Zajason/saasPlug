import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";
import { makeErrorLog } from "../middleware/errorHandler.ts";
import { verifyToken } from "../middleware/verifyToken.ts";
import { ChargerStatus } from "@prisma/client";

const router = express.Router();

const handleUpdate = async (req: Request, res: Response) => {
  try {
    // Πίνακας αντιστοίχισης
    const apiToDbStatus: Record<string, ChargerStatus> = {
        "available": ChargerStatus.AVAILABLE,
        "in_use": ChargerStatus.IN_USE,
        "charging": ChargerStatus.IN_USE,
        "reserved": ChargerStatus.IN_USE,
        "outage": ChargerStatus.OUTAGE,
        "outoforder": ChargerStatus.OUTAGE,
        "malfunction": ChargerStatus.OUTAGE
    };

    const id = Number(req.params.id);
    if (isNaN(id)) {
      const err = makeErrorLog(req, 400, `Invalid charger id '${req.params.id}'`);
      return res.status(400).json(err);
    }

    const { status, kwhprice } = req.body;

    // Validation: Πρέπει να υπάρχει κάτι για αλλαγή
    if (!status && kwhprice === undefined) {
       const err = makeErrorLog(req, 400, "Provide 'status' or 'kwhprice' in body");
       return res.status(400).json(err);
    }

    // Update object
    const dataToUpdate: any = {};
    
    if (status) {
        const normalizedStatus = status.toLowerCase();
        
        // Έλεγχος αν το status είναι έγκυρο
        if (!(normalizedStatus in apiToDbStatus)) {
             const err = makeErrorLog(req, 400, `Invalid status '${status}'. Allowed: available, charging, outage...`);
             return res.status(400).json(err);
        }

        // Αντιστοίχιση στο σωστό Enum της Prisma
        dataToUpdate.status = apiToDbStatus[normalizedStatus];
    }

    // Προσθήκη της τιμής στο Update
    if (kwhprice !== undefined) {
        dataToUpdate.kwhprice = Number(kwhprice);
    }
    
    // Εκτέλεση Update
    const updatedCharger = await prisma.charger.update({
        where: { id },
        data: dataToUpdate
    });

    // Reverse mapping for response (Enum -> String)
    const responseStatus = updatedCharger.status === ChargerStatus.OUTAGE ? "outoforder" 
                         : updatedCharger.status === ChargerStatus.IN_USE ? "charging" 
                         : "available";

    const payload = {
        pointid: String(updatedCharger.id),
        status: responseStatus,
        kwhprice: updatedCharger.kwhprice
    };

    return res.status(200).json(payload);

  } catch (err: any) {
    const errorLog = makeErrorLog(req, 500, "Internal server error", err.message);
    return res.status(500).json(errorLog);
  }
};

router.post("/:id", verifyToken, handleUpdate);

export default router;
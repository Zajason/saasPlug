import express, { Request, Response } from "express";
import prisma from "../prisma/client.ts";
import { makeErrorLog } from "../middleware/errorHandler.ts";
import { verifyToken } from "../middleware/verifyToken.ts";

const router = express.Router();

function formatDate(d: Date | null | undefined): string {
  if (!d) return "";
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// --- NEW ENDPOINT MOVED FROM BILLING SERVICE ---
// GET /api/v1/sessions/my-history
router.get("/my-history", verifyToken, async (req: Request, res: Response) => {
  try {
    const userId = req.userId!;

    const sessions = await prisma.session.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    // In a pure microservice architecture, the Session service only returns what it owns.
    // If the frontend needs the Invoice PDF url, the frontend will make a separate 
    // call to `GET /billing/invoices/:sessionId` to stitch the UI together!
    const history = sessions.map(session => ({
      sessionId: session.id,
      chargerId: session.chargerId,
      status: session.status,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt ? session.endedAt.toISOString() : null,
      kWh: Number(session.kWh),
      costEur: session.costEur ? Number(session.costEur) : 0,
      pricePerKWh: Number(session.pricePerKWh),
    }));

    return res.json({ history });
  } catch (error) {
    console.error('my-history error:', error);
    return res.status(500).json({ error: 'Failed to load session history' });
  }
});

// --- EXISTING ENDPOINT ---
const getSessions = async (req: Request, res: Response) => {
  // ... Keep your existing getSessions logic here! ...
};

router.get("/:id/:from/:to", verifyToken, getSessions);

export default router;
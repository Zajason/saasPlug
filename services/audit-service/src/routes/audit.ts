import { Router } from "express";
import { listAuditEvents } from "../controllers/auditController.ts";
import { requireOperator, verifyToken } from "../middleware/verifyToken.ts";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    service: "AuditService",
    ok: true,
    endpoints: {
      listAuditEvents: "GET /api/v1/audit/events",
    },
  });
});

router.get("/events", verifyToken, requireOperator, listAuditEvents);

export default router;

import { Router } from "express";
import {
  createUsageExport,
  downloadExport,
  getGlobalAnalytics,
  getProviderAnalytics,
  listExportJobs,
} from "../controllers/analyticsController.ts";
import {
  requireOperator,
  requireProviderOrOperator,
  verifyToken,
} from "../middleware/verifyToken.ts";

const router = Router();

router.get("/", (_req, res) => {
  res.json({
    service: "AnalyticsService",
    ok: true,
    endpoints: {
      providerAnalytics: "GET /api/v1/analytics/provider",
      globalAnalytics: "GET /api/v1/analytics/global",
      createUsageExport: "POST /api/v1/analytics/exports",
      listExportJobs: "GET /api/v1/analytics/exports",
      downloadExport: "GET /api/v1/analytics/exports/:id/download",
    },
  });
});

router.get("/provider", verifyToken, requireProviderOrOperator, getProviderAnalytics);
router.get("/global", verifyToken, requireOperator, getGlobalAnalytics);
router.post("/exports", verifyToken, requireProviderOrOperator, createUsageExport);
router.get("/exports", verifyToken, requireProviderOrOperator, listExportJobs);
router.get("/exports/:id/download", verifyToken, requireProviderOrOperator, downloadExport);

export default router;

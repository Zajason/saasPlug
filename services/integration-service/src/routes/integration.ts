import { Router } from "express";
import { requireAdmin, verifyToken } from "../middleware/verifyToken.ts";
import {
  configureProviderApi,
  createWebhookSubscription,
  listProviderApiConfigs,
  listSyncedChargers,
  listWebhookEvents,
  listWebhookSubscriptions,
  syncChargers,
} from "../controllers/integrationController.ts";

const router = Router();

// Public service info.
router.get("/", (_req, res) => {
  res.json({
    service: "IntegrationService",
    ok: true,
    endpoints: {
      health: "GET /api/health",
      configureProviderApi: "POST /api/v1/integration/config",
      listProviderApiConfigs: "GET /api/v1/integration/config",
      syncChargers: "POST /api/v1/integration/sync",
      listSyncedChargers: "GET /api/v1/integration/chargers",
      createWebhookSubscription: "POST /api/v1/integration/webhooks",
      listWebhookSubscriptions: "GET /api/v1/integration/webhooks",
      listWebhookEvents: "GET /api/v1/integration/webhooks/events",
    },
  });
});

// #39 ConfigureProviderAPI
router.post("/config", verifyToken, requireAdmin, configureProviderApi);
router.get("/config", verifyToken, requireAdmin, listProviderApiConfigs);

// #41 / #42 Charger sync from the (mock) ExternalProviderAPI
router.post("/sync", verifyToken, requireAdmin, syncChargers);
router.get("/chargers", verifyToken, requireAdmin, listSyncedChargers);

// #43 Webhook persistence
router.post("/webhooks", verifyToken, requireAdmin, createWebhookSubscription);
router.get("/webhooks", verifyToken, requireAdmin, listWebhookSubscriptions);
router.get("/webhooks/events", verifyToken, requireAdmin, listWebhookEvents);

export default router;

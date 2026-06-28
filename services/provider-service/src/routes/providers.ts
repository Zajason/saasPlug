import { Router } from "express";
import { requireAdmin, verifyToken } from "../middleware/verifyToken.ts";
import {
  getProviderProfile,
  listOwnedChargers,
  registerProvider,
  seedDemoProvider,
  updateProviderProfile,
} from "../controllers/providerController.ts";

const router = Router();

// Public service info.
router.get("/", (_req, res) => {
  res.json({
    service: "ProviderService",
    ok: true,
    endpoints: {
      health: "GET /api/health",
      registerProvider: "POST /api/v1/providers/register",
      seedDemoProvider: "POST /api/v1/providers/seed-demo",
      getProviderProfile: "GET /api/v1/providers/me",
      updateProviderProfile: "PATCH /api/v1/providers/me",
      listOwnedChargers: "GET /api/v1/providers/me/chargers",
    },
  });
});

// RegisterProvider: any authenticated user may register as a provider.
router.post("/register", verifyToken, registerProvider);

// Demo seed data: any authenticated user.
router.post("/seed-demo", verifyToken, seedDemoProvider);

// Provider profile + owned chargers: require provider/operator role.
router.get("/me", verifyToken, requireAdmin, getProviderProfile);
router.patch("/me", verifyToken, requireAdmin, updateProviderProfile);
router.get("/me/chargers", verifyToken, requireAdmin, listOwnedChargers);

export default router;

import { Router } from "express";
import { requireAdmin, verifyToken } from "../middleware/verifyToken.ts";
import {
  confirmProviderPayment,
  getProviderInvoice,
  getProviderSubscriptionBilling,
  listProviderInvoices,
  payProviderInvoice,
  seedDemoProviderInvoice,
  startProviderSubscription,
} from "../controllers/providerBillingController.ts";

const router = Router();

router.use(verifyToken, requireAdmin);

router.get("/subscription", getProviderSubscriptionBilling);
router.post("/subscription/start", startProviderSubscription);
router.post("/payments/confirm", confirmProviderPayment);
router.get("/invoices", listProviderInvoices);
router.get("/invoices/:id", getProviderInvoice);
router.post("/invoices/:id/pay", payProviderInvoice);
router.post("/seed-demo-invoice", seedDemoProviderInvoice);

export default router;

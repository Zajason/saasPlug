import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken.ts';
import {
  createSetupIntent,
  deletePaymentMethod,
  executePayment,
  listBillingHistory,
  listPaymentMethods,
  payOutstandingBalance,
  savePaymentMethod,
} from '../controllers/paymentController.ts';

const router = Router();

router.use(verifyToken);

router.post('/create-setup-intent', createSetupIntent);
router.post('/save-method', savePaymentMethod);
router.get('/methods', listPaymentMethods);
router.delete('/methods/:id', deletePaymentMethod);
router.post('/charge', executePayment);
router.get('/history', listBillingHistory);
router.post('/pay-balance', payOutstandingBalance);

export default router;

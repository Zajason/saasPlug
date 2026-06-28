import { Router } from 'express';
import { verifyToken } from '../middleware/verifyToken.ts';
import { getProfile, updateProfile } from '../controllers/meController.ts';

const router = Router();

router.use(verifyToken);

// Profile (the only endpoints user-service owns after the schema reduction;
// vehicles live in vehicle-service, payment methods in billing-service)
router.get('/', getProfile);
router.patch('/', updateProfile);

export default router;
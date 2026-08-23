import { Router } from 'express';
import { cancelBooking } from '../controllers/waitlist.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT as any);

router.post('/:bookingId/cancel', cancelBooking as any);

export default router;

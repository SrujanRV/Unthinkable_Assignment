import { Router } from 'express';
import { cancelBooking, listMyBookings } from '../controllers/waitlist.controller';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT as any);
router.use(requireRoles(['CUSTOMER']) as any);

router.get('/', listMyBookings as any);
router.post('/:bookingId/cancel', cancelBooking as any);


export default router;

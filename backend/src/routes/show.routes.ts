import { Router } from 'express';
import { getShowDetails, getShowSeatsMap, holdSeats, releaseSeats, checkoutSeats } from '../controllers/show.controller';
import { joinWaitlist } from '../controllers/waitlist.controller';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT as any);

router.get('/:showId', getShowDetails as any);
router.get('/:showId/seats', getShowSeatsMap as any);
router.post('/:showId/hold', requireRoles(['CUSTOMER']) as any, holdSeats as any);
router.post('/:showId/release', requireRoles(['CUSTOMER']) as any, releaseSeats as any);
router.post('/:showId/checkout', requireRoles(['CUSTOMER']) as any, checkoutSeats as any);
router.post('/:showId/waitlist', requireRoles(['CUSTOMER']) as any, joinWaitlist as any);


export default router;

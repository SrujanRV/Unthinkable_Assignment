import { Router } from 'express';
import { getShowDetails, getShowSeatsMap, holdSeats, releaseSeats, checkoutSeats } from '../controllers/show.controller';
import { joinWaitlist } from '../controllers/waitlist.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT as any);

router.get('/:showId', getShowDetails as any);
router.get('/:showId/seats', getShowSeatsMap as any);
router.post('/:showId/hold', holdSeats as any);
router.post('/:showId/release', releaseSeats as any);
router.post('/:showId/checkout', checkoutSeats as any);
router.post('/:showId/waitlist', joinWaitlist as any);

export default router;

import { Router } from 'express';
import { getShowDetails, getShowSeatsMap } from '../controllers/show.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT as any);

router.get('/:showId', getShowDetails as any);
router.get('/:showId/seats', getShowSeatsMap as any);

export default router;

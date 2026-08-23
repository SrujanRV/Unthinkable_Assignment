import { Router } from 'express';
import { listVenues, listEvents } from '../controllers/general.controller';
import { authenticateJWT } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT as any);

router.get('/venues', listVenues as any);
router.get('/events', listEvents as any);

export default router;

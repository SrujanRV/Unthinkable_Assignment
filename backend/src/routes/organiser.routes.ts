import { Router } from 'express';
import { createListing, listMyEvents, updateListing } from '../controllers/organiser.controller';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Secure all organiser routes
router.use(authenticateJWT as any);
router.use(requireRoles([Role.ORGANISER]) as any);

router.post('/events', createListing as any);
router.get('/events', listMyEvents as any);
router.put('/events/:eventId', updateListing as any);

export default router;

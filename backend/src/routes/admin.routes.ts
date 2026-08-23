import { Router } from 'express';
import { createVenue, listVenues, getVenueDetails, saveVenueLayout } from '../controllers/admin.controller';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware';
import { Role } from '@prisma/client';

const router = Router();

// Secure all admin routes
router.use(authenticateJWT as any);
router.use(requireRoles([Role.ADMIN]) as any);

router.post('/venues', createVenue);
router.get('/venues', listVenues);
router.get('/venues/:venueId', getVenueDetails);
router.post('/venues/:venueId/layout', saveVenueLayout);

export default router;

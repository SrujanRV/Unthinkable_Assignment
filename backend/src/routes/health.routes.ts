import { Router } from 'express';
import { checkHealth } from '../controllers/health.controller';
import { authenticateJWT, requireRoles } from '../middlewares/auth.middleware';

const router = Router();

router.use(authenticateJWT as any);
router.use(requireRoles(['ADMIN']) as any);

router.get('/', checkHealth as any);


export default router;

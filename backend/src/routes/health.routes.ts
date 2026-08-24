import { Router } from 'express';
import { checkHealth } from '../controllers/health.controller';

const router = Router();

// Public health diagnostic endpoint (for uptime monitors & keep-alive pings)
router.get('/', checkHealth as any);


export default router;

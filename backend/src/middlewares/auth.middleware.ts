import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../services/db.service';
import { Role } from '@prisma/client';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-12345';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: Role;
  };
}

export const authenticateJWT = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: { message: 'Access token missing or invalid', status: 401 } });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string; role: Role };

    // Fetch user from DB to verify they still exist and check their role
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: { id: true, email: true, role: true },
    });

    if (!user) {
      res.status(401).json({ error: { message: 'User no longer exists', status: 401 } });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({ error: { message: 'Invalid or expired token', status: 401 } });
  }
};

export const requireRoles = (roles: Role[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        error: { message: `Forbidden: Requires one of roles [${roles.join(', ')}]`, status: 403 },
      });
      return;
    }

    next();
  };
};

import { Request, Response } from 'express';
import { prisma } from '../services/db.service';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { Role } from '@prisma/client';
import { AuthenticatedRequest } from '../middlewares/auth.middleware';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key-12345';
const JWT_EXPIRES_IN = '24h'; // Using 24 hours expiry for simplicity and ease of use in dev/tests

// Zod schemas for request validation
const RegisterSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  role: z.nativeEnum(Role).default(Role.CUSTOMER),
});

const LoginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string(),
});

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = RegisterSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
          status: 400,
        },
      });
      return;
    }

    const { email, password, role } = validation.data;

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      res.status(400).json({ error: { message: 'Email already registered', status: 400 } });
      return;
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create User
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
      },
      select: {
        id: true,
        email: true,
        role: true,
        createdAt: true,
      },
    });

    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.status(210).json({
      message: 'Registration successful',
      token,
      user,
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: { message: 'Internal server error during registration', status: 500 } });
  }
};

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const validation = LoginSchema.safeParse(req.body);
    if (!validation.success) {
      res.status(400).json({
        error: {
          message: 'Validation failed',
          details: validation.error.flatten().fieldErrors,
          status: 400,
        },
      });
      return;
    }

    const { email, password } = validation.data;

    // Find User
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      res.status(401).json({ error: { message: 'Invalid email or password', status: 401 } });
      return;
    }

    // Compare passwords
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      res.status(401).json({ error: { message: 'Invalid email or password', status: 401 } });
      return;
    }

    // Generate JWT
    const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    res.status(200).json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        createdAt: user.createdAt,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: { message: 'Internal server error during login', status: 500 } });
  }
};

export const getUserProfile = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: { message: 'Unauthorized', status: 401 } });
      return;
    }
    res.status(200).json({ user: req.user });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: { message: 'Internal server error fetching profile', status: 500 } });
  }
};

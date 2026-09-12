import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../db/client';
import { authenticateJwt, AuthenticatedRequest } from '../middleware/auth';

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production-min-32-chars';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'super-secret-jwt-refresh-key-replace-in-production-min-32-chars';

function generateTokens(userId: string, email: string) {
  const accessToken = jwt.sign({ userId, email }, JWT_SECRET, { expiresIn: '1h' });
  const refreshToken = jwt.sign({ userId, email }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
  return { accessToken, refreshToken };
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body || {};

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email address is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (existing) {
      return res.status(409).json({ error: 'User with this email already exists' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: name ? String(name).trim() : null
      }
    });

    const { accessToken, refreshToken } = generateTokens(user.id, user.email);

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000 // 1 hour
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000 // 7 days
    });

    return res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      },
      token: accessToken
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const user = await prisma.user.findUnique({ where: { email: normalizedEmail } });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.email);

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      },
      token: accessToken
    });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Login failed' });
  }
});

// POST /api/auth/refresh
router.post('/refresh', async (req: Request, res: Response) => {
  try {
    const token = req.cookies?.refreshToken || req.body?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: 'Missing refresh token' });
    }

    const decoded = jwt.verify(token, JWT_REFRESH_SECRET) as { userId: string; email: string };
    const user = await prisma.user.findUnique({ where: { id: decoded.userId } });
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.email);

    res.cookie('token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 3600 * 1000
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 3600 * 1000
    });

    return res.json({ token: accessToken });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  return res.json({ ok: true, message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticateJwt, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { id: true, email: true, name: true, createdAt: true }
    });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    return res.json({ user });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to fetch user' });
  }
});

export default router;

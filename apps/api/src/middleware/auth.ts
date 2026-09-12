import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthenticatedRequest extends Request {
  user?: {
    userId: string;
    email: string;
  };
}

export function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  try {
    let token: string | undefined;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    } else if (req.cookies && req.cookies.token) {
      token = req.cookies.token;
    }

    if (!token) {
      res.status(401).json({ error: 'Authentication required: missing token' });
      return;
    }

    const secret = process.env.JWT_SECRET || 'super-secret-jwt-key-replace-in-production-min-32-chars';
    const decoded = jwt.verify(token, secret) as { userId: string; email: string };
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Authentication failed: invalid or expired token' });
  }
}

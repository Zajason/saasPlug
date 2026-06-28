import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

declare global {
  namespace Express {
    interface Request {
      userId?: number;
      userRole?: string;
    }
  }
}

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'a-very-secret-key', (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid token' });
    }

    const payload = decoded as { userId: number; role: string };
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  });
};

// A flexible factory function to check for specific roles
export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.userRole || !allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ 
        error: `Forbidden: Access requires one of the following roles: ${allowedRoles.join(', ')}` 
      });
    }
    next();
  };
};

// Specific helper middlewares you can easily plug into your routes later!
export const requireProvider = requireRole(['PROVIDER_ADMIN']);
export const requireOperator = requireRole(['PLATFORM_OPERATOR']);
export const requireEvUser = requireRole(['EV_USER']);
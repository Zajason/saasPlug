import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

// Extend the Express Request type to include our custom properties
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
  // Bearer Token
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No token provided' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'a-very-secret-key', (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Forbidden: Invalid token' });
    }

    const payload = decoded as { userId: number; role: string };
    console.log("verifyToken payload:", payload, "raw decoded:", decoded);
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  });
};

export const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  console.log("requireAdmin sees userRole =", JSON.stringify(req.userRole));
  const role = (req.userRole || "").trim();
  if (!["PROVIDER_ADMIN", "PLATFORM_OPERATOR"].includes(role)) {
    return res.status(403).json({ error: "Forbidden: provider or operator role required" });
  }
  next();
};



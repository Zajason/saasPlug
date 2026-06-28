import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

declare global {
  namespace Express {
    interface Request {
      userId?: number;
    }
  }
}

export function optionalToken(req: Request, _res: Response, next: NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return next();

  const token = auth.slice("Bearer ".length);
  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) return next();

    const payload = jwt.verify(token, secret) as any;
    const userId = Number(payload?.userId ?? payload?.id);
    if (Number.isFinite(userId)) req.userId = userId;
  } catch {
    // ignore invalid token for public endpoints
  }
  next();
}

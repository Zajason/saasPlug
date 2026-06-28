import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const verifyToken = (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  jwt.verify(token, process.env.JWT_SECRET || "a-very-secret-key", (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: "Forbidden: Invalid token" });
    }

    const payload = decoded as { userId: number; role: string };
    req.userId = payload.userId;
    req.userRole = payload.role;
    next();
  });
};

export const requireOperator = (req: Request, res: Response, next: NextFunction) => {
  if (req.userRole !== "PLATFORM_OPERATOR") {
    return res.status(403).json({ error: "Forbidden: platform operator role required" });
  }
  next();
};

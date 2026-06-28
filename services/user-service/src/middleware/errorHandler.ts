import { Request, Response, NextFunction } from "express";

/**
 * Helper to create a standardized error-log object according to project spec.
 */
export function makeErrorLog(
  req: Request,
  code: number,
  message: string,
  debuginfo = ""
) {
  return {
    call: req.originalUrl,
    timeref: new Date().toISOString(),
    originator: req.ip,
    return_code: code,
    error: message,
    debuginfo,
  };
}

/**
 * Express global error-handling middleware.
 * Catch-all for unhandled exceptions in any route.
 */
export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Determine proper HTTP code
  const status =
    err.statusCode && Number(err.statusCode) >= 400
      ? Number(err.statusCode)
      : 500;

  const message =
    err.message ||
    (status === 400
      ? "Bad request"
      : status === 404
      ? "Not found"
      : "Internal server error");

  const debuginfo =
    process.env.NODE_ENV === "development" && err.stack
      ? err.stack.toString()
      : "";

  const errorLog = makeErrorLog(req, status, message, debuginfo);

  if (process.env.NODE_ENV !== "test") {
    console.error(`❌ [${status}] ${req.method} ${req.originalUrl}`, err);
  }

  res.status(status).json(errorLog);
}
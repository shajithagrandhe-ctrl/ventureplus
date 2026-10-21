import type { Request, Response, NextFunction } from "express";
import { ZodError } from "zod";
import { Prisma } from "@prisma/client";
import { logger } from "../config/logger.js";
import { env } from "../config/env.js";
import { HttpError } from "../utils/httpError.js";

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  // Body-parser errors carry the submitted raw body; never log or return it.
  if (err && typeof err === "object" && "type" in err && err.type === "entity.parse.failed") {
    return res.status(400).json({ success: false, message: "Malformed JSON request" });
  }

  if (err instanceof HttpError) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(env.nodeEnv === "development" && err.details ? { details: err.details } : {})
    });
  }

  if (err instanceof ZodError) {
    return res.status(400).json({
      success: false,
      message: "Validation failed",
      errors: err.flatten().fieldErrors
    });
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2025") {
      return res.status(404).json({
        success: false,
        message: "Record not found"
      });
    }

    return res.status(400).json({
      success: false,
      message: env.nodeEnv === "development" ? err.message : "Database error"
    });
  }

  logger.error({ err }, "Unhandled error");

  return res.status(500).json({
    success: false,
    message: env.nodeEnv === "development" && err instanceof Error ? err.message : "Internal server error"
  });
};

import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { verifyAccessToken, type AccessTokenPayload } from "../utils/tokens.js";
import { prisma } from "../config/prisma.js";
import { logger } from "../config/logger.js";

export interface AuthenticatedRequest extends Request {
  user?: AccessTokenPayload;
}

const extractToken = (req: Request) => {
  const authHeader = req.header("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    return authHeader.replace("Bearer ", "").trim();
  }

  const cookieToken = req.cookies?.[env.accessTokenCookieName];
  return cookieToken;
};

export const requireAuth = async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
  const token = extractToken(req);

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Authentication required"
    });
  }

  let payload: AccessTokenPayload;
  try {
    payload = verifyAccessToken(token);
  } catch {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired token"
    });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, employeeProfile: { select: { status: true, dateOfRelieving: true } } }
    });
    if (!user || user.role !== payload.role) {
      return res.status(401).json({ success: false, message: "Session is no longer valid" });
    }
    const profile = user.employeeProfile;
    if (user.role === "EMPLOYEE" && (profile?.status === "FROZEN" ||
        (profile?.dateOfRelieving && profile.dateOfRelieving <= new Date()))) {
      return res.status(403).json({ success: false, message: "Employee account is frozen" });
    }
    req.user = payload;
    return next();
  } catch {
    logger.error({ event: "auth_session_backend_failure" }, "Session validation backend failed");
    return res.status(500).json({ success: false, message: "Unable to validate session. Please try again later." });
  }
};

export const requireRole = (...roles: string[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required"
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Insufficient permissions"
      });
    }

    return next();
  };

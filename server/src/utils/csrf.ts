import crypto from "crypto";
import type { Request, Response, NextFunction } from "express";
import { env } from "../config/env.js";
import { verifyAccessToken } from "./tokens.js";

const cookieOptions = {
  httpOnly: false,
  sameSite: env.cookieSameSite,
  secure: env.nodeEnv === "production",
  path: "/",
  ...(env.cookieDomain ? { domain: env.cookieDomain } : {})
};

export const issueCsrfToken = (res: Response) => {
  const token = crypto.randomBytes(32).toString("hex");
  res.cookie(env.csrfCookieName, token, cookieOptions);
  return token;
};

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  const method = req.method.toUpperCase();
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return next();
  }

  // Match Express's case-insensitive route and optional trailing slash semantics.
  if (method === "POST" && /^\/api\/auth\/native\/login\/?$/i.test(req.path)) {
    return next();
  }

  const authorization = req.header("authorization");
  if (authorization?.startsWith("Bearer ")) {
    try {
      verifyAccessToken(authorization.slice(7).trim());
      return next();
    } catch {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired token"
      });
    }
  }

  const headerToken = req.header("x-csrf-token");
  const cookieToken = req.cookies?.[env.csrfCookieName];

  if (!headerToken || !cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({
      success: false,
      message: "Invalid CSRF token"
    });
  }

  return next();
};

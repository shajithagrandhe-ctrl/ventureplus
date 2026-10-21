import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string;
  role: string;
  email: string;
  displayName: string;
}

export const signAccessToken = (payload: AccessTokenPayload) => {
  return jwt.sign(payload, env.jwtSecret as any, { algorithm: "HS256", expiresIn: env.jwtExpiresIn as any });
};

export const verifyAccessToken = (token: string) => {
  const payload = jwt.verify(token, env.jwtSecret as any, { algorithms: ["HS256"] });
  if (typeof payload === "string" || typeof payload.sub !== "string" || !payload.sub ||
      typeof payload.email !== "string" || typeof payload.displayName !== "string" ||
      typeof payload.exp !== "number" || !Number.isSafeInteger(payload.exp) ||
      !["ADMIN", "EMPLOYEE", "CUSTOMER", "AGENT"].includes(payload.role)) {
    throw new Error("Invalid token claims");
  }
  return payload as AccessTokenPayload;
};

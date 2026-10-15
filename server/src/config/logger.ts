import pino from "pino";
import { env } from "./env.js";

export const loggerOptions = {
  level: env.logLevel,
  redact: {
    paths: ["req.headers.authorization", "req.headers.cookie", 'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]', "req.body.password", "req.body.currentPassword", "req.body.newPassword",
      "req.body.adminCode", "password", "passwordHash", "token", "adminCode"],
    censor: "[Redacted]"
  },
  base: {
    service: "estatehub-api"
  }
};

export const logger = pino(loggerOptions);

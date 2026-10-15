import assert from "node:assert/strict";
import { test } from "node:test";
import { Writable } from "node:stream";
import { randomBytes } from "node:crypto";
import pino from "pino";

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.DATABASE_URL = "mongodb://127.0.0.1:27017/unused_logging_test";
const { loggerOptions } = await import("../dist/config/logger.js");

test("request logs redact native tokens, website cookies and authentication fields", async () => {
  let output = "";
  const stream = new Writable({ write(chunk, _encoding, done) { output += chunk.toString(); done(); } });
  const logger = pino({ ...loggerOptions, level: "info" }, stream);
  const secret = randomBytes(24).toString("hex");
  logger.info({ req: { headers: { authorization: `Bearer ${secret}`, cookie: secret, "x-csrf-token": secret },
    body: { password: secret, currentPassword: secret, newPassword: secret, adminCode: secret } },
    res: { headers: { "set-cookie": [secret] } }, token: secret, passwordHash: secret, adminCode: secret }, "fixture request");
  assert(!output.includes(secret));
  assert.equal(JSON.parse(output).req.headers.authorization, "[Redacted]");
  assert(output.includes("fixture request"));
});

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import bcrypt from "bcryptjs";

process.env.NODE_ENV = "production";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.DATABASE_URL = "mongodb://127.0.0.1:27017/unused";
process.env.LOG_LEVEL = "silent";

const { prisma } = await import("../dist/config/prisma.js");
const { createApp } = await import("../dist/app.js");

test("native bearer authentication preserves cookie CSRF protection", async (t) => {
  const password = randomBytes(16).toString("hex");
  const record = {
    id: "fixture-user",
    email: "fixture@example.test",
    passwordHash: await bcrypt.hash(password, 4),
    displayName: "Fixture",
    fullName: "Fixture User",
    role: "CUSTOMER",
    department: null,
    position: null,
    adminCode: "must-not-leak",
    employeeId: null,
    phoneNumber: null,
    address: null,
    createdAt: new Date(),
    lastLogin: null,
    employeeProfile: null
  };
  const replace = (target, key, implementation) => {
    const original = target[key];
    target[key] = implementation;
    t.after(() => { target[key] = original; });
  };
  replace(prisma.user, "findUnique", async ({ where, select }) => {
    if ((where.id && where.id !== record.id) || (where.email && where.email !== record.email)) return null;
    if (!select) return record;
    return Object.fromEntries(Object.keys(select).map((key) => [key, record[key]]));
  });
  replace(prisma.user, "update", async ({ data }) => Object.assign(record, data));

  const server = createServer(createApp());
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const post = (path, body, token) => fetch(`${base}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  assert.equal((await post("/auth/login", { email: record.email, password })).status, 403);
  assert.equal((await post("/auth/native/login", { email: record.email, password: "wrong-password" })).status, 401);

  const login = await post("/auth/native/login", { email: record.email, password });
  assert.equal(login.status, 200);
  assert.equal(login.headers.get("set-cookie"), null);
  assert.equal(login.headers.get("cache-control"), "no-store");
  const loginPayload = await login.json();
  assert.equal(loginPayload.success, true);
  assert.equal(loginPayload.data.user.adminCode, undefined);
  assert.equal(typeof loginPayload.data.token, "string");

  const token = loginPayload.data.token;
  const profile = await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).data.user.adminCode, undefined);

  assert.equal((await post("/auth/change-password", {
    currentPassword: password,
    newPassword: randomBytes(16).toString("hex")
  }, "invalid-token")).status, 401);
  assert.equal((await post("/auth/logout", {}, token)).status, 200);
});

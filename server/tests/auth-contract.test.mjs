import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

process.env.NODE_ENV = "production";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.DATABASE_URL = "mongodb://127.0.0.1:27017/unused_auth_contract";
process.env.LOG_LEVEL = "silent";
const { prisma } = await import("../dist/config/prisma.js");
const { createApp } = await import("../dist/app.js");

test("native login contract, browser compatibility and current account authorization", async t => {
  const password = randomBytes(16).toString("hex");
  const users = await Promise.all(["ADMIN", "EMPLOYEE", "CUSTOMER", "AGENT"].map(async role => ({
    id: `fixture-${role}`, email: `${role.toLowerCase()}@example.test`, role,
    passwordHash: await bcrypt.hash(password, 4), fullName: `Fixture ${role}`, displayName: role,
    adminCode: "private-admin-code", employeeProfile: null, createdAt: new Date(), lastLogin: null
  })));
  let backendFailure = false;
  const originals = { find: prisma.user.findUnique, update: prisma.user.update,
    profile: prisma.employeeProfile.findUnique, profileUpdate: prisma.employeeProfile.update };
  prisma.user.findUnique = async ({ where }) => {
    if (backendFailure) throw new Error("private-database-detail");
    return users.find(user => where.email ? user.email === where.email : user.id === where.id) ?? null;
  };
  prisma.user.update = async ({ where, data }) => Object.assign(users.find(user => user.id === where.id), data);
  prisma.employeeProfile.findUnique = async ({ where }) => users.find(user => user.id === where.userId)?.employeeProfile ?? null;
  prisma.employeeProfile.update = async ({ where, data }) => Object.assign(users.find(user => user.id === where.userId).employeeProfile, data);
  t.after(() => {
    prisma.user.findUnique = originals.find; prisma.user.update = originals.update;
    prisma.employeeProfile.findUnique = originals.profile; prisma.employeeProfile.update = originals.profileUpdate;
  });
  const server = createServer(createApp()); server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const oldBinding = process.env.SERVER_INTERNAL_URL;
  process.env.SERVER_INTERNAL_URL = `http://127.0.0.1:${server.address().port}`;
  const gateway = createServer((await import("../../backend/index.mjs")).default);
  gateway.listen(0, "127.0.0.1"); await once(gateway, "listening");
  t.after(async () => {
    gateway.closeAllConnections(); await new Promise(resolve => gateway.close(resolve));
    if (oldBinding === undefined) delete process.env.SERVER_INTERNAL_URL;
    else process.env.SERVER_INTERNAL_URL = oldBinding;
  });
  const base = `http://127.0.0.1:${gateway.address().port}/api`;
  let ip = 1;
  const post = (path, body, headers = {}) => fetch(`${base}${path}`, { method: "POST",
    headers: { "Content-Type": "application/json", "x-forwarded-for": `192.0.2.${ip++}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body) });
  const tokens = new Map();

  for (const user of users) await t.test(`${user.role}: native and web use the same password validator`, async () => {
    const native = await post("/auth/native/login", { email: ` ${user.email.toUpperCase()} `, password, expectedRole: user.role });
    assert.equal(native.status, 200);
    assert.equal(native.headers.get("set-cookie"), null);
    assert.equal(native.headers.get("cache-control"), "no-store");
    const payload = await native.json();
    assert.equal(payload.data.user.role, user.role);
    assert.equal(payload.data.user.id, user.id);
    assert(!JSON.stringify(payload).includes(user.passwordHash));
    assert(!JSON.stringify(payload).includes(user.adminCode));
    const decoded = jwt.verify(payload.data.token, process.env.JWT_SECRET, { algorithms: ["HS256"] });
    assert(decoded.exp > decoded.iat);
    tokens.set(user.role, payload.data.token);
    const csrf = await fetch(`${base}/auth/csrf`);
    const token = (await csrf.json()).data.token;
    const cookie = csrf.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    const web = await post("/auth/login", { email: user.email, password }, { cookie, "x-csrf-token": token });
    assert.equal(web.status, 200);
    const webPayload = await web.json();
    assert.equal(webPayload.data.user.id, payload.data.user.id);
    assert.equal(webPayload.data.token, undefined);
    assert(web.headers.get("set-cookie").includes("HttpOnly"));
  });

  await t.test("wrong passwords and unknown accounts fail identically", async () => {
    const known = await post("/auth/native/login", { email: users[0].email, password: "wrong-password" });
    const unknown = await post("/auth/native/login", { email: "unknown@example.test", password });
    assert.equal(known.status, 401); assert.equal(unknown.status, 401);
    assert.deepEqual(await known.json(), await unknown.json());
  });
  await t.test("legacy mixed-case account emails remain usable without rewriting identities", async () => {
    const admin = users[0], originalEmail = admin.email;
    admin.email = "Legacy.Admin@example.test";
    try {
      const response = await post("/auth/native/login", { email: admin.email, password });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).data.user.email, admin.email);
    } finally { admin.email = originalEmail; }
  });
  await t.test("body validation rejects missing, malformed and unsupported portal data", async () => {
    for (const body of [{}, { email: users[0].email }, { password }, { email: "bad", password },
      { email: users[0].email, password, expectedRole: "OWNER" }, { email: users[0].email, password, role: "ADMIN" }, "{broken-json"]) {
      const response = await post("/auth/native/login", body);
      assert.equal(response.status, 400);
      const payload = await response.json();
      assert.equal(payload.success, false); assert(!JSON.stringify(payload).includes(password));
    }
  });
  await t.test("portal mismatch cannot mint another role's session", async () => {
    const response = await post("/auth/native/login", { email: users[2].email, password, expectedRole: "ADMIN" });
    assert.equal(response.status, 401);
    assert.equal((await response.json()).data, undefined);
  });
  await t.test("Express case and trailing-slash routing keep native login registered", async () => {
    const response = await post("/AUTH/NATIVE/LOGIN/", { email: users[0].email, password });
    assert.equal(response.status, 200);
  });
  await t.test("browser mutations still require CSRF", async () => {
    assert.equal((await post("/auth/login", { email: users[0].email, password })).status, 403);
    assert.equal((await post("/auth/register", {})).status, 403);
  });
  await t.test("expired, missing and forged-role tokens cannot access protected endpoints", async () => {
    assert.equal((await fetch(`${base}/auth/me`)).status, 401);
    const customer = users[2];
    const claims = { sub: customer.id, email: customer.email, displayName: customer.displayName, role: customer.role };
    for (const token of [jwt.sign(claims, process.env.JWT_SECRET, { expiresIn: -1 }),
      jwt.sign({ ...claims, role: "ADMIN" }, process.env.JWT_SECRET, { expiresIn: 60 }),
      jwt.sign(claims, process.env.JWT_SECRET),
      jwt.sign(claims, process.env.JWT_SECRET, { algorithm: "HS384", expiresIn: 60 })]) {
      assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })).status, 401);
    }
    const forbidden = await post("/auth/customers", {}, { Authorization: `Bearer ${tokens.get("CUSTOMER")}` });
    assert.equal(forbidden.status, 403);
  });
  await t.test("deleted accounts and changed roles invalidate previously issued claims", async () => {
    const customer = users.splice(2, 1)[0];
    try {
      assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${tokens.get("CUSTOMER")}` } })).status, 401);
    } finally { users.splice(2, 0, customer); }
    customer.role = "AGENT";
    try {
      assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${tokens.get("CUSTOMER")}` } })).status, 401);
    } finally { customer.role = "CUSTOMER"; }
  });
  await t.test("frozen and relieved employees cannot log in or reuse an earlier session", async () => {
    const employee = users[1];
    for (const profile of [{ status: "FROZEN", dateOfRelieving: null }, { status: "ACTIVE", dateOfRelieving: new Date(0) }]) {
      employee.employeeProfile = profile;
      assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${tokens.get("EMPLOYEE")}` } })).status, 403);
      assert.equal((await post("/auth/native/login", { email: employee.email, password })).status, 403);
    }
    employee.employeeProfile = null;
  });
  await t.test("backend failures are safe server errors, not invalid passwords", async () => {
    backendFailure = true;
    try {
      const response = await post("/auth/native/login", { email: users[0].email, password });
      assert.equal(response.status, 500);
      assert(!JSON.stringify(await response.json()).includes("private-database-detail"));
      assert.equal((await fetch(`${base}/auth/me`, { headers: { Authorization: `Bearer ${tokens.get("ADMIN")}` } })).status, 500);
    } finally { backendFailure = false; }
  });
  await t.test("logout clears browser cookies and remains available for a bearer client", async () => {
    const response = await post("/auth/logout", {}, { Authorization: `Bearer ${tokens.get("ADMIN")}` });
    assert.equal(response.status, 200);
    assert(response.headers.getSetCookie().some(value => value.startsWith("estatehub_access=;")));
  });
  await t.test("web and native login share the rate limit", async () => {
    const headers = { "x-forwarded-for": "198.51.100.99" };
    for (let i = 0; i < 20; i++) assert.equal((await post("/auth/native/login", {}, headers)).status, 400);
    assert.equal((await post("/auth/native/login", {}, headers)).status, 429);
    const csrf = await fetch(`${base}/auth/csrf`);
    const token = (await csrf.json()).data.token;
    const cookie = csrf.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert.equal((await post("/auth/login", {}, { ...headers, cookie, "x-csrf-token": token })).status, 429);
  });
});

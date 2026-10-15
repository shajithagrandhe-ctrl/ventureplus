import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { once } from "node:events";
import { createServer } from "node:http";
import { test } from "node:test";
import bcrypt from "bcryptjs";
import { verifySharedBackend } from "../scripts/verify-shared-backend.mjs";

process.env.NODE_ENV = "production";
process.env.JWT_SECRET = randomBytes(32).toString("hex");
process.env.DATABASE_URL = "mongodb://127.0.0.1:27017/unused_protocol_test";
process.env.LOG_LEVEL = "silent";
const { prisma } = await import("../dist/config/prisma.js");
const { createApp } = await import("../dist/app.js");

test("cookie and native clients share records through the real routes and clean up only their fixture", async t => {
  const password = randomBytes(16).toString("hex");
  const users = await Promise.all(["ADMIN", "CUSTOMER", "EMPLOYEE", "AGENT"].map(async role => ({
    id: randomUUID(), email: `${role.toLowerCase()}@example.test`, passwordHash: await bcrypt.hash(password, 4),
    displayName: role, fullName: role, role, createdAt: new Date(), lastLogin: null, employeeProfile: null
  })));
  const unrelatedId = randomUUID();
  const plotId = randomUUID();
  const leadRows = Array.from({ length: 45 }, (_, index) => ({ id: randomUUID(), plotId, customerName: `Fixture ${index}`,
    email: index < 3 ? users[1].email : "other@example.test" }));
  const records = new Map([[unrelatedId, { id: unrelatedId, contactName: "Unrelated record", notes: "must remain untouched" }]]);
  const replace = (target, key, value) => {
    const original = target[key]; target[key] = value;
    t.after(() => { target[key] = original; });
  };
  replace(prisma.user, "findUnique", async ({ where, select }) => {
    const user = users.find(user => where.email ? user.email === where.email : user.id === where.id);
    if (!user) return null;
    return select ? Object.fromEntries(Object.keys(select).map(key => [key, user[key] ?? null])) : user;
  });
  replace(prisma.user, "update", async ({ where, data }) => Object.assign(users.find(user => user.id === where.id), data));
  replace(prisma.employeeProfile, "findUnique", async () => ({ status: "ACTIVE", dateOfRelieving: null }));
  const assetId = randomUUID();
  replace(prisma.ventureAsset, "findUnique", async ({ where }) => where.id === assetId ? {
    id: assetId, contentType: "application/pdf", data: Buffer.from("%PDF-fixture")
  } : null);
  replace(prisma.lead, "count", async ({ where }) => leadRows.filter(row => !where.email || row.email === where.email).length);
  replace(prisma.lead, "findMany", async ({ skip, take, where }) => {
    assert.equal(where.plotId, plotId);
    return leadRows.filter(row => !where.email || row.email === where.email).slice(skip, skip + take);
  });
  replace(prisma.customerRecord, "count", async () => records.size);
  replace(prisma.customerRecord, "findMany", async ({ skip = 0, take = 10 }) => [...records.values()].slice(skip, skip + take));
  replace(prisma.customerRecord, "create", async ({ data }) => {
    const record = { ...data, id: randomUUID() }; records.set(record.id, record); return record;
  });
  replace(prisma.customerRecord, "update", async ({ where, data }) => {
    assert(records.has(where.id));
    assert.notEqual(where.id, unrelatedId);
    return Object.assign(records.get(where.id), data);
  });
  replace(prisma.customerRecord, "delete", async ({ where }) => {
    assert.notEqual(where.id, unrelatedId);
    const record = records.get(where.id); records.delete(where.id); return record;
  });
  const server = createServer(createApp());
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  t.after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}/api`;
  const assetHead = await fetch(`http://127.0.0.1:${server.address().port}/uploads/assets/${assetId}`, { method: "HEAD" });
  assert.equal(assetHead.status, 200);
  assert.equal(assetHead.headers.get("content-type"), "application/pdf");
  assert.equal(await assetHead.text(), "");
  const result = await verifySharedBackend({ baseUrl, accounts: users.map(user => ({ email: user.email, password, role: user.role })), allowTestRecord: true });
  assert.equal(result.synchronization, "protocol_verified", JSON.stringify(result));
  assert(result.checks.every(check => check.ok));
  assert.equal(result.cleanupVerified, true);
  assert.equal(records.size, 1);
  assert.equal(records.get(unrelatedId).notes, "must remain untouched");
  assert(!JSON.stringify(result).includes(password));
  const { signAccessToken } = await import("../dist/utils/tokens.js");
  const token = signAccessToken({ sub: users[0].id, role: "ADMIN", email: users[0].email, displayName: "Fixture" });
  const secondPage = await fetch(`${baseUrl}/plots/${plotId}/leads?page=2&pageSize=30`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(secondPage.status, 200);
  const leadPage = await secondPage.json();
  assert.equal(leadPage.pagination.page, 2);
  assert.equal(leadPage.pagination.total, 45);
  assert.equal(leadPage.data.length, 15);
  assert.equal(leadPage.data[0].id, leadRows[30].id);
  for (const user of users.filter(user => ["CUSTOMER", "AGENT"].includes(user.role))) {
    const restrictedToken = signAccessToken({ sub: user.id, role: user.role, email: user.email, displayName: user.displayName });
    const forbidden = await fetch(`${baseUrl}/total-data`, { method: "POST", headers: {
      Authorization: `Bearer ${restrictedToken}`, "Content-Type": "application/json"
    }, body: JSON.stringify({ contactName: "Forbidden fixture" }) });
    assert.equal(forbidden.status, 403);
    assert.equal(records.size, 1);
    if (user.role === "CUSTOMER") {
      const ownLeads = await fetch(`${baseUrl}/plots/${plotId}/leads`, { headers: { Authorization: `Bearer ${restrictedToken}` } });
      assert.equal(ownLeads.status, 200);
      const ownPayload = await ownLeads.json();
      assert.equal(ownPayload.data.length, 3);
      assert(ownPayload.data.every(row => row.email === user.email));
    }
  }
  const writesDisabled = await verifySharedBackend({ baseUrl, accounts: [{ email: users[0].email, password }], allowTestRecord: false });
  assert.equal(writesDisabled.synchronization, "not_run");
  assert.equal(writesDisabled.reason, "test_record_write_not_enabled");
  assert.equal(records.size, 1);
});

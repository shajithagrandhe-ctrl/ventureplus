import assert from "node:assert/strict";
import { test } from "node:test";
import { provisionAccounts } from "../scripts/provision-shared-accounts.mjs";

const account = { email: "admin@estatehub.com", password: "fixture-only-password", fullName: "Fixture Administrator" };
const fail = () => assert.fail("Unexpected database write or password hashing");

test("existing accounts retain their role and credentials", async () => {
  const result = await provisionAccounts({ prisma: { user: { findUnique: async () => ({ id: "existing", role: "CUSTOMER" }), create: fail } },
    accounts: [account], hashPassword: fail, apply: true });
  assert.deepEqual(result, [{ email: account.email, status: "existing_unchanged", roleMatches: false }]);
});

test("missing accounts default to a read-only dry run", async () => {
  const result = await provisionAccounts({ prisma: { user: { findUnique: async () => null, create: fail } }, accounts: [account], hashPassword: fail });
  assert.equal(result[0].status, "missing_dry_run");
});

test("authorized missing accounts use a hash and the fixed existing role", async () => {
  let created;
  const result = await provisionAccounts({ prisma: { user: { findUnique: async () => null, create: async ({ data }) => { created = data; } } },
    accounts: [{ ...account, role: "CUSTOMER" }], hashPassword: async () => "fixture-hash", apply: true });
  assert.equal(created.role, "ADMIN");
  assert.equal(created.passwordHash, "fixture-hash");
  assert.equal(created.password, undefined);
  assert.equal(result[0].status, "created");
  assert(!JSON.stringify(result).includes(account.password));
});

test("validates the entire account batch before any database operation", async () => {
  await assert.rejects(provisionAccounts({ prisma: { user: { findUnique: fail, create: fail } },
    accounts: [account, { ...account, email: "unauthorized@example.test" }], hashPassword: fail, apply: true }));
  await assert.rejects(provisionAccounts({ prisma: { user: { findUnique: fail, create: fail } },
    accounts: [account, account], hashPassword: fail, apply: true }));
});

test("concurrent creation never overwrites the winning account", async () => {
  let reads = 0;
  const result = await provisionAccounts({ prisma: { user: {
    findUnique: async () => ++reads === 1 ? null : { id: "winner", role: "ADMIN" },
    create: async () => { throw Object.assign(new Error("duplicate"), { code: "P2002" }); }
  } }, accounts: [account], hashPassword: async () => "fixture-hash", apply: true });
  assert.equal(result[0].status, "existing_unchanged");
  assert.equal(reads, 2);
});

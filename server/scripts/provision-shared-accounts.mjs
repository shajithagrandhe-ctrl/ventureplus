import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";

const authorizedAccounts = new Map([
  ["admin@estatehub.com", "ADMIN"],
  ["manager@estatehub.com", "ADMIN"],
  ["john.employee@estatehub.com", "EMPLOYEE"],
  ["customer1@estatehub.com", "CUSTOMER"]
]);

export function validateAccounts(input) {
  assert(Array.isArray(input) && input.length > 0 && input.length <= 4, "Provide one to four authorized accounts");
  const seen = new Set();
  return input.map(account => {
    const email = String(account.email ?? "").trim().toLowerCase();
    assert(authorizedAccounts.has(email) && !seen.has(email), "Unknown or duplicate account");
    seen.add(email);
    assert(typeof account.password === "string" && account.password.length >= 8, "Account password must contain at least eight characters");
    assert(typeof account.fullName === "string" && account.fullName.trim().length >= 2, "Provide the account name");
    return { email, password: account.password, fullName: account.fullName.trim(), role: authorizedAccounts.get(email) };
  });
}

export async function provisionAccounts({ prisma, accounts, hashPassword, apply = false }) {
  const validated = validateAccounts(accounts);
  const results = [];
  for (const account of validated) {
    const where = { email: account.email };
    const select = { id: true, role: true };
    const existing = await prisma.user.findUnique({ where, select });
    if (existing) {
      results.push({ email: account.email, status: "existing_unchanged", roleMatches: existing.role === account.role });
      continue;
    }
    if (!apply) {
      results.push({ email: account.email, status: "missing_dry_run" });
      continue;
    }
    const data = {
      email: account.email,
      passwordHash: await hashPassword(account.password),
      role: account.role,
      fullName: account.fullName,
      displayName: account.fullName
    };
    try {
      await prisma.user.create({ data, select });
      results.push({ email: account.email, status: "created" });
    } catch (error) {
      // A concurrent provisioner may create this email after the existence check.
      if (error?.code !== "P2002") throw new Error("Account provisioning failed; database details suppressed");
      const concurrent = await prisma.user.findUnique({ where, select });
      if (!concurrent) throw new Error("Account creation conflict; rerun the existence check");
      results.push({ email: account.email, status: "existing_unchanged", roleMatches: concurrent.role === account.role });
    }
  }
  return results;
}

async function main() {
  await import("dotenv/config");
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert(["mongodb:", "mongodb+srv:"].includes(url.protocol), "Configure the existing server MongoDB URL");
  assert(process.env.VP_EXPECTED_DATABASE && decodeURIComponent(url.pathname.slice(1)) === process.env.VP_EXPECTED_DATABASE,
    "VP_EXPECTED_DATABASE must match the configured database name");
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    assert(size <= 16384, "Account input exceeds the permitted size");
    chunks.push(chunk);
  }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new Error("Provide valid account JSON through standard input"); }
  const accounts = validateAccounts(input);
  const { PrismaClient } = await import("@prisma/client");
  const { default: bcrypt } = await import("bcryptjs");
  const prisma = new PrismaClient();
  try {
    const results = await provisionAccounts({ prisma, accounts, hashPassword: password => bcrypt.hash(password, 12), apply: process.argv.includes("--apply") });
    console.log(JSON.stringify({ mode: process.argv.includes("--apply") ? "create_missing_only" : "dry_run", accounts: results }));
  } finally { await prisma.$disconnect(); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Provisioning stopped. Check input, database selection and server access; existing accounts were not modified."); process.exitCode = 1; });
}

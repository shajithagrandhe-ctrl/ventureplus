import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { createApiClient, validateApiUrl } from "../../shared/api-client.ts";

export async function verifySharedBackend({ baseUrl, accounts, allowTestRecord = false, fetchImpl = fetch }) {
  const base = validateApiUrl(baseUrl, /^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/.test(baseUrl));
  assert(Array.isArray(accounts) && accounts.length > 0 && accounts.length <= 4, "Provide one to four test accounts");
  const checks = [];
  const recordCheck = (name, ok, status) => checks.push({ name, ok, ...(status ? { status } : {}) });
  async function browser(account) {
    const cookies = new Map();
    const request = async (path, method = "GET", body) => {
      const response = await fetchImpl(`${base}${path}`, {
        method,
        headers: {
          Origin: new URL(base).origin,
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "),
          ...(cookies.has("estatehub_csrf") ? { "x-csrf-token": cookies.get("estatehub_csrf") } : {}),
          ...(body ? { "Content-Type": "application/json" } : {})
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: AbortSignal.timeout(25000)
      });
      for (const cookie of response.headers.getSetCookie()) {
        const pair = cookie.split(";", 1)[0];
        const index = pair.indexOf("=");
        cookies.set(pair.slice(0, index), pair.slice(index + 1));
      }
      let payload;
      try { payload = await response.json(); } catch { throw new Error(`Invalid JSON for ${method} ${path}`); }
      if (!response.ok || payload.success !== true) throw Object.assign(new Error(`Request failed for ${method} ${path}`), { status: response.status });
      return payload;
    };
    await request("/auth/csrf");
    const result = await request("/auth/login", "POST", { email: account.email, password: account.password });
    assert(cookies.has("estatehub_access"), "Website login did not set the access cookie");
    return { request, user: result.data.user };
  }
  async function native(account) {
    let token = null;
    const api = createApiClient({ baseUrl: base, getToken: async () => token, onUnauthorized: () => { token = null; }, fetch: fetchImpl, timeoutMs: 25000 });
    const login = await api.request("/auth/native/login", { method: "POST", authenticated: false, body: { email: account.email, password: account.password } });
    assert(typeof login.data.token === "string" && login.data.token.length > 0, "Native login returned no bearer token");
    token = login.data.token;
    return { request: (path, method = "GET", body) => {
      const url = new URL(path, "https://verification.invalid");
      assert.equal(url.origin, "https://verification.invalid");
      return api.request(url.pathname, { method, body, query: Object.fromEntries(url.searchParams) });
    }, user: login.data.user };
  }
  const health = await fetchImpl(`${base}/health`, { signal: AbortSignal.timeout(25000) });
  recordCheck("api_health", health.ok && (await health.json()).success === true, health.status);
  let admin;
  for (const [index, account] of accounts.entries()) {
    assert(typeof account.email === "string" && typeof account.password === "string", "Provide account email and password");
    for (const [kind, connect] of [["website", browser], ["native", native]]) {
      try {
        const session = await connect(account);
        const me = await session.request("/auth/me");
        assert.equal(me.data.user.id, session.user.id);
        if (account.role) assert.equal(me.data.user.role, account.role);
        recordCheck(`account_${index + 1}_${kind}_login_restore`, true);
        if (kind === "native" && session.user.role === "ADMIN") admin ??= account;
        if (session.user.role !== "ADMIN") {
          try { await session.request("/employee-access/employees"); recordCheck(`account_${index + 1}_${kind}_admin_denied`, false); }
          catch (error) { recordCheck(`account_${index + 1}_${kind}_admin_denied`, error.status === 403, error.status); }
        }
        await session.request("/auth/logout", "POST", {});
        recordCheck(`account_${index + 1}_${kind}_logout`, true);
      } catch (error) { recordCheck(`account_${index + 1}_${kind}_login_restore`, false, error.status); }
    }
  }
  if (!checks.every(check => check.ok) || !allowTestRecord || !admin) {
    return { checks, synchronization: "not_run", reason: !checks.every(check => check.ok) ? "authentication_or_authorization_failed" : !allowTestRecord ? "test_record_write_not_enabled" : "administrator_required" };
  }
  const marker = `VP-SYNC-TEST-${randomUUID()}`;
  const web = await browser(admin);
  const app = await native(admin);
  const input = { contactName: marker, contactNumber: "0000000000", location: "Integration verification", budget: "0", recordOwner: marker, notes: marker, status: "FOLLOWING_UP" };
  let recordId;
  let cleanupVerified = false;
  async function find(session, id) {
    for (let page = 1; page <= 20; page++) {
      const response = await session.request(`/total-data?page=${page}&pageSize=100`);
      const match = response.data.find(record => record.id === id);
      if (match) return match;
      if (!response.pagination || page >= response.pagination.pageCount) return null;
    }
    throw new Error("Verification exceeded its bounded pagination limit");
  }
  try {
    const created = await web.request("/total-data", "POST", input);
    recordId = created.data.id;
    assert(recordId, "Created test record has no identifier");
    assert.equal((await find(app, recordId))?.notes, marker, "Website write was not visible to native client");
    recordCheck("website_create_native_read", true);
    await app.request(`/total-data/${recordId}`, "PUT", { ...input, notes: `${marker}:native` });
    assert.equal((await find(web, recordId))?.notes, `${marker}:native`);
    recordCheck("native_update_website_read", true);
    await web.request(`/total-data/${recordId}`, "PUT", { ...input, notes: `${marker}:website` });
    const freshApp = await native(admin);
    assert.equal((await find(freshApp, recordId))?.notes, `${marker}:website`, "Website update did not survive native session restoration");
    const freshWeb = await browser(admin);
    assert.equal((await find(freshWeb, recordId))?.notes, `${marker}:website`);
    recordCheck("fresh_sessions_read_persisted_changes", true);
    await freshApp.request(`/total-data/${recordId}`, "DELETE");
    cleanupVerified = (await find(freshWeb, recordId)) === null;
    assert(cleanupVerified, "Test-record deletion was not visible to website client");
    recordCheck("native_delete_website_read", true);
    await freshApp.request("/auth/logout", "POST", {});
    await freshWeb.request("/auth/logout", "POST", {});
  } catch {
    recordCheck("two_way_persistence", false);
  } finally {
    if (recordId && !cleanupVerified) {
      try {
        const current = await find(web, recordId);
        if (!current) cleanupVerified = true;
        else if (current.contactName === marker && current.notes?.startsWith(marker)) {
          await web.request(`/total-data/${recordId}`, "DELETE");
          cleanupVerified = (await find(web, recordId)) === null;
        }
      } catch { /* A cleanup failure must be surfaced, never broadened to other records. */ }
    }
    await Promise.allSettled([web.request("/auth/logout", "POST", {}), app.request("/auth/logout", "POST", {})]);
  }
  return { checks, synchronization: checks.every(check => check.ok) && cleanupVerified ? "protocol_verified" : "failed", cleanupVerified,
    ...(!cleanupVerified ? { ...(recordId ? { testRecordId: recordId } : {}), testRecordMarker: marker } : {}), uiVerification: "not_performed" };
}

async function main() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) { size += chunk.length; assert(size <= 16384, "Verification input too large"); chunks.push(chunk); }
  let input;
  try { input = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { throw new Error("Provide verification configuration through standard input"); }
  const result = await verifySharedBackend({ ...input, allowTestRecord: process.argv.includes("--allow-test-record") });
  console.log(JSON.stringify(result, null, 2));
  if (!result.checks.every(check => check.ok) || result.synchronization !== "protocol_verified") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { console.error("Verification failed; sensitive request and response details suppressed."); process.exitCode = 1; });
}

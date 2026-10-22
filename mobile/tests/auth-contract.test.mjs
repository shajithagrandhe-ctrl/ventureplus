import assert from "node:assert/strict";
import { test } from "node:test";
import { nativeSessionSchema } from "../../shared/auth-contracts.ts";

test("native session schema requires both user and token and all supported roles", () => {
  for (const role of ["ADMIN", "EMPLOYEE", "CUSTOMER", "AGENT"]) {
    const user = { id: "507f1f77bcf86cd799439011", email: "synthetic@example.test", displayName: "Synthetic", fullName: "Synthetic User", role };
    assert.equal(nativeSessionSchema.parse({ user, token: "fixture-token" }).user.role, role);
    for (const value of [{ user }, { token: "fixture-token" }, { user, token: "" }, { user: { ...user, role: "OWNER" }, token: "fixture-token" }]) {
      assert.equal(nativeSessionSchema.safeParse(value).success, false);
    }
  }
});

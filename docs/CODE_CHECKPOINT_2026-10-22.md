# Code checkpoint — 22 October 2026

This record supersedes earlier local test totals and repository mapping claims.
It records local checks completed in this session, not a deployment or APK release.

## Repository mapping

- Production website/backend: VenkataVyshnaviMondi/ventureplus123, repair branch
  fix/shared-native-auth, existing implementation commit 61f06e7.
- Android source: shajithagrandhe-ctrl/ventureplus, same branch name in a separate
  repository; preserved implementation c3feeb2 and documentation 4b8cdb2.
- The production website repository uses MySQL. The app repository still contains
  a legacy MongoDB backend; do not deploy that backend over the MySQL service or
  replace production database configuration. The Android client consumes HTTP APIs.

## Latest local verification

Commands run from the relevant repository root unless a directory is stated.

| Check | Command | Result |
| --- | --- | --- |
| Website backend/CSRF | node --require ../production-auth-repair/.local-run/regression-no-services-20261022.cjs --test server/tests/*.test.mjs client/tests/csrf-fetch.test.mjs | 150 passed, 0 failed |
| Converter tests | Same guarded invocation targeting server/tests/mongo-mysql-record.test.mjs | 4 passed, included in 150 |
| Isolation mocks | node --test server/tests/isolated-config.test.mjs | 101 passed, included in 150 |
| App backend/CSRF | Same guarded full-suite command from app root | 31 passed, 0 failed |
| Web UI | node ../node_modules/vitest/vitest.mjs run, from each client directory | Website 10 passed; app web 1 passed |
| Backend compile | node node_modules/typescript/bin/tsc -p server/tsconfig.json | Both repositories passed |
| Web types | node node_modules/typescript/bin/tsc --noEmit -p client/tsconfig.app.json | Both passed |
| Web production build | node ../node_modules/vite/bin/vite.js build, from each client directory | Both passed; chunk-size warnings |
| Mobile types | node mobile/node_modules/typescript/bin/tsc --noEmit -p mobile/tsconfig.json | Passed |
| Mobile contracts | node --test mobile/tests/*.test.mjs | 28 passed |
| Mobile components | node mobile/node_modules/jest/bin/jest.js --config mobile/jest.config.cjs --runInBand | 17 passed, 3 suites |

The temporary regression preload is ignored local tooling, not a repository
prerequisite or committed source. It blocked actual Prisma queries and service
connections while allowing local HTTP fixtures. Isolation tests independently trap
network APIs and use fake database adapters. No real database or Redis was contacted.
Node tests/builds used Node 24.19.0; npm metadata operations used Node 24.22.1.
The server declares Node 22.x: clean-install verification on Node 22 remains open.
Existing lint limitations remain unresolved; no new full lint pass is claimed.

## Android JavaScript export

Run from the app mobile directory in PowerShell:

```powershell
$env:CI='1'
$env:EXPO_OFFLINE='1'
$env:EXPO_NO_DOTENV='1'
$env:EXPO_PUBLIC_BUILD_CHANNEL='production'
$env:EXPO_PUBLIC_API_URL='https://ventureplus123.vercel.app/api'
node node_modules/expo/bin/cli export --platform android --output-dir dist/regression-android
```

PASS: 3,415 modules; 5,864,532-byte Hermes bundle and 29 verified assets.
Output: mobile/dist/regression-android/metadata.json and its referenced bundle
_expo/static/js/android/entry-a95954e1e5e4937cc64ff8ca2a04e8d9.hbc.
Generated exports remain ignored. This is not an APK, signing or device test.
Metro resolves shared-source dependencies through the mobile-owned node_modules;
its zod version remains 3.25.76. Converter tests directly own bson 5.5.1 as a server
dev dependency; both website lockfiles include it without other version changes.

## Remaining gates

Legacy customer ownership still uses names/notes. Stable ownership identifiers,
real MySQL collation/transaction behavior and broader role/entity acceptance remain
unverified. Logout clears client copies; it does not revoke an independently copied
stateless JWT before expiry. No production endpoint result is refreshed by this record.

Before the first real integration run, the database owner must independently provide
an empty dedicated MySQL test schema, reviewed schema initialization, schema-only
CRUD account (no roles, grant options or global access except USAGE), verified
CURRENT_USER/server UUID/grants and harmless schema objects. Protect an external
allowlist with the exact host, port, schema, account and server identity plus production
denials. The machine administrator must enforce default-deny egress allowing only
the approved test database and loopback fixture HTTP, blocking production databases,
Redis, IPv6/alias/proxy/tunnel redirection. Supply test-only secrets through protected
local tooling, never chat or Git. Review server/tests/ISOLATED_INTEGRATION.md in the
website checkout, then explicitly authorize the first real run. It exercises one
synthetic ADMIN and customer-record round trips, not every role or an Android UI.

No database migration, production configuration change, production deployment or APK
release is authorized by the code checkpoint. Commit and push outcomes are reported
separately after remote verification.

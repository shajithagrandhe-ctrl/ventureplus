# Venture Plus authentication repair — 21 October 2026

## Release condition

Local source and automated verification are ready for review. The requested
production APK release is NOT complete. Production still lacks the native-login
route; deployment access, signing and Android build prerequisites remain blocked.
No production database, account, password or environment setting was changed.

## Audit and authoritative sources

- Target checkout: `shajithagrandhe-ctrl/ventureplus`, branch
  `fix/shared-native-auth`, based on `b075cc426e0b84fc3a6cfdc1e8976c83f5d299c3`.
- The supplied extracted folder has no Git metadata. It was preserved; a separate
  checkout was created in `C:/Users/shaji/Downloads/ventureplus-main/auth-repair`.
- Original website repository: `VenkataVyshnaviMondi/venture`, inspected main
  tree `ab5e6802bf029a6c1267a1adc6a124de61ef7432`.
- Original website auth routes have no native-login handler. Original CSRF code
  accepts only cookie/header pairs for mutations. Target main already includes
  a native handler, JWT response and bearer-aware CSRF branch.
- Vercel rewrites direct /api and /uploads to the gateway, with a runtime binding
  to the Express server; the SPA catch-all follows the API paths.
- Database schema blob is identical between the two repositories:
  `2a14fca01efce6a76c237e996cedb9d22ef406b5`. No schema change or migration is needed
  for this repair. Production database selection cannot be independently read
  while hosting configuration access is denied.
- Target is authoritative for the integrated mobile/backend source. Production
  has a different frontend bundle and demo account configuration. Do not blindly
  replace that frontend or merge the two repositories. The deployed commit and
  project Git source remain unverified because the Vercel inspection is denied.

## Root cause evidence and production checks

Fresh checks used demo inputs already published by the website, held only in
process memory. Passwords, cookies, tokens, hashes and user profiles were not
printed, written into this report or added to the commit.

| Portal | Website login | Returned role | Native without CSRF | Native with valid CSRF |
| --- | --- | --- | --- | --- |
| Admin | 200 | ADMIN | 403, CSRF rejected | 404 |
| Employee | 200 | EMPLOYEE | 403, CSRF rejected | 404 |
| Customer | 200 | CUSTOMER | 403, CSRF rejected | 404 |

The Admin identity supplied by the user is genuinely accepted by the current
production credential validator despite looking like a placeholder; it was not
replaced or provisioned. These successes establish valid credentials and roles
through the deployed service. Direct user-document inspection is unavailable.
No missing-account provisioning is required by current evidence.

The CSRF rejection precedes route lookup on the old backend; valid CSRF reveals
the missing route. This explains the APK failure. An incorrect password on the
website is a separate issue from a missing native route. Rebuilding an APK that
calls the same missing endpoint cannot fix production.

The original 1.3.1 APK is a real Expo/React Native package, not Flutter. Earlier
static inspection confirmed package com.ventureplus.mobile, code 6, ARM ABIs,
the production API literal and a debug certificate. Installation was not tested.

## Changes made

| Files | Reason |
| --- | --- |
| server/src/routes/auth.routes.ts | Strict login body validation, trimmed emails, bounded fields, supported expectedRole |
| server/src/services/auth.service.ts | Match requested portal to stored authority; preserve legacy mixed-case identities |
| server/src/controllers/auth.controller.ts | Forward portal to shared validator; safe infrastructure log event |
| server/src/middleware/auth.ts | Recheck current role/account existence and frozen/relieved employee status |
| server/src/utils/tokens.ts | Enforce HS256, expected claims and an integer expiration |
| server/src/utils/csrf.ts | Native exemption follows Express case/trailing-slash behavior; browser protection retained |
| server/src/middleware/errorHandler.ts | Malformed JSON returns safe 400 without logging its raw body |
| server/tests/auth-contract.test.mjs | Real gateway and Express contract tests, role/state/expiry/error/rate-limit coverage |
| client/src/services/csrf-fetch.ts, api.ts | Shared handshake, returned-token handling, single stale-token retry, JSON/multipart headers |
| client/tests/csrf-fetch.test.mjs | Browser token races, cross-origin visibility, retry limits, multipart preservation |
| mobile/src/auth/AuthProvider.tsx | Send expectedRole for server validation, retaining client-side defense |
| mobile/tests/auth.test.tsx | Real login form, errors/loading, secure persistence, mismatch, restoration and offline logout |
| client/src/components/TotalDataForm.tsx | Use existing customerApi instead of a removed import |
| client/src/pages/BackendThreeLogins.tsx | Remove unreachable customer-only fields from employee-only signup |
| client/src/pages/ReportsPage.tsx, api.ts | Resolve report notes typing and ES2020 string compatibility |
| mobile/app.json, package.json, package-lock.json | Source release candidate 1.3.2 / Android code 7 |
| root package.json, .gitignore, README and docs | Include CSRF tests; exclude local tools/logs; document actual release state |

No successful session is faked. Existing schema, account store, web cookie flow,
server role checks and mobile Secure Store are retained. Detailed schemas and
session limitations are documented in AUTHENTICATION_CONTRACT.md.

## Actual test and build results

Final integrated `npm test` under Node 22.23.3 passed all 75 tests:

- Website Vitest: 1.
- Server: 25, including subtests. The new suite sends requests through the real
  gateway proxy and Express routes using isolated Prisma fixtures.
- Mobile contracts: 26.
- Mobile component suites: 17 across 3 suites.
- Website CSRF transport: 6.

The new first-render mobile test initially hit Jest's five-second timeout in the
full suite and passed in isolation. A documented 30-second cold-render allowance
is scoped to that test, without removing assertions. The final full run passes.

Commands run (from project root unless noted):

```sh
npm test
npm run build
node node_modules/typescript/bin/tsc -p client/tsconfig.app.json --noEmit
# From mobile/
node node_modules/typescript/bin/tsc --noEmit
node node_modules/eslint/bin/eslint.js .
node node_modules/expo/bin/cli prebuild --platform android --no-install
node node_modules/expo/bin/cli export --platform android --output-dir dist/android-release
```

Builds/static checks: backend compilation and website build pass. Website and
mobile TypeScript checks pass. Mobile lint passes. New CSRF module lint passes.
Git whitespace checking passes. Website build retains a large-chunk warning.

Broader inherited lint failures are NOT reported as passing: website ESLint has
65 errors and 27 warnings; server ESLint cannot run because its inherited ESLint
9 setup has no flat config. No rule was suppressed to hide these results.

The Android production Hermes export passes: 3,413 modules and a 5,863,783-byte
bundle at mobile/dist/android-release/_expo/static/js/android/
entry-731368e38ee2b1298356e148cff9cd90.hbc. This is NOT an APK and is not installable.
Generated dependencies, native projects, logs and bundle output are ignored.

## Deployment and Android blockers

Vercel deployment inspection for ventureplus123.vercel.app under the known team
returns 403, explicitly requiring authorization for scope
venkatavyshnavimondi-1235s-projects. The connector cannot read the deployed commit,
logs or environment configuration. The available browser remains at Vercel login.
No deployment was created, promoted or rolled back; no new deployment ID exists.

The owner must authorize the Vercel connection for that team/project. Then inspect
the actual production source, stage the server/gateway fix with existing protected
environment values, and validate before promoting. Do not replace newer UI or
change the database or JWT secret as a workaround. No production account write
is authorized or needed by current evidence.

Android project generation succeeds, but JDK/SDK and ADB are not installed.
Inspection of the installed React Native/Expo toolchain establishes JDK 17,
Gradle wrapper 9.3.1, AGP 8.12.0, compile/target SDK 36, minimum SDK 24 and NDK
27.1.12297006. A configured Android build host also needs matching SDK build
tools/CMake and owner-accepted Android licenses.

The generated template uses debug signing for release by default. No existing
production keystore/signing setup was supplied. Obtain the existing signing
configuration through a protected local/CI mechanism before assembling and
distributing a production APK. Do not substitute a new incompatible key.

Release candidate source is 1.3.2/code 7, package com.ventureplus.mobile. No new
APK exists, so APK output path, size, installation, signature verification and
actual device login remain unverified. The prior supplied APK is unchanged.

## Acceptance still outstanding

1. Authorize hosting access and identify the actual deployed Git revision.
2. Review/stage the server and gateway integration against that source while
   preserving the current database and newer website UI.
3. Verify production native login for the same three accounts, protected role
   access, wrong-password responses and fresh-session web/mobile data persistence.
4. Configure the existing release signing identity on an Android build host.
5. Assemble, verify and install the release APK; exercise all three login portals,
   restart restoration, logout, inventory and business flows on a real device.
6. Push the tested branch if repository credentials permit; otherwise retain the
   local commit and provide it for an authorized owner to push.

Git commit and push outcomes are recorded in AUTH_REPAIR_DELIVERY.md after the
commit operation, so the implementation commit can be referenced without a
self-referential hash.

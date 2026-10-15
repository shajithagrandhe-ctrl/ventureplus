# Prompt 2 implementation and verification status

This checkpoint supersedes prior delivery notes for the current 1.3.1 source.
The production access failure is recorded in `PRODUCTION_VERIFICATION.md`.

## Requirement assessment

| Prompt 2 requirement | Current evidence and remaining work |
| --- | --- |
| Protect prior work | Dedicated integration worktree and branch; prior APKs preserved; no production migration or seed executed. |
| Inspect web and mobile | Existing Vercel gateway, Express routes, MongoDB Prisma schema, mobile contracts, cookie/CSRF and bearer authentication reviewed. A fresh route/contract review found and fixed three integration defects. |
| One shared backend/database | Mobile uses `https://ventureplus123.vercel.app/api`. No database credentials or duplicate database added to mobile. Production database reads after login remain blocked. |
| Shared feature integration | Existing authentication, directories, employee access, inventory, plots, geometry, media, leads, customers, tracking, inquiries, favorites and statistics keep their server routes. Layout MIME handling, upload validation and plot lead pagination corrected. |
| Two-way synchronization | Mobile mutation invalidation, foreground refresh and 30-second active refresh implemented. Protocol verifier exercises cookie-to-bearer and bearer-to-cookie CRUD through the real Express routes. Its automated test uses isolated Prisma fixtures; production persistence is not verified. |
| Authentication/security | Cookie CSRF remains enforced. Native login uses the existing credential validator and a verified JWT. Secure Store remains the mobile session store. Missing-account provisioning defaults to dry run and never updates existing accounts. |
| Deployment | Existing project identified; connector returns team-scope 403. CLI account lacks access to that team. No deployment or production environment changes performed. |
| Testing | Mobile lint/type checks, contract/component tests, server tests and website build pass. Actual production credential checks returned 401 for all four supplied accounts; native route returned 403. Live role, upload and CRUD tests remain pending. |
| APK | Version 1.3.1/code 6 built separately after the integration fixes. See artifact metadata for build result and checksum. Prior 1.3.0 and redesigned APKs remain unchanged. |
| Completion report/Git | Current source, tests and artifacts are committed and pushed after implementation/build checks. Full production integration is not claimed. |

## Fixes in this checkpoint

1. MongoDB assets use extensionless URLs. Mobile now requests their `Content-Type`
   using a bounded HEAD request, then selects PDF, SVG or raster handling.
   Unknown or unavailable media has an original-document action rather than
   being treated as a broken raster image. No bearer token or cookies are sent
   to public media URLs.
2. Both layout and photo selection enforce the backend's existing 4 MiB maximum.
3. Plot lead requests forward pagination to the server; the mobile detail page
   exposes page navigation instead of silently omitting leads after page one.
4. Server request logs redact bearer tokens, website cookies, CSRF headers and
   authentication fields. Unexpected login errors return a generic response;
   frozen employee accounts return 403 so native session handling can react.
5. `.vercelignore` excludes APKs, native mobile source, generated dependencies,
   screenshots and local environment files from website/backend CLI uploads.

## Current check results

- `npm run lint --prefix mobile`: passed with no warnings.
- `npm run typecheck --prefix mobile`: passed.
- `npm test --prefix mobile`: 26/26 passed.
- `npm run test:components --prefix mobile`: 11/11 passed.
- `npm test --workspace server`: 8/8 passed after server TypeScript compilation.
  Coverage includes all four roles, cookie/CSRF protection, native bearer
  requests, safe login failures, log redaction, missing-only account creation,
  45-lead pagination and extensionless PDF Content-Type headers.
- `npm run build --workspace client`: passed; existing 669.95 kB chunk warning.
- `npm run lint --workspace server`: failed because the inherited backend has
  no ESLint 9 flat configuration. No lint rule or error was suppressed.
- Live `verify-shared-backend.mjs --allow-test-record`: health 200; all four
  supplied cookie logins 401; all four native logins 403. It returned
  `synchronization: not_run`, `authentication_or_authorization_failed`, before
  creating any record. This is an external deployment/account blocker.

## Missing-account provisioning

`server/scripts/provision-shared-accounts.mjs` is an operator-only server script,
not an HTTP endpoint and not part of the APK. It is restricted to the four
previously authorized email addresses and their existing seeded role mapping.
It validates the complete input before database access, stores bcrypt hashes,
preserves any existing account, and handles concurrent account creation without
overwriting it. No account password is embedded in the script.

Operator requirements:

- Use the existing protected server MongoDB configuration.
- Set `VP_EXPECTED_DATABASE` to the known production database name; the script
  refuses a different database name.
- Supply an array of `{ email, password, fullName }` objects through protected
  standard input. Do not put credentials in source control or command logs.
- Run `npm run accounts:provision-missing` in `server` for a dry run.
- Run with `-- --apply` only for the authorized create-missing operation.
- An `existing_unchanged` result does not mean the supplied password matches.
  Existing account credentials must not be reset under the current scope.

Do not use `npm run seed`: the inherited seed deletes existing business data.

## Production protocol verification

`server/scripts/verify-shared-backend.mjs` uses the mobile's real shared API
client for bearer requests and the website's cookie/CSRF contract for browser
requests. Supply `{ baseUrl, accounts: [{ email, password, role }] }` through
protected standard input. The script suppresses sensitive server payloads.

Run `npm run verify:shared-backend` in `server` to check health, login, session
restoration, logout responses and administrator-directory denial for non-admin
roles. Mutation checks require the explicit `-- --allow-test-record` flag.

The mutation sequence creates one UUID-marked temporary customer record via
cookie authentication, reads/updates it through the native client, reads and
updates it through the website contract, verifies it with fresh sessions, and
deletes only that test record. Cleanup failures report the test identifier;
they never trigger bulk deletion. The script stops before any test record is
created if login/authorization checks fail.

`protocol_verified` means the HTTP contracts read each other's persisted server
data. It is not evidence that an actual device or browser UI was exercised.
The automated test uses the real routes/controllers with an isolated in-memory
Prisma fixture; it does not claim a production MongoDB write occurred.

## Deployment and live verification still required

The owning Vercel team is `venkatavyshnavimondi-1235s-projects`. Both available
Vercel account connections return 403 for the existing project. An account
connection must be authorized for that project before deployment can proceed.
No alternate backend or database should be deployed as a workaround.

After access is restored:

1. Stage the current source in the existing Vercel project with its current
   protected environment values; no database schema migration is required.
2. Run the missing-account dry run and authorized create-missing operation
   against the existing production database.
3. Run the protocol verifier and confirm health, all applicable role checks,
   cross-client persistence, cleanup and logout responses.
4. Promote the validated deployment and recheck the production domain.
5. Install the new APK on an available ARM Android device and verify actual
   web/mobile UI behavior, uploads, inventory and foreground refresh.

No connected Android device was available in the previous verification. Server
JWTs remain stateless until expiry; clearing a local token is not server-side
revocation. The inherited dependency audit findings remain recorded separately.

## Verified APK artifact

- Release: 1.3.1, Android version code 6.
- Package: `com.ventureplus.mobile`.
- Architectures: `arm64-v8a` and `armeabi-v7a` (physical ARM Android phones).
- Minimum SDK: 24; target/compile SDK: 36.
- Project: `artifacts/venture-plus-integrated-1.3.1.apk`.
- Desktop: `D:\shaji desktop\VenturePlus-Integrated-1.3.1.apk`.
- Size: 60,610,307 bytes (57.80 MiB).
- SHA-256:
  `D8ECAD5B200C91BD392A1453B88BB8E35E1F1D4E3F19AF3F5CBCDB7BF9C494EB`.
- `:app:assembleRelease`: BUILD SUCCESSFUL in 24m 36s, 581 tasks.
- APK Signature Scheme v2 verification: passed; Android Debug certificate.
- Package/version/ABI metadata and embedded production API URL: verified.
- Installation/launch: not performed; ADB lists no connected device/emulator.
- Prior integrated 1.3.0 APK checksum remains unchanged.

The build used the existing short-path snapshot at `D:\vpi130\mobile` with
the source/configuration hashes checked against the repository. Command:

```powershell
.\gradlew.bat :app:assembleRelease `
  '-PreactNativeArchitectures=arm64-v8a,armeabi-v7a' `
  '-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m' `
  --no-daemon --max-workers=2 --console=plain
```

Build-only environment: Android Studio JBR, existing local Android SDK,
`EXPO_PUBLIC_API_URL=https://ventureplus123.vercel.app/api`,
`EXPO_PUBLIC_BUILD_CHANNEL=production`, `NODE_ENV=production`.

The new APK contains the integration fixes, but successful production login
and shared MongoDB synchronization remain blocked by deployment access and
the supplied production credential failures. A compiled APK alone does not
establish those workflows are working.

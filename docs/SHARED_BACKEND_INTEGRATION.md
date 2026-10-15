# Shared Backend Integration Delivery

## Scope and verified production topology

- Mobile release: Venture Plus 1.3.0 (`com.ventureplus.mobile`, version code 5).
- Mobile API base URL: `https://ventureplus123.vercel.app/api`.
- Public health check: `GET /api/health` returned HTTP 200 with
  `{"success":true,"message":"OK"}` during the integration audit.
- Vercel sends `/api/*` and `/uploads/*` through `backend/index.mjs` to the
  existing Express service.
- The Express service uses Prisma with the existing MongoDB database. The
  mobile app never connects directly to MongoDB and contains no database
  credentials.
- No Prisma schema or production database migration is included in this
  change.

## Authentication and security

The website's cookie and CSRF flow remains unchanged. A separate
`POST /api/auth/native/login` route reuses the existing credential validation
and returns the same user plus a bearer token for native clients. Mobile
sessions are stored with Expo Secure Store, restored through `GET /auth/me`,
and sent only as `Authorization: Bearer` headers to relative paths on the
configured API origin.

The CSRF exemption is limited to the native login route. Other bearer requests
skip cookie CSRF only after the JWT has been verified; invalid bearer tokens
return 401. Authentication responses no longer expose `adminCode`, auth
responses are marked `Cache-Control: no-store`, and login is rate limited.
Server role middleware remains the authority for protected data; mobile route
hiding is not treated as authorization.

Residual security constraints:

- The generated APK is signed with the local Android debug certificate because
  no production keystore was available. It is installable, but not a Play Store
  release artifact.
- Logout removes the native token locally, but the existing stateless JWT is
  not server-revocable before expiry.
- Existing dependency audits report known transitive findings. No forced major
  dependency upgrade was performed in this integration change.

## Shared features and synchronization

The mobile contracts call the existing server routes for authentication,
users, employee access, agents, customers, leads, tracking, reports,
locations, ventures, plots, coordinates, favorites, inquiries, property
layouts, photos, uploads, and dashboard data. Mutations invalidate the related
React Query data so the next read is authoritative from the shared backend.

The deployed SSE endpoint is cookie-oriented and is not compatible with the
native bearer client without weakening the website's security model. The
mobile app therefore uses bounded refresh behavior:

- immediate query invalidation after successful mutations;
- refresh when the app returns to the foreground; and
- active-screen cache invalidation every 30 seconds while the app is active.

This is near-real-time polling, not instant synchronization. Failed requests
keep server data authoritative and expose retryable UI states; requests time
out after 15 seconds, and 401 responses clear only the token that issued the
failed request.

## Deployment requirement

The live production deployment did not contain the new native login route at
audit time. A safe probe to `POST /api/auth/native/login` was rejected by the
existing CSRF middleware, confirming that this branch has not been deployed.
Consequently, real website credentials cannot log into this APK until the
backend changes in this branch are deployed through the existing Vercel
project.

Deployment does not require a database migration or a new environment
variable. The required operator procedure is:

1. Review and merge this branch through the normal repository workflow.
2. Deploy the existing Vercel services with their current protected production
   environment values.
3. Verify `/api/health`, native login, `/api/auth/me`, logout, and at least one
   permitted read for each role.
4. Use an authorized disposable record to verify website-to-mobile and
   mobile-to-website persistence, then remove it only with explicit approval.

No production deployment, environment change, migration, seed, or production
record mutation was performed as part of this delivery.

## Checks executed

- Server TypeScript build and native-auth integration test: passed (1/1).
- Mobile TypeScript check: passed.
- Mobile ESLint: passed.
- Expo Doctor after SDK patch alignment: passed (21/21).
- Mobile API/contract tests: passed (25/25).
- Mobile component tests: passed (8/8).
- Existing client Vitest suite: passed (1/1).
- Root client and server production build: passed. Vite reported a 669.95 kB
  JavaScript chunk warning.
- Expo web, iOS, and Android exports: passed.
- Android `assembleRelease`: passed, 653 tasks, all four standard ABIs.
- APK signature verification: passed using APK Signature Scheme v2.
- APK package metadata and embedded production API URL: verified.
- Device install/launch and real credential login: not run because ADB reported
  no connected device or emulator.
- Production bidirectional CRUD synchronization: not run because the required
  native-auth backend change is not deployed and no authorized production test
  record was supplied.

Dependency audit observations: the isolated mobile install reported 65
findings (16 moderate, 49 high); the root install reported 18 findings (1 low,
7 moderate, 6 high, 4 critical). These are audit findings in the current locked
dependency graph, not suppressed test failures.

## APK artifact

- Project path: `artifacts/venture-plus-integrated-1.3.0.apk`
- Desktop path: `D:\shaji desktop\VenturePlus-Integrated-1.3.0.apk`
- Variant: release, universal APK, debug-certificate signed
- Size: 107,064,090 bytes (102.10 MB)
- SHA-256:
  `4921AD01C5C9FECA54C6B52EA0A54B1652E6EE8F1D771CAED6C31359450DA673`
- Minimum SDK: 24
- Target/compile SDK: 36

The previously generated redesigned APK remains unchanged at
`D:\shaji desktop\VenturePlus-Redesigned-1.2.1.apk`.

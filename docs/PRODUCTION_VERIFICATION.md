# Production verification: 2026-10-15

## Deployment access

The existing Vercel project is `ventureplus123`
(`prj_NyQlIO65RFD37AJK97jE1ttv89tA`) in team
`team_8Eq10DEH1ZQg21C1YoQf1oAK`, scope
`venkatavyshnavimondi-1235s-projects`.

The connected owner account can list the project, but reading the project under
its team returns HTTP 403, stating that the connection is not authorized for
that scope. The local Vercel CLI fallback authenticates as
`shajithagrandhe-ctrl` and lists only the `quatret` team. It cannot access the
production scope either. No deployment was created or promoted.

Reconnect the Vercel account with access to the production team, or have the
team owner grant this account project deployment access. Plugin permission
preferences do not grant Vercel team membership or OAuth scope access.

## Live checks performed

The public API is `https://ventureplus123.vercel.app/api`.

| Check | Observed result |
| --- | --- |
| GET /api/health | 200, success true, message OK |
| Website login: admin@estatehub.com | 401, Invalid email or password |
| Website login: customer1@estatehub.com | 401, Invalid email or password |
| Website login: manager@estatehub.com | 401, Invalid email or password |
| Website login: john.employee@estatehub.com | 401, Invalid email or password |
| Native login with supplied administrator credentials | 403 |

Each website login used a fresh CSRF token and cookie session. Passwords,
tokens, cookies, database configuration, and response bodies containing
personal data were not included in this report. A 401 cannot distinguish an
absent account from an existing account with a different password.

These results supersede the earlier report's statement that real credential
login had not been attempted. Successful native login, role authorization,
and two-way synchronization remain unverified.

## Account provisioning authorization

The user authorized creation of the four supplied accounts only if missing.
Existing accounts, roles, passwords, permissions, and business records must
remain untouched. The repository seed defines these emails, but first deletes
existing users and business records; it must not be used for production
provisioning. No seed or account write was run.

Once deployment access is restored, inspect account existence server-side and
create missing accounts only using the existing Prisma model and password
hashing. Credentials must be supplied through protected process input and
must not be committed. Report existing accounts that fail credential
validation without resetting their passwords.

## Remaining verification

1. Deploy the committed native login patch to the existing Vercel project.
2. Provision only confirmed missing accounts under the authorization above.
3. Test native and cookie login, session restoration, logout, and role access.
4. Create a uniquely named disposable record through one authenticated client,
   read and update it through the other, re-read through fresh sessions, then
   clean up only that test record. Actual web/mobile UI checks require an
   accessible browser/device; protocol tests alone are not UI verification.
5. Verify mobile foreground refresh and active 30-second polling behavior.

## Current APK

The latest built APK remains at
`D:\shaji desktop\VenturePlus-Integrated-1.3.0.apk`, with a project copy at
`artifacts/venture-plus-integrated-1.3.0.apk`.

SHA-256:
`4921AD01C5C9FECA54C6B52EA0A54B1652E6EE8F1D771CAED6C31359450DA673`.

This build passed compilation and APK signature verification. It is signed
with an Android debug certificate. It cannot be labeled a working production
login release while the deployment and credential blockers remain. No mobile
source changes were needed for these production probes, so another APK build
would not resolve the external access failure.

# Shared website and Android authentication

Both clients are intended to use the production website Express API and MySQL
user records. That backend belongs to VenkataVyshnaviMondi/ventureplus123.
This app repository also retains a separate legacy Prisma MongoDB backend; it is
not the verified production database mapping. See the
[current code checkpoint](CODE_CHECKPOINT_2026-10-22.md).
There is no mobile-only account store. The Android client is Expo / React Native.

## Native sign-in

`POST /api/auth/native/login`, HTTPS in production. Content-Type is
`application/json`. The object accepts only these fields:

```json
{
  "email": "<account email>",
  "password": "<account password>",
  "expectedRole": "EMPLOYEE"
}
```

`email` is trimmed, validated as an email and limited to 254 characters.
Exact lookup preserves legacy mixed-case records; a lowercase fallback accepts
case variations for ordinary lowercase accounts without modifying stored emails.
`password` is 6–1024 characters. Optional `adminCode` is at most 128 characters.
Optional `expectedRole` accepts ADMIN, EMPLOYEE, CUSTOMER or the existing AGENT
role. Unknown fields and unsupported roles return 400. Omission of expectedRole
remains supported for the existing 1.3.1 APK.

The existing bcrypt verifier checks the stored password. The supplied portal
must match the account's actual role; it never grants a role. Frozen/relieved
employee accounts cannot sign in. Successful sign-in returns:

```json
{
  "success": true,
  "data": {
    "user": {
      "id": "<user ID>",
      "email": "<account email>",
      "displayName": "<display name>",
      "fullName": "<full name>",
      "role": "EMPLOYEE"
    },
    "token": "<access JWT>"
  },
  "message": "Login successful"
}
```

The existing safe profile may also contain department, position, employeeId,
phoneNumber, address, createdAt and lastLogin. It does not contain passwordHash,
adminCode, database configuration or internal account secrets. Auth responses
use Cache-Control: no-store. Native login sets no browser session cookie.

| Status | Meaning |
| --- | --- |
| 200 | Credentials accepted; user profile and access token returned |
| 400 | Missing/invalid fields, malformed JSON, unsupported role or unknown field |
| 401 | Wrong password, unknown account, wrong admin code or portal mismatch |
| 403 | Correct credentials but employee account is frozen/relieved |
| 429 | Shared web/native login rate limit exceeded |
| 500 | Authentication infrastructure failed; generic public message |

Wrong-password and unknown-account responses are identical. Infrastructure
failures have distinct safe internal event labels and do not print exception
payloads containing connection information or submitted credentials.

## Website sign-in and CSRF

The website first requests `GET /api/auth/csrf` with cookies enabled. The token
is supplied as `x-csrf-token` alongside the matching cookie on mutation requests.
`POST /api/auth/login` uses the same validator and account service, returns the
same safe user profile, and sets the existing HttpOnly access cookie rather than
returning its JWT in JSON. Cookie options and CSRF checks are retained.

The website transport shares concurrent CSRF handshakes, uses the returned token
when an API-host cookie cannot be read from the frontend origin, requests the
handshake without caching, and retries once only for an explicit pre-controller
403 Invalid CSRF token response. Other mutation results are never replayed.
JSON API requests and multipart venture uploads use this transport.

The dedicated native-login POST is exempt from cookie CSRF because it does not
establish a browser cookie session. Only successfully verified bearer JWTs may
use the bearer branch of CSRF handling; this does not exempt cookie requests.

## Protected requests, sessions and logout

Android sends `Authorization: Bearer <access JWT>` and omits browser cookies.
Tokens must use HS256, contain the expected profile/role claims and an integer
expiration, and pass signature/expiry validation. JWT_EXPIRES_IN defaults to 1d.

`requireAuth` also reads the current user ID, role and employee profile from the
same database. Deleted users, changed roles and frozen/relieved employees cannot
continue using stale token authority. Database failures return a safe 500, not
an invalid-password response. `requireRole` continues to protect staff/admin
routes server-side. A client-selected portal never overrides these checks.

Android stores the token in Expo Secure Store with device-only unlocked access.
Restart restoration validates it through GET /api/auth/me. A current-session 401
or frozen-account response clears local state; a late response for an old token
cannot clear a newer session. Ordinary permission denials do not sign users out.

POST /api/auth/logout clears website cookies. Android removes its Secure Store
token and query cache even when the API is offline. This architecture has no
refresh tokens or per-token server revocation list: logout removes the client's
copy, but an independently copied JWT can remain valid until expiry unless its
account is deleted, changes role or becomes frozen. Password changes do not
revoke existing access JWTs. Do not claim immediate token revocation. Adding a
central session registry would require a separate design and database change.

## Deployment and environment

Vercel routes /api and /uploads to backend/index.mjs, whose SERVER_INTERNAL_URL
binding forwards the method, path, body and relevant headers to the server
service. The SPA catch-all follows the API rewrites. The gateway test exercises
the public proxy and real Express handlers with isolated Prisma fixtures.
This is not a production Vercel deployment test or a real MongoDB write test.

Required server environment names: DATABASE_URL and JWT_SECRET. The production
website backend requires MySQL; the legacy backend in this app repository requires
MongoDB. Never substitute one database configuration for the other. Relevant names: NODE_ENV, JWT_EXPIRES_IN, CORS_ORIGIN,
COOKIE_SAMESITE, COOKIE_DOMAIN, CSRF_COOKIE_NAME, ACCESS_TOKEN_COOKIE_NAME,
REALTIME_TRANSPORT and REALTIME_REDIS_URL when fanout is needed. The gateway
uses the existing SERVER_INTERNAL_URL service binding. The website uses
VITE_API_URL=/api; Android uses EXPO_PUBLIC_API_URL with the existing HTTPS
production API and EXPO_PUBLIC_BUILD_CHANNEL=production.

No environment value, database schema, account, password or production setting
was modified for this repair. Do not run the inherited destructive seed against
production. Do not deploy the whole target frontend over a different, newer
production revision without reviewing the source relationship first.

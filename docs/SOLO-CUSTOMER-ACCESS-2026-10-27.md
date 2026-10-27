# SOLO customer access — 27 October 2026

## Release status

Customer login, secure session handling, durable request admission and the web
account panel are implemented for a Preview-only pilot. The separate commercial
Supabase project is not connected. **Live customer login and hosted quotas are
not yet verified or released.** Production remains the existing maintenance
deployment; public inference stays off.

The previous owner-token Gemini two-turn HTTP result remains recorded in
[the private API verification](SOLO-PRIVATE-CHAT-VERIFICATION-2026-10-27.md).
This work extends that same `/api/solo-chat`; it does not create another AI backend.

Current commits, preview deployment, test totals and remaining release gates are
recorded in [issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).

## Implemented behavior

- Same-origin `/api/solo-auth` login, status, refresh and logout, with no public signup action.
- Host-only Secure/HttpOnly/SameSite=Strict access and refresh cookies. Browser code and JSON responses contain no credentials.
- Online validation of the exact customer access JWT, followed by live session and membership checks in SQL. Customer credentials never fall back to the owner token.
- One existing chat route for browser cookies and future Android Bearer sessions. The Android client itself remains unfinished.
- Durable SQL admission before inference, with per-user and global minute/day allowances. A transaction locks and versions the policy row; no lock is held during Gemini inference.
- Request UUID and HMAC fingerprint prevent duplicate provider dispatch. Every reservation counts, including failed or unfinished calls; no automatic inference retry or refund.
- Provider outcome and safe token observations are recorded. A finalization failure returns an error, not a claimed successful conversation.
- A minimal account panel uses existing SOLO styling and artwork. Login status, usage, session expiry, rate-limit wait and already-accepted requests have explicit UI states. Account changes clear retained chat context.

The initial SQL policy is **disabled**, no members are created, and membership
defaults to blocked. Test caps are three requests/user/minute, 20/user/day,
20/global/minute and 200/global/day. These are bounded pilot defaults, not
approved paid subscription entitlements or a monetary spending budget.

## Database isolation and permissions

`solo_private` contains policy, membership and a request ledger. Client roles
cannot use the schema, read its tables or execute the three RPCs. RLS is enabled
and forced. The RPCs are `SECURITY INVOKER` with an empty search path and explicit
server-role execution grants.

The runtime may read policy/membership, reserve requests and finalize outcomes.
The new grants do not permit it to enable the policy, alter caps, enrol members,
delete reservations or write Supabase Auth data. The migration adds read access
only to the Auth session columns needed for the live-session check; existing
hosted grants must also be inspected before rollout. No new Auth tables are
created by the migration.

The ledger stores user/session/request identifiers, HMAC fingerprints, timestamps,
outcomes, model and token observations. It stores no prompt/reply text, email,
IP address, password or API key. Session/account deletion does not erase global
usage or reset its allowance. A reviewed retention/deletion process and
provider-side privacy disclosure remain release requirements.

## Local verification

All **139 tests pass**: 118 API/browser/smoke tests and 21 SQL tests.

| Suite | Passing tests |
| --- | ---: |
| Existing chat API regressions | 31 |
| Customer access and quota adapter | 25 |
| Login, refresh, status and logout API | 20 |
| Account browser controller | 17 |
| Conversation browser controller | 21 |
| Existing opt-in owner smoke runner | 4 |
| Actual SQL migration in PGlite | 21 |

API and browser-controller tests use dummy credentials and simulated service
responses. They cover session/cookie/Origin boundaries, production disablement,
bad credentials, membership denial, DB/Auth outages, quota/duplicate mapping,
provider-failure accounting, finalization failure and preservation of the owner
testing path. Account tests cover secure cookie behavior, rotation, logout,
expiry, error handling and client state. Existing regression tests remain included.

SQL tests execute the actual generated migration using pinned PGlite 0.5.12
(PostgreSQL 18.6). Tests cover limits, duplicate IDs, session revocation and
ownership, member expiry/blocking, permissions, no refunds, immutable completion,
storage failure and usage persistence after account deletion.

PGlite has one connection. Queued simultaneous JavaScript calls prove the tested
SQL outcomes, but **do not prove overlapping independent hosted PostgreSQL
transactions**. The hosted project's actual schema, roles and server version
also remain to be checked. See [SQL test instructions](../tests/solo-database/README.md).

```sh
node --test powerhouse-website/tests/*.test.cjs
cd tests/solo-database
npm ci --ignore-scripts
npm test
```

The Node 24 local sandbox may summarize each isolated test file as one test.
Run an individual `.test.cjs` directly to see its assertion count. CI uses Node 22.
No test automatically calls Gemini or requires a real customer/provider secret.

## Commercial setup still required

The connected Supabase inventory contains only the inactive **Wrightwayz Project**
in a personal organisation. It was not resumed, queried, migrated or reused.
A dedicated free commercial organisation/project is required to keep SOLO
resources, credentials, customers and billing separate.

The Supabase connector cannot create an organisation, and the browser dashboard
is signed out. Secure dashboard sign-in is the current infrastructure blocker.
No new Gemini key, OpenAI billing setup or Groq registration is needed.

After the commercial organisation is available, verify its Free plan and Sydney
region before creating the project; ask before any nonzero charge. Inspect the
new project's existing schemas, roles and Auth session columns before applying
`supabase/migrations/20261027034444_solo_customer_admission.sql`. Do not apply the
local test Auth fixtures to a remote project.

Use sensitive Vercel **Preview** variables only:

| Variable | Purpose |
| --- | --- |
| `SOLO_CUSTOMER_AUTH_ENABLED` | Explicitly enables the account pilot in Preview |
| `SOLO_CUSTOMER_CHAT_ENABLED` | Independently enables customer inference in Preview |
| `SOLO_SUPABASE_URL` | Dedicated commercial `https://<project-ref>.supabase.co` URL |
| `SOLO_SUPABASE_PUBLISHABLE_KEY` | Modern `sb_publishable_` key for server Auth exchange |
| `SOLO_SUPABASE_SECRET_KEY` | Modern `sb_secret_` key, server-only RPC access via `apikey` |
| `SOLO_USAGE_HASH_SECRET` | Separate cryptographically random secret, at least 32 characters |

Keep the existing Gemini Preview configuration and private owner token. Never
copy charity keys or grant its resources to SOLO. Do not expose the server key
or owner token to the website, Android, source control, logs or issue comments.

Before enabling even the customer pilot, disable unrestricted signup in the
dedicated Auth project, create controlled test identities without unsolicited
emails, and explicitly enrol expiring test members. Enable the SQL policy only
for the bounded verification window. Validate login, refresh, logout and stale
JWT rejection against the real service, then exercise overlapping HTTP requests,
duplicate IDs, exhausted user/global allowances and outages. Verify one complete
customer-authenticated Gemini conversation and accurate ledger outcomes.

## Remaining release gates

- [ ] Separate commercial project provisioned and its schema/security advisors inspected.
- [ ] Migration applied and real hosted grants/RLS verified.
- [ ] Live customer login, cookie rotation and logout/revoked-session rejection verified.
- [ ] Independent concurrent requests demonstrate strict caps and duplicate suppression.
- [ ] Customer-authenticated Gemini conversation and error accounting verified end to end.
- [ ] Desktop and Samsung browser behavior, keyboard, focus and accessible account/chat states verified.
- [ ] Approved customer retention/deletion disclosure, monetary controls and public abuse controls.
- [ ] Explicit production release approval and actual deployed production verification.

A passing test suite or READY deployment does not close those gates.

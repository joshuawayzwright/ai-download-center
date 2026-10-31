# SOLO Auth admission — hosted deployment and verification

**Verified on 28 October 2026 UTC.** The reviewed Auth admission migration is
now applied to the existing commercial Supabase project `tymayhazawkofmiypeqt`.
Hosted permission, admission and concurrent-request checks passed. Customer
release gates and the database chat policy remain disabled. This completes the
database dependency; it does not establish public signup or a complete SOLO AI
launch.

Structured evidence: [hosted Auth admission results](evidence/solo-auth-admission-hosted-2026-10-28.json).
Earlier failures: [migration connector history](SOLO-MIGRATION-CONNECTOR-BLOCKER-2026-10-28.md).

## Applied change and authentication path

Owner-approved Supabase sign-in established access to the official Management
API. The original interactive CLI process had ended before its code could be
used. A temporary persisted-state handoff passed **10 local tests**; the saved
replacement challenge completed after Node used the configured proxy through
`--use-env-proxy`. No credentials or private handoff state are stored in the
repository. The browser-issued credential is account-level; restricting these
operations to the commercial project does not make that credential project-scoped.

A **single** official migration API request ran from **03:05:25 to 03:05:27 UTC**
and returned **HTTP 200**. Independent connector reads then confirmed the new
history entry and database objects. The three earlier connector
`apply_migration` failures remain historical failures; this success does not
prove that the connector's write operation was repaired.

| Item | Verified value |
| --- | --- |
| Source migration | `supabase/migrations/20261028010000_solo_auth_admission.sql` |
| Source SQL SHA-256 | `790ea7c1d4adf90f79104927418cb292c2df58a87740981198b5bd3f16d00c95` |
| Managed history entry | `20261028030527 solo_auth_admission` |
| Function body MD5 | `7e89cd38d51465e551046e96f4ffd692` |
| New tables | `solo_private.auth_rate_policy`, `solo_private.auth_rate_counters` |
| Admission function | `public.solo_admit_auth_attempt(text,text)` |

The Management API assigned a history version different from the source
filename. Preserve that evidence. Before a future CLI migration operation,
inspect this mapping; do not blindly reapply the SQL, rename the source or
repair migration history to make the timestamps match.

## Hosted security and policy checks

All **14 columns and 15 constraints** matched the reviewed source. Both tables
have enabled and forced row-level security. The expiry index and effective
service-role column permissions matched the migration. There are no `PUBLIC`
table grants; `anon` and `authenticated` cannot execute the admission function
or mutate its tables. The managed `service_role` has the required execution
permission and `BYPASSRLS` attribute.

The function returns JSONB, uses `SECURITY INVOKER`, has an empty search path
and a **two-second lock timeout**. Its deployed body matches the source hash
above. Service access permits counter reservation and cleanup, plus the policy
row's `id` update used for serialization; it does not grant changes to the
configured caps.

The verified fixed UTC window limits are:

| Scope | Per minute | Per hour | Per day |
| --- | ---: | ---: | ---: |
| Email fingerprint | 5 | 20 | — |
| IP fingerprint | 10 | 60 | — |
| All requests | 30 | 200 | 500 |

The limiter stores keyed fingerprints, not raw email addresses, IP addresses
or passwords. These are Auth-attempt limits, separate from chat quotas and any
currency budget.

## Hosted behavior and concurrency

The rollback-only test ran as `service_role`, required initially empty counters
and unchanged default limits, and verified:

- An invalid fingerprint is rejected without allocating counters.
- Five requests are admitted and reserve all seven counters.
- A sixth request for the same email is limited. Supplying a new IP on that
  denied request allocates no new counter and changes no existing counter.
- Rolling back leaves **zero persisted counter rows**.

Two earlier test runs stopped at the minute-boundary precondition before any
admission. The subsequent check accounted for the remaining time in the minute
and passed; those precondition stops were not admission failures.

The independent concurrent test ran from **03:13:02 to 03:13:09 UTC**, using
six overlapping database backend PIDs. It returned **five admissions and one
`rate_limited` result**, with a **54-second** retry delay. The committed test
state contained exactly **seven rows, each with five attempts**. Cleanup first
validated the exact expected test rows under the policy lock, then deleted
only those rows. It left zero counters; no `TRUNCATE` or policy-cap change was
used. This is hosted concurrency evidence, separate from the earlier local
PGlite tests and the rollback check.

An independent connector read at **03:16:59 UTC** confirmed zero Auth counters
and the unchanged commercial state:

| Preserved state | Result |
| --- | --- |
| Database chat policy | Disabled |
| Members | 2; hash `8620508cb983494dab688a0f933fd8c4` |
| Chat request ledger | 15; hash `161e66d23206b56f0e821ad056b8c1aa` |
| Auth sessions | 0 |

No customer account was created, membership activated, customer email sent or
Gemini request made by these checks.

## Auth configuration and existing email service

An Auth configuration read succeeded with HTTP 200 after one transient HTTP
502 response. It showed absent custom SMTP fields, a disabled send-email hook,
eight-digit OTPs with a **3,600-second** expiry, and an email limit of **two per
hour**. Confirmation and recovery templates were the default link templates;
they did not contain `{{.Token}}` for the implemented code-entry flow.

At **03:16:25 UTC**, one configuration PATCH returned HTTP 200. Readback
confirmed these two changes, with every other returned configuration field
unchanged:

- The Auth site URL changed from a localhost URL to
  `https://thesoloserviceprovider.com.au`.
- Minimum password length changed from **6 to 12**.

Signup remains disabled, email confirmation remains required, and anonymous
sign-in remains off. The changes did not activate onboarding or customer AI.

Public DNS checks at **03:17 UTC** found the existing Namecheap Private Email
MX hosts `mx1.privateemail.com` and `mx2.privateemail.com`, and the SPF service
`spf.privateemail.com`. This identifies existing email infrastructure; it does
not verify mailbox access, SMTP authentication or delivery. No SMTP
administration connection is available in the current tools. The next email
step is secure access to the existing commercial mailbox service and
verification of sender and OTP delivery. A new provider has not been shown to
be necessary.

## Deployment boundary and remaining work

No application runtime source or Vercel deployment changed in this cycle.

| Reference | Unchanged state |
| --- | --- |
| Existing runtime source | `3c9b214` |
| Evidence checkout before this documentation update | `c7c0ecc` |
| Production | `dpl_7Bg2jvu7yKdHk5mfa8GqCHKrD3Nt`, source `eabe97a` |
| Protected Preview | `dpl_8bpvb8yQuvuVwUYFFPQMApD5c3cN`; customer access remains closed |

The remaining launch requirements include SMTP and OTP delivery, actual
onboarding/recovery and signed-in browser acceptance, and verified provider
entitlements and durable cost controls. Request caps do not establish a
currency spending ceiling. No billing change was made or approved by this
work. Cleanup or revocation of earlier unclaimed CLI-login tokens remains
unverified. The connector's earlier write failure also remains undiagnosed,
although it no longer blocks this migration's deployment.

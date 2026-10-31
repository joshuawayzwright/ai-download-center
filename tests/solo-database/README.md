# SOLO customer admission SQL tests

Run from this directory:

```sh
npm ci --ignore-scripts
npm test
```

The pinned `@electric-sql/pglite` 0.5.12 dependency executes the actual migration
on its in-memory PostgreSQL 18.6 engine. The SQL uses PostgreSQL 17-compatible
features; a PostgreSQL 17 server is not available in this test environment.
The test-created `auth.users`, `auth.sessions`, and
roles are local fixtures. They must never be applied to a remote project.

The migration was generated using the official pinned Supabase CLI 2.122.0:

```sh
SUPABASE_TELEMETRY_DISABLED=1 supabase migration new solo_customer_admission
```

## Coverage and limits

Tests cover disabled and missing policy, allowlist/expiry/blocking, live-session
ownership and revocation, duplicate request IDs, per-user/global minute/day
limits, no refunds after provider failures, immutable/idempotent completion,
role permissions, forced RLS, and storage failure.

PGlite has one exclusive database connection. `Promise.all` tests verify queued
concurrent JavaScript invocations against the real SQL implementation; they do
**not** prove overlapping transactions from separate PostgreSQL sessions. Before
customer release, repeat cap/idempotency races against the actual dedicated
commercial Supabase project using independent HTTP connections, inspect its
managed auth schema/grants, and run its security advisors.

The policy defaults to disabled, no members are seeded, and no remote database
is linked. These tests are not evidence that customer authentication or quotas
are deployed.

## Runtime contract

The runtime may execute only these public RPCs, using a server-only service key:

- `solo_customer_status(p_user_id, p_session_id)` returns `{active, code}` and,
  for active access, `daily_limit` and `remaining_daily`. It consumes no quota.
- `solo_admit_request(p_user_id, p_session_id, p_request_id, p_fingerprint)`
  returns `{allowed, code, retry_after_seconds, request_id}` and, on admission,
  `daily_limit` and `remaining_daily`. Only `allowed: true` and `code: admitted`
  permit a model call.
- `solo_finish_request(p_user_id, p_request_id, p_status, p_provider, p_model,
  p_input_tokens, p_output_tokens)` returns `{ok, code}`. Terminal statuses are
  `succeeded`, `provider_error`, `timeout`, and `internal_error`; unknown token
  counts stay null.

User and session IDs must originate from server-verified customer tokens; reject
anonymous users in the authentication layer. The SQL additionally checks that
the session is live, belongs to the user and has not reached `not_after`, and that
the user is an explicitly approved, unblocked and unexpired member.

Requests reserve allowance before provider dispatch. Every reservation counts,
including errors and incomplete results. A duplicated `(user_id, request_id)`
always denies another provider call. Same fingerprint gives `duplicate_request`;
different fingerprint gives `request_conflict`. Replies are not stored or
replayed; a deliberate regenerate action needs a new request ID and allowance.

Provider failure must never refund/delete a ledger row or automatically retry
with a new request ID. A database error denies access. Completion can be retried
idempotently and cannot change a previously recorded result.

All usage is counted from the request ledger. A no-op update of the policy's fixed
singleton key locks and versions that row, serializing admission transactions
and causing stale repeatable-read transactions to fail. No lock is held during
inference. Minute limits use
a rolling 60 seconds; daily limits reset at UTC midnight. Current caps are three
per user per minute, 20 per user per day, 20 globally per minute and 200 globally
per day. They are test defaults, not an approved paid customer entitlement.

No prompts/replies, emails, IPs or credential values are stored. The ledger has
no auth foreign key, so session/account deletion cannot reset global usage.
An explicit privacy/retention process remains a release requirement; do not
prune records within active quota or idempotency windows.

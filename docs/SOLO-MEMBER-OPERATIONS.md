# Controlled SOLO membership operations

`powerhouse-website/scripts/solo-member-access.cjs` generates private operator SQL
for the existing `solo_private.chat_members` table. It makes no network request,
reads no credentials and executes no SQL. No migration, endpoint, role grant,
account creation or additional release switch is introduced.

This is sufficient for an owner-managed customer pilot. It does not implement
subscription billing or automatically approve new signups. The pending Auth
admission migration, email delivery and other release requirements still apply.

## Input and execution

Pass one JSON object on standard input. The project must be exactly
`tymayhazawkofmiypeqt`. Use the existing authorized operator connection to that
commercial project; confirm its identity in the tool/connection metadata before
executing any generated SQL. The project field prevents generating a plan for
another project; SQL itself cannot authenticate which project it is connected to.

Example input uses fictional identity data:

```json
{
  "projectRef": "tymayhazawkofmiypeqt",
  "userId": "00000000-0000-4000-8000-000000000001",
  "action": "grant",
  "expectedEmail": "pilot@example.invalid",
  "expiresAt": "2027-01-01T00:00:00.000000Z",
  "expectedMembership": null
}
```

Generate outside the public website/repository:

```sh
node powerhouse-website/scripts/solo-member-access.cjs < /tmp/solo-member-input.json > /tmp/solo-member-plan.sql
```

The default mode is `"dry-run"`: the generated transaction ends with `ROLLBACK`.
Only an explicit `"mode": "apply"` generates `COMMIT`. **Neither mode executes
the plan.** Review the target, identity, operation, expiry and expected state,
then execute the complete transaction through the authorized operator tool.
Do not remove the transaction boundary or execute a partial plan. If the SQL
session remains open after an error, roll back that failed transaction.

Generated plans necessarily contain the expected email. Keep them private and
outside Git, public build output and published evidence. Errors from the local
generator contain a fixed error code, never submitted input. SQL results contain
only the operation, mode, UUID and membership states; they omit email and tokens.

## Operations

| Action | Additional input | Behavior |
| --- | --- | --- |
| `inspect` | None | Return `found` and membership state, including a precise UTC expiry. Missing membership is an ordinary `found: false` result. |
| `grant` | `expectedEmail`, future `expiresAt`, `expectedMembership` | Create only when the expected prior state is `null`. To reactivate an existing blocked member, explicitly supply its exact `blocked: true` state and expiry. |
| `renew` | Same fields, with an exact prior `blocked: false` state | Extend an existing unblocked membership; the new expiry must be later than its current expiry. It cannot unblock a member. |
| `block` | None | Block the named existing membership. A missing membership raises `member_missing`; it is not reported as a successful block. |

An existing state is represented as:

```json
{
  "blocked": true,
  "expiresAt": "2026-01-01T00:00:00.123456Z"
}
```

Copy the expiry returned by `inspect` exactly. Timestamp inputs require UTC `Z`
and accept up to six fractional digits. Original literals and PostgreSQL
microseconds are preserved. A mismatched prior state aborts rather than replacing
another operator's update. New expiries must be finite and in the future both
when generating the plan and when executing it.

Grant and renew check the actual `auth.users` row: matching UUID/email, a finite
confirmed-email timestamp that is not in the future, nonanonymous status, no
deletion and no currently active ban. User metadata cannot substitute for these
fields. The operations do not create or update Auth users or sessions.

Mutations use the existing admission mutex by updating the fixed policy `id`
to itself. This locks and versions the singleton row without changing policy
enablement, limits or `updated_at`. Membership edits preserve `created_at`,
other customers and the entire request ledger. Runtime/customer roles receive
no additional permissions and remain unable to grant or unblock membership.

Each mutation returns `before` and `after`, with its operation and mode. In a
dry run, `after` describes the temporary state before rollback; it is **not**
persisted access. Verify the final stored state after a committed operation.
Blocking is checked by subsequent account/admission requests; it does not cancel
an already admitted provider call or globally revoke Supabase sessions.

## Verification scope

The focused test file is `tests/solo-database/member-access.test.mjs`. It executes
the generated SQL against the actual existing membership/admission migration in
the repository's pinned PGlite environment, using local fictional Auth fixtures.
Run it from `tests/solo-database` with:

```sh
node --test member-access.test.mjs
```

Coverage includes rollback and explicit apply behavior; identity, expiry and
prior-state rejection; precise timestamp comparisons; grant/renew/block/inspect;
the existing admission function observing grants and blocks; unchanged policy,
Auth users/sessions and usage history; denied runtime/client writes; and SQL
literal/dollar-delimiter injection resistance. The CLI's error output is also
checked for input disclosure.

These are local SQL and generator checks, not hosted provisioning, independent
transaction races, email delivery, model inference or customer release evidence.
No live member is approved by creating or testing this generator.

### Hosted rollback verification — 28 October 2026, 10:18 AEST

The same generated grant plan was executed through the existing commercial
operator connection for one pre-existing confirmed, nonanonymous verification
account with a blocked, expired membership. The plan explicitly matched that
prior state, projected an unblocked membership with a fifteen-minute expiry,
returned its structured result, and ended with `ROLLBACK`.

Independent readback confirmed unchanged membership and request-ledger hashes,
both retained memberships, all 15 retained requests, zero fixture sessions, and
the unchanged disabled policy and limits. Effective grants still deny member
insert/delete and blocked/expiry updates to `anon`, `authenticated` and
`service_role`. No account, email, model call, grant, schema or production flag
was created or changed. This checks the hosted operator transaction and rollback;
it does not approve a real customer or establish independent transaction races.

The complete local suite passed **246 JavaScript + 45 SQL = 291 tests**, including
15 new membership cases, with zero failures or skips. The initial restricted
local run stalled in a nested CLI test; the normal approved execution path completed
all 45 SQL cases successfully. The local subprocess case now has a five-second
timeout so a similar environment failure cannot stall the suite indefinitely.

See [sanitized verification evidence](evidence/solo-membership-dry-run-2026-10-28.json).

### Committed source, CI and protected Preview

Runtime commit: `3c9b214cf115f4b4e27373975b8737b45d5bee4c`, on the existing
customer branch in draft PR #34. Both actual logs from
[CI 40610633207](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40610633207)
confirm **246 JavaScript + 45 SQL = 291 tests**, zero failures or skips.
[Repository quality 40610633182](https://github.com/joshuawayzwright/ai-download-center/actions/runs/40610633182)
also passed.

The same commit fixes a reproduced account-form cooldown defect: switching to
another form no longer hides the explanation while its submit control remains
disabled. Remaining seconds are shown on navigation; expiry clears only the wait
notice, preserving a newer success/error. The extended regression failed against
the original controller and passed after the fix, without automatic retries.

Protected Preview `dpl_8bpvb8yQuvuVwUYFFPQMApD5c3cN` is READY at that runtime:
[SOLO Preview — Vercel access required](https://solo-provider-industrial-qgmf0sfeq-wrightwayz.vercel.app/solo-ai.html#conversation).
Five deployed files match the commit exactly, and twelve actual closed-gate HTTP
checks passed. The temporary share was revoked afterward and its bypass map was
empty; cached-cookie invalidation was not independently tested. See
[HTTP evidence](evidence/solo-member-preview-2026-10-28.json).

Production still points to `dpl_7Bg2jvu7yKdHk5mfa8GqCHKrD3Nt`. No customer
access switch was enabled. These checks do not establish live customer signup,
email recovery, signed-in browser/device acceptance or a completed public AI service.

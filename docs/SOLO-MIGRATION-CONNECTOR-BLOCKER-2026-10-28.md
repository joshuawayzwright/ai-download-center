# SOLO migration connector blocker

## Resolved migration deployment — 28 October 2026 UTC

The reviewed Auth admission migration was applied successfully through the
official Supabase Management API at **03:05:25–03:05:27 UTC**, after
owner-approved sign-in. One migration request returned HTTP 200. Independent
reads confirmed `20261028030527 solo_auth_admission`, both tables and the
function. Hosted permission, rollback-only admission and true concurrent
admission checks passed; guarded cleanup and a **03:16:59 UTC** read confirmed
zero Auth counters, disabled chat and unchanged memberships, request ledger
and session count.

See [the current deployment and verification record](SOLO-AUTH-ADMISSION-DEPLOYMENT-2026-10-28.md)
and [structured evidence](evidence/solo-auth-admission-hosted-2026-10-28.json).
The managed history timestamp differs from the source filename
`20261028010000_solo_auth_admission.sql`; do not blindly reapply, rename or
repair history to make them match.

**The migration dependency is resolved; the connector itself is not verified
as repaired.** Its three failed calls below remain valid historical evidence.
Statements below that the migration is pending or authentication is unavailable
describe those earlier audits and are superseded by this section. All original
historical sections are preserved.

Customer release gates remain closed. SMTP/OTP delivery, actual onboarding and
signed-in browser acceptance, and provider/cost requirements remain open; this
database deployment is not a public SOLO AI launch.

## Follow-up — 28 October 2026, 04:07 AEST

The owner explicitly requested `apply_migration` after the earlier audit below.
Fresh project, history, object, privilege and advisor checks confirmed that the
same reviewed migration was still pending. The newly exposed tool schema used
`name`, `project_id` and `query` without the earlier `link_id` argument.

One additional call began at **04:03:37 AEST / 27 October 18:03:37 UTC** and
returned the same `McpServerError: Invalid or expired requestState`, JSON-RPC
`-32602`, reason `invalid_request_state`. Readback at **04:06:57 AEST** confirmed
that both Auth-limiter tables and the RPC remained absent, migration history
still contained only `20261027071534 solo_customer_admission`, and the existing
chat policy remained disabled. There have now been **three observed failed
attempts**, not two. No further attempt was made during the subsequent member
workflow/cooldown work. The statements below about no third attempt describe
the original audit, not this later execution.

The current checklist records that outcome. This is a connector error, not an
automatic approval-review rejection or proof of expired OAuth. No DDL via
`execute_sql`, manual migration-history write, new project or extra API key
was used as a workaround.

## Earlier read-only audit

Read-only audit: 27 October 2026 UTC / 28 October 2026 Brisbane.
Scope: the existing commercial Supabase project `tymayhazawkofmiypeqt` only.
No WrightWayz database or data was inspected.

### Evidence at the earlier audit

The commercial connection successfully returned these results:

| Check | Observed result |
| --- | --- |
| Project health | `ACTIVE_HEALTHY`, PostgreSQL `17.11.0.003` |
| Migration history | Only `20261027071534`, `solo_customer_admission` |
| `solo_private.auth_rate_policy` | Absent |
| `solo_private.auth_rate_counters` | Absent |
| `public.solo_admit_auth_attempt(text,text)` | Absent |
| Existing chat policy | `enabled = false` |
| Performance advisors | No findings |
| Security advisors | Three `rls_enabled_no_policy` INFO findings for the deliberately private chat tables; one `auth_leaked_password_protection` WARN |
| Available project logs, default 24-hour window | Aggregates across eight sources contained zero `requestState` or `solo_auth_admission` mentions; no raw account or request content was retrieved |

The earlier two `apply_migration` calls returned
`Invalid or expired requestState`. This audit did not make a third attempt.
The new Auth-admission migration remains **unapplied**. Read success does not
establish write success or a working hosted login limiter.

A single targeted read of this same commercial project through the other
existing Supabase connection returned MCP `-32600`,
`You do not have permission to perform this action`. That connection was not
retried or used to inspect any other project.

## Diagnosis and supported recovery boundary

The official MCP SDK documents this exact error as failed verification of the
opaque state used between rounds of a tool call. Possible causes include expiry,
different worker keys, a different audience, malformed state, or changed request
arguments. The wire message deliberately does not identify the cause; the MCP
service's own logs contain it. This is **not evidence that Supabase OAuth expired**.
The successful reads and absent migration are consistent with a connector-level
failure, but they do not establish its underlying cause.

- [MCP SDK: exact error and diagnostic log](https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/troubleshooting.md#mcperror-invalid-or-expired-requeststate)
- [MCP SDK: deployment and worker-key handling](https://github.com/modelcontextprotocol/python-sdk/blob/main/docs/run/deploy.md)
- [Supabase: SQL confirmation behaviour](https://supabase.com/docs/guides/troubleshooting/sql-confirmations-do-not-appear-in-your-mcp-client-sQf7Kp)

The current migration tool accepts only `link_id`, `name`, `project_id` and
`query`. No request-state, resume, approval or SQL-confirmation argument is
exposed. There is no connected refresh/reconnect operation. The available
`confirm_cost` tool concerns new resources and is unrelated.

The cached official CLI exists, but the checkout has no local Supabase project
configuration or link. Checks for normal CLI token files and credential
environment-variable presence were negative; no secret contents or operating
system keyring credentials were accessed. An authenticated CLI path is not
established. Supabase documents a Management API migration endpoint, but no
separate authenticated API capability is exposed here.

Do not substitute `execute_sql` DDL or hand-written migration-history records.
The connected SQL tool directs DDL to `apply_migration`; the documented CLI
workflow manages history through `db push` or, when reconciling an already
applied change, `migration repair`.

- [Supabase Management API: apply a migration](https://supabase.com/docs/reference/api/v1-apply-a-migration)
- [Supabase CLI: migrations and database push](https://supabase.com/docs/reference/cli/introduction)
- [Supabase database migration workflow](https://supabase.com/docs/guides/deployment/database-migrations)

## Next action

The connector operator needs the failed calls' timestamps and exact error to
inspect `requestState rejected on tools/call:` in the MCP service logs. The
project's database logs cannot provide that connector diagnostic. No available
tool exposes those logs or a verified repair. Do not claim that another account
reconnect will resolve it; [OpenAI's app troubleshooting guidance](https://help.openai.com/en/articles/20001497-troubleshooting-plugins-and-apps-in-chatgpt)
also advises against repeatedly reconnecting an authorised app when a problem persists.

Keep `20261028010000_solo_auth_admission.sql` pending and customer release gates
closed. After the supported write path is restored, apply the reviewed migration
once and independently verify history, grants and hosted admission behaviour.

The leaked-password warning is separate. Supabase documents that feature as
[Pro plan and above](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection);
this audit neither upgrades the project nor authorises spending.

No remote mutation, third migration attempt, browser login, Auth request, secret
retrieval, new infrastructure or model call was made in this audit.

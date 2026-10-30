# Powerhouse release checklist

The single current checklist is [GitHub issue #31](https://github.com/joshuawayzwright/ai-download-center/issues/31).
Use its current-status section and retain its historical audit trail.

As of 28 October 2026 (Brisbane), the commercial website is live with all ten
launch products marked COMING SOON. Runtime commit `eabe97a` is deployed as
`dpl_7Bg2jvu7yKdHk5mfa8GqCHKrD3Nt`. The original A$79 Marketing Kit remains
withdrawn; do not reactivate or replace its checkout automatically.

The website cutover was explicitly authorized and verified. SOLO AI customer
access remains a separate unfinished release. The Auth-admission migration is
applied as managed version `20261028030527`; hosted rollback checks and six
independent overlapping backends verified five admissions/one denial, followed
by cleanup to zero counters. See [the deployment record](../docs/SOLO-AUTH-ADMISSION-DEPLOYMENT-2026-10-28.md)
and [evidence](../docs/evidence/solo-auth-admission-hosted-2026-10-28.json).

Customer chat and provider signup remain closed. The canonical Auth site URL
and 12-character minimum password setting are verified. Configure the existing
commercial SMTP service, install the committed OTP templates, and complete
email delivery/recovery, signed-in browser/device and cost acceptance before
customer activation. Hosted lock/storage-failure checks also remain open.
Purchase activation and Android publication retain their own gates in issue #31.

// In-app reporting of SOLO AI replies (web and Android). Required by Google Play's
// AI-Generated Content policy so customers can flag a reply without leaving the app.
// Only signed-in customers can report replies they actually received.
const access = require('../lib/solo-customer-access.cjs');
const { customerRelease } = require('../lib/solo-release-policy.cjs');
const { reply, fail, readBody } = require('../lib/solo-auth-http.cjs');

const MAX_NOTE = 500;
const MAX_REPLY = 4000;
// 4,000 characters of non-Latin text plus JSON escaping can exceed the 8 KB account
// limit, so reports get a larger (still bounded) body.
const MAX_REPORT_BYTES = 24576;
// Allow newlines and tabs in free text; reject other control characters.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/;

function validReport(body) {
  const { requestId, reason, note, reply: replyText } = body;
  if (typeof requestId !== 'string' || !access.UUID.test(requestId)) {
    throw fail(400, 'invalid_report', 'Choose a reply to report.');
  }
  if (!access.REPORT_REASONS.includes(reason)) throw fail(400, 'invalid_report', 'Choose a reason for the report.');
  if (note !== undefined && note !== null &&
      (typeof note !== 'string' || CONTROL.test(note) || note.trim().length > MAX_NOTE)) {
    throw fail(400, 'invalid_report', 'Keep the note to 500 characters.');
  }
  if (typeof replyText !== 'string' || !replyText.trim() || replyText.length > MAX_REPLY || CONTROL.test(replyText)) {
    throw fail(400, 'invalid_report', 'The reported reply is missing or too long.');
  }
  const trimmedNote = typeof note === 'string' && note.trim() ? note.trim() : undefined;
  return { requestId, reason, note: trimmedNote, replyText: replyText.trim() };
}

function createReportHandler({ env = process.env, verify = access.verifyCustomer, submit = access.submitReport } = {}) {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return reply(res, 405, { error: 'Method not allowed.', code: 'method_not_allowed' });
    }
    try {
      // Reports need a customer session, so they follow the account release gate.
      if (!customerRelease(req, env).authEnabled) {
        throw fail(503, 'reports_disabled', 'Reporting is not available yet.');
      }
      // Cookie credentials require an exact same-origin request (checked inside);
      // the Android app sends an explicit Bearer token and no Origin.
      const token = access.parseAccessToken(req);
      if (!token) throw fail(401, 'session_expired', 'Please sign in to report a reply.');
      const report = validReport(await readBody(req, MAX_REPORT_BYTES));
      const identity = await verify(token.token, { env });
      const result = await submit(identity, report, { env });
      return reply(res, 200, { ok: true, code: result.code });
    } catch (error) {
      const known = error instanceof access.HttpError;
      if (known) for (const [name, value] of Object.entries(error.headers)) res.setHeader(name, value);
      return reply(res, known ? error.status : 503, {
        error: known ? error.message : 'Reporting is temporarily unavailable.',
        code: known ? error.code : 'report_unavailable'
      });
    }
  };
}

module.exports = createReportHandler();
module.exports.createReportHandler = createReportHandler;

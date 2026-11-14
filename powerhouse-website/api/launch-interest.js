'use strict';
/* Optional first-party operational counts. No raw request/header/body logging.
   Not unique-visitor analytics, a durable database, or proof of marketing consent. */
const PRODUCTS = new Set([
  'all-products', 'solo-cashflow-control', 'solo-quote-invoice-builder',
  'solo-client-booking-follow-up', 'solo-job-application-command-centre',
  'solo-content-repurposing-studio', 'solo-customer-support-desk',
  'solo-small-business-operations-hub', 'solo-digital-product-launch-system',
  'solo-business-research-dashboard', 'solo-ai-workflow-starter-pack'
]);
const ORIGINS = new Set(['https://thesoloserviceprovider.com.au', 'https://www.thesoloserviceprovider.com.au']);
const EVENTS = new Set(['product_interest', 'signup_request_accepted']);
const PAGES = new Set(['home', 'products']);
module.exports = async function handler(req, res) {
  const send = (code, body) => {
    res.statusCode = code;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(body));
  };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return send(405, { error: 'Method not allowed' }); }
  if (process.env.SOLO_INTEREST_EVENTS_ENABLED !== 'true') return send(503, { error: 'Measurement is not enabled' });
  if (!ORIGINS.has(req.headers.origin)) return send(403, { error: 'Origin not allowed' });
  if (req.headers['sec-gpc'] === '1' || req.headers.dnt === '1') return send(200, { recorded: false });
  if (!/^application\/json(?:\s*;.*)?$/i.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON required' });
  if (Number(req.headers['content-length']) > 512) return send(413, { error: 'Request too large' });
  let body;
  try {
    if (req.body !== undefined) {
      const text = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (Buffer.byteLength(text, 'utf8') > 512) return send(413, { error: 'Request too large' });
      body = JSON.parse(text);
    } else {
      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += Buffer.byteLength(chunk);
        if (size > 512) return send(413, { error: 'Request too large' });
        chunks.push(Buffer.from(chunk));
      }
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
  } catch { return send(400, { error: 'Invalid JSON' }); }
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).sort().join(',') !== 'event,page,product' ||
      !EVENTS.has(body.event) || !PRODUCTS.has(body.product) || !PAGES.has(body.page)) {
    return send(400, { error: 'Unsupported event' });
  }
  console.info(JSON.stringify({ type: 'solo_launch_interest_v1',
    event: body.event, product: body.product, page: body.page }));
  return send(200, { recorded: true });
};

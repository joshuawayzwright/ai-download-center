-- REVIEW PROPOSAL ONLY. NOT APPLIED. Not in an automatic migrations directory.
-- Requires explicit schema/access approval, existing-server credential verification,
-- a reviewed API adapter, abuse controls and authenticated report acceptance.
-- Stores aggregate counts only; no email, IP, visitor ID, request ID or raw events.
BEGIN;
CREATE SCHEMA IF NOT EXISTS solo_analytics;
REVOKE ALL ON SCHEMA solo_analytics FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA solo_analytics TO service_role;

CREATE TABLE solo_analytics.launch_daily_counts (
  day date NOT NULL,
  event text NOT NULL CHECK (event IN ('product_interest','signup_request_accepted')),
  product text NOT NULL CHECK (product IN (
    'all-products','solo-cashflow-control','solo-quote-invoice-builder',
    'solo-client-booking-follow-up','solo-job-application-command-centre',
    'solo-content-repurposing-studio','solo-customer-support-desk',
    'solo-small-business-operations-hub','solo-digital-product-launch-system',
    'solo-business-research-dashboard','solo-ai-workflow-starter-pack'
  )),
  page text NOT NULL CHECK (page IN ('home','products')),
  count bigint NOT NULL DEFAULT 1 CHECK (count > 0),
  PRIMARY KEY (day,event,product,page)
);
ALTER TABLE solo_analytics.launch_daily_counts ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies; no browser read/write permission.
REVOKE ALL ON solo_analytics.launch_daily_counts FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON solo_analytics.launch_daily_counts TO service_role;

CREATE FUNCTION public.record_solo_launch_interest(p_event text,p_product text,p_page text)
RETURNS void
LANGUAGE sql SECURITY INVOKER
SET search_path = ''
AS $$
  INSERT INTO solo_analytics.launch_daily_counts AS totals (day,event,product,page)
  VALUES ((now() AT TIME ZONE 'UTC')::date,p_event,p_product,p_page)
  ON CONFLICT (day,event,product,page)
  DO UPDATE SET count = totals.count + 1;
$$;
REVOKE ALL ON FUNCTION public.record_solo_launch_interest(text,text,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_solo_launch_interest(text,text,text) TO service_role;
COMMIT;

-- Administrator-only report example (not a public endpoint):
-- SELECT day,event,product,page,count
-- FROM solo_analytics.launch_daily_counts
-- WHERE day >= DATE '2026-10-28' AND day < DATE '2026-11-28'
-- ORDER BY day,event,product,page;
--
-- Counts remain approximate, replayable activity counts, never unique people or
-- confirmed subscribers. Consent/confirmed signups remain in Klaviyo.
-- Choose/approve aggregate retention before implementation. No scheduled pruning,
-- paid add-on, credential, API adapter or production application is supplied here.

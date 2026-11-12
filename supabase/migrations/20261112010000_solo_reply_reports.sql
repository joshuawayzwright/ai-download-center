-- SOLO AI in-app reporting of AI replies (Google Play AI-Generated Content policy).
-- Apply only to the dedicated commercial Supabase project, after
-- 20261027071534_solo_customer_admission.sql. Creates no members and enables nothing.
-- Prompts are never stored. A report stores only the reply text the customer chose to
-- report, so the reply can be reviewed.
BEGIN;

CREATE TABLE solo_private.reply_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  request_id uuid NOT NULL,
  reason text NOT NULL
    CHECK (reason IN ('harmful', 'hateful', 'sexual', 'misleading', 'other')),
  note text CHECK (note IS NULL OR char_length(note) BETWEEN 1 AND 500),
  reply_text text NOT NULL CHECK (char_length(reply_text) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  review_status text NOT NULL DEFAULT 'open'
    CHECK (review_status IN ('open', 'reviewed', 'actioned')),
  -- One report per reply. Resubmission is idempotent, not a second report.
  UNIQUE (user_id, request_id)
);
-- No foreign key to the request ledger: ledger retention must stay independent.
-- The submit function checks the reported request instead.
CREATE INDEX reply_reports_user_created_idx ON solo_private.reply_reports (user_id, created_at);
CREATE INDEX reply_reports_open_idx ON solo_private.reply_reports (created_at)
  WHERE review_status = 'open';

ALTER TABLE solo_private.reply_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.reply_reports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON solo_private.reply_reports FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON solo_private.reply_reports TO service_role;
GRANT INSERT (user_id, request_id, reason, note, reply_text, created_at)
  ON solo_private.reply_reports TO service_role;

CREATE FUNCTION public.solo_submit_report(
  p_user_id uuid, p_session_id uuid, p_request_id uuid,
  p_reason text, p_note text, p_reply_text text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_day timestamptz;
  v_count bigint;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_request_id IS NULL
    OR p_reason IS NULL OR p_reason NOT IN ('harmful', 'hateful', 'sexual', 'misleading', 'other')
    OR (p_note IS NOT NULL AND char_length(p_note) NOT BETWEEN 1 AND 500)
    OR p_reply_text IS NULL OR char_length(p_reply_text) NOT BETWEEN 1 AND 4000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_request', 'retry_after_seconds', 0);
  END IF;
  -- Identity comes from a server-verified JWT. A live session is required, but not
  -- an active membership: a customer whose access ended can still report a reply
  -- they already received.
  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id = p_session_id AND s.user_id = p_user_id
      AND (s.not_after IS NULL OR s.not_after > v_now)
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_session', 'retry_after_seconds', 0);
  END IF;
  -- Only replies this customer actually received can be reported.
  IF NOT EXISTS (
    SELECT 1 FROM solo_private.chat_requests r
    WHERE r.user_id = p_user_id AND r.request_id = p_request_id AND r.status = 'succeeded'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'request_not_found', 'retry_after_seconds', 0);
  END IF;
  IF EXISTS (
    SELECT 1 FROM solo_private.reply_reports
    WHERE user_id = p_user_id AND request_id = p_request_id
  ) THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_reported', 'retry_after_seconds', 0);
  END IF;
  -- Serialise this customer's reports so concurrent submissions can't all pass the
  -- daily count. The lock ends with the transaction.
  PERFORM pg_advisory_xact_lock(hashtext('solo_reply_reports:' || p_user_id::text));
  v_day := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT count(*) INTO v_count FROM solo_private.reply_reports
    WHERE user_id = p_user_id AND created_at >= v_day;
  IF v_count >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'report_limit',
      'retry_after_seconds',
      greatest(1, ceil(extract(epoch FROM (v_day + interval '24 hours' - v_now)))::integer));
  END IF;
  INSERT INTO solo_private.reply_reports (user_id, request_id, reason, note, reply_text, created_at)
  VALUES (p_user_id, p_request_id, p_reason, p_note, p_reply_text, v_now)
  ON CONFLICT (user_id, request_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_reported', 'retry_after_seconds', 0);
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'reported', 'retry_after_seconds', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.solo_submit_report(uuid, uuid, uuid, text, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_submit_report(uuid, uuid, uuid, text, text, text) TO service_role;

COMMIT;

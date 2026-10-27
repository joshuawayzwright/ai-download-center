-- SOLO commercial customer admission. Apply only to the dedicated commercial
-- Supabase project after its auth schema/grants have been inspected.
-- This migration does not enable inference, add members, or create auth users.
BEGIN;

CREATE SCHEMA solo_private;
REVOKE ALL ON SCHEMA solo_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA solo_private TO service_role;

CREATE TABLE solo_private.chat_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  user_minute_limit integer NOT NULL CHECK (user_minute_limit BETWEEN 1 AND 10000),
  user_day_limit integer NOT NULL CHECK (user_day_limit BETWEEN 1 AND 100000),
  global_minute_limit integer NOT NULL CHECK (global_minute_limit BETWEEN 1 AND 100000),
  global_day_limit integer NOT NULL CHECK (global_day_limit BETWEEN 1 AND 1000000),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO solo_private.chat_policy
  (id, enabled, user_minute_limit, user_day_limit, global_minute_limit, global_day_limit)
VALUES (true, false, 3, 20, 20, 200);

CREATE TABLE solo_private.chat_members (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked boolean NOT NULL DEFAULT true,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE solo_private.chat_requests (
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  request_id uuid NOT NULL,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[0-9a-f]{64}$'),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  completed_at timestamptz,
  status text NOT NULL DEFAULT 'reserved'
    CHECK (status IN ('reserved', 'succeeded', 'provider_error', 'timeout', 'internal_error')),
  provider text CHECK (provider IN ('gemini', 'groq', 'openai')),
  model text CHECK (model ~ '^[A-Za-z0-9._:/-]{1,120}$'),
  input_tokens integer CHECK (input_tokens BETWEEN 0 AND 1000000),
  output_tokens integer CHECK (output_tokens BETWEEN 0 AND 1000000),
  PRIMARY KEY (user_id, request_id),
  CHECK ((status = 'reserved' AND completed_at IS NULL)
    OR (status <> 'reserved' AND completed_at IS NOT NULL))
);
-- Deliberately no auth FK on the ledger: deleting a session/account must not
-- erase its admissions and reopen the global allowance. Retention is a separate
-- reviewed operation; never prune rows in an active quota/idempotency window.
CREATE INDEX chat_requests_created_idx ON solo_private.chat_requests (created_at);
CREATE INDEX chat_requests_user_created_idx ON solo_private.chat_requests (user_id, created_at);

ALTER TABLE solo_private.chat_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.chat_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.chat_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE solo_private.chat_members FORCE ROW LEVEL SECURITY;
ALTER TABLE solo_private.chat_requests FORCE ROW LEVEL SECURITY;

REVOKE ALL ON solo_private.chat_policy, solo_private.chat_members,
  solo_private.chat_requests FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON solo_private.chat_policy, solo_private.chat_members,
  solo_private.chat_requests TO service_role;
-- The fixed singleton key is the only policy column the runtime may update
-- for its admission mutex/row version; it cannot enable or change caps.
GRANT UPDATE (id) ON solo_private.chat_policy TO service_role;
GRANT INSERT (user_id, session_id, request_id, fingerprint, created_at)
  ON solo_private.chat_requests TO service_role;
GRANT UPDATE (status, completed_at, provider, model, input_tokens, output_tokens)
  ON solo_private.chat_requests TO service_role;

-- Read only the managed session columns needed to reject revoked/expired
-- sessions. No writes or schema changes are granted on Supabase Auth.
GRANT USAGE ON SCHEMA auth TO service_role;
GRANT SELECT (id, user_id, not_after) ON auth.sessions TO service_role;

CREATE FUNCTION solo_private.customer_access_code(
  p_user_id uuid, p_session_id uuid, p_now timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_member solo_private.chat_members%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_now IS NULL THEN
    RETURN 'invalid_request';
  END IF;
  -- Identity and session UUIDs must come from a server-verified JWT, never the
  -- customer's request body. Access is checked at admission, not just login.
  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id = p_session_id AND s.user_id = p_user_id
      AND (s.not_after IS NULL OR s.not_after > p_now)
  ) THEN RETURN 'invalid_session'; END IF;
  SELECT * INTO v_member FROM solo_private.chat_members WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN 'access_denied'; END IF;
  IF v_member.blocked THEN RETURN 'member_blocked'; END IF;
  IF v_member.expires_at <= p_now THEN RETURN 'member_expired'; END IF;
  RETURN 'active';
END;
$$;

CREATE FUNCTION public.solo_customer_status(p_user_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_policy solo_private.chat_policy%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_day timestamptz;
  v_code text;
  v_count bigint;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL THEN
    RETURN jsonb_build_object('active', false, 'code', 'invalid_request');
  END IF;
  SELECT * INTO v_policy FROM solo_private.chat_policy WHERE id = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('active', false, 'code', 'configuration_missing');
  END IF;
  IF NOT v_policy.enabled THEN
    RETURN jsonb_build_object('active', false, 'code', 'disabled');
  END IF;
  v_code := solo_private.customer_access_code(p_user_id, p_session_id, v_now);
  IF v_code <> 'active' THEN
    RETURN jsonb_build_object('active', false, 'code', v_code);
  END IF;
  v_day := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT count(*) INTO v_count FROM solo_private.chat_requests
    WHERE user_id = p_user_id AND created_at >= v_day;
  RETURN jsonb_build_object('active', true, 'code', 'active',
    'daily_limit', v_policy.user_day_limit,
    'remaining_daily', greatest(0, v_policy.user_day_limit - v_count));
END;
$$;

CREATE FUNCTION public.solo_admit_request(
  p_user_id uuid, p_session_id uuid, p_request_id uuid, p_fingerprint text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
  v_policy solo_private.chat_policy%ROWTYPE;
  v_existing_fingerprint text;
  v_now timestamptz;
  v_day timestamptz;
  v_user_minute bigint;
  v_user_day bigint;
  v_global_minute bigint;
  v_global_day bigint;
  v_code text;
  v_retry integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_request_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'invalid_request',
      'retry_after_seconds', 0, 'request_id', p_request_id);
  END IF;

  -- One short transaction serializes the complete check-and-reserve operation
  -- across serverless instances. A no-op UPDATE also creates a row version, so
  -- a caller using REPEATABLE READ cannot admit against a stale quota snapshot:
  -- PostgreSQL will abort a conflicting transaction instead. Never keep this
  -- lock during a provider call. No enabled/limit column can be changed here.
  UPDATE solo_private.chat_policy SET id = true WHERE id = true RETURNING * INTO v_policy;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'configuration_missing',
      'retry_after_seconds', 0, 'request_id', p_request_id);
  END IF;
  v_now := clock_timestamp();
  IF NOT v_policy.enabled THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'disabled',
      'retry_after_seconds', 0, 'request_id', p_request_id);
  END IF;
  v_code := solo_private.customer_access_code(p_user_id, p_session_id, v_now);
  IF v_code <> 'active' THEN
    RETURN jsonb_build_object('allowed', false, 'code', v_code,
      'retry_after_seconds', 0, 'request_id', p_request_id);
  END IF;

  SELECT fingerprint INTO v_existing_fingerprint FROM solo_private.chat_requests
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    v_code := CASE WHEN v_existing_fingerprint = p_fingerprint
      THEN 'duplicate_request' ELSE 'request_conflict' END;
    RETURN jsonb_build_object('allowed', false, 'code', v_code,
      'retry_after_seconds', 0, 'request_id', p_request_id);
  END IF;

  v_day := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  -- Count EVERY reservation, including errors and unfinished requests. A retry
  -- cannot obtain a refund and amplify provider spending after an uncertain call.
  SELECT
    count(*) FILTER (WHERE user_id = p_user_id AND created_at > v_now - interval '60 seconds'),
    count(*) FILTER (WHERE user_id = p_user_id AND created_at >= v_day),
    count(*) FILTER (WHERE created_at > v_now - interval '60 seconds'),
    count(*) FILTER (WHERE created_at >= v_day)
  INTO v_user_minute, v_user_day, v_global_minute, v_global_day
  FROM solo_private.chat_requests
  WHERE created_at >= least(v_day, v_now - interval '60 seconds');

  v_code := NULL;
  IF v_global_day >= v_policy.global_day_limit THEN v_code := 'global_daily_limit';
  ELSIF v_user_day >= v_policy.user_day_limit THEN v_code := 'user_daily_limit';
  ELSIF v_global_minute >= v_policy.global_minute_limit THEN v_code := 'global_minute_limit';
  ELSIF v_user_minute >= v_policy.user_minute_limit THEN v_code := 'user_minute_limit';
  END IF;
  IF v_code IS NOT NULL THEN
    v_retry := CASE WHEN v_code IN ('global_daily_limit', 'user_daily_limit')
      THEN greatest(1, ceil(extract(epoch FROM (v_day + interval '24 hours' - v_now)))::integer)
      ELSE 60 END;
    RETURN jsonb_build_object('allowed', false, 'code', v_code,
      'retry_after_seconds', v_retry, 'request_id', p_request_id);
  END IF;

  INSERT INTO solo_private.chat_requests
    (user_id, session_id, request_id, fingerprint, created_at)
  VALUES (p_user_id, p_session_id, p_request_id, p_fingerprint, v_now);
  RETURN jsonb_build_object('allowed', true, 'code', 'admitted',
    'retry_after_seconds', 0, 'request_id', p_request_id,
    'daily_limit', v_policy.user_day_limit,
    'remaining_daily', greatest(0, v_policy.user_day_limit - v_user_day - 1));
END;
$$;

CREATE FUNCTION public.solo_finish_request(
  p_user_id uuid, p_request_id uuid, p_status text, p_provider text, p_model text,
  p_input_tokens integer, p_output_tokens integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' SET lock_timeout = '2s' AS $$
DECLARE
  v_existing solo_private.chat_requests%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_request_id IS NULL OR p_status IS NULL
    OR p_status NOT IN ('succeeded', 'provider_error', 'timeout', 'internal_error')
    OR p_provider IS NULL OR p_provider NOT IN ('gemini', 'groq', 'openai')
    OR p_model IS NULL OR p_model !~ '^[A-Za-z0-9._:/-]{1,120}$'
    OR (p_input_tokens IS NOT NULL AND (p_input_tokens < 0 OR p_input_tokens > 1000000))
    OR (p_output_tokens IS NOT NULL AND (p_output_tokens < 0 OR p_output_tokens > 1000000)) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_request');
  END IF;
  SELECT * INTO v_existing FROM solo_private.chat_requests
    WHERE user_id = p_user_id AND request_id = p_request_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'code', 'request_not_found'); END IF;
  IF v_existing.status <> 'reserved' THEN
    IF v_existing.status = p_status AND v_existing.provider = p_provider
      AND v_existing.model = p_model
      AND v_existing.input_tokens IS NOT DISTINCT FROM p_input_tokens
      AND v_existing.output_tokens IS NOT DISTINCT FROM p_output_tokens THEN
      RETURN jsonb_build_object('ok', true, 'code', 'already_completed');
    END IF;
    RETURN jsonb_build_object('ok', false, 'code', 'completion_conflict');
  END IF;
  -- Finish may run after logout/member revocation: it records a previously
  -- admitted call and grants no new inference allowance.
  UPDATE solo_private.chat_requests SET status = p_status, provider = p_provider,
    model = p_model, input_tokens = p_input_tokens, output_tokens = p_output_tokens,
    completed_at = clock_timestamp()
  WHERE user_id = p_user_id AND request_id = p_request_id;
  RETURN jsonb_build_object('ok', true, 'code', 'completed');
END;
$$;

REVOKE ALL ON FUNCTION solo_private.customer_access_code(uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_customer_status(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_admit_request(uuid, uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_finish_request(uuid, uuid, text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION solo_private.customer_access_code(uuid, uuid, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_customer_status(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_admit_request(uuid, uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_finish_request(uuid, uuid, text, text, text, integer, integer) TO service_role;

COMMIT;

-- SOLO AI open access: any signed-in customer with a confirmed email gets a free
-- daily allowance without a membership row. Members keep their own allowance.
-- Off by default (open_access = false), so applying this changes nothing until
-- the owner switches it on. A blocked membership row still blocks the account.
BEGIN;

ALTER TABLE solo_private.chat_policy
  ADD COLUMN open_access boolean NOT NULL DEFAULT false,
  ADD COLUMN free_day_limit integer NOT NULL DEFAULT 10
    CHECK (free_day_limit BETWEEN 1 AND 100000);

-- 'member' or 'free' when the account may chat; otherwise the denial code.
-- Email confirmation is verified by the server from the provider identity.
CREATE FUNCTION solo_private.customer_tier(
  p_user_id uuid, p_session_id uuid, p_now timestamptz, p_open_access boolean
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_member solo_private.chat_members%ROWTYPE;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_now IS NULL THEN
    RETURN 'invalid_request';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM auth.sessions s
    WHERE s.id = p_session_id AND s.user_id = p_user_id
      AND (s.not_after IS NULL OR s.not_after > p_now)
  ) THEN RETURN 'invalid_session'; END IF;
  SELECT * INTO v_member FROM solo_private.chat_members WHERE user_id = p_user_id;
  IF FOUND THEN
    IF v_member.blocked THEN RETURN 'member_blocked'; END IF;
    IF v_member.expires_at > p_now THEN RETURN 'member'; END IF;
    RETURN CASE WHEN p_open_access THEN 'free' ELSE 'member_expired' END;
  END IF;
  RETURN CASE WHEN p_open_access THEN 'free' ELSE 'access_denied' END;
END;
$$;

-- Kept for existing callers (for example reporting): 'active' for either tier.
CREATE OR REPLACE FUNCTION solo_private.customer_access_code(
  p_user_id uuid, p_session_id uuid, p_now timestamptz
) RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_tier text;
BEGIN
  v_tier := solo_private.customer_tier(p_user_id, p_session_id, p_now,
    coalesce((SELECT open_access FROM solo_private.chat_policy WHERE id = true), false));
  RETURN CASE WHEN v_tier IN ('member', 'free') THEN 'active' ELSE v_tier END;
END;
$$;

CREATE OR REPLACE FUNCTION public.solo_customer_status(p_user_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_policy solo_private.chat_policy%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_day timestamptz;
  v_tier text;
  v_limit integer;
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
  v_tier := solo_private.customer_tier(p_user_id, p_session_id, v_now, v_policy.open_access);
  IF v_tier NOT IN ('member', 'free') THEN
    RETURN jsonb_build_object('active', false, 'code', v_tier);
  END IF;
  v_limit := CASE WHEN v_tier = 'member' THEN v_policy.user_day_limit ELSE v_policy.free_day_limit END;
  v_day := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
  SELECT count(*) INTO v_count FROM solo_private.chat_requests
    WHERE user_id = p_user_id AND created_at >= v_day;
  RETURN jsonb_build_object('active', true, 'code', 'active', 'tier', v_tier,
    'daily_limit', v_limit, 'remaining_daily', greatest(0, v_limit - v_count));
END;
$$;

CREATE OR REPLACE FUNCTION public.solo_admit_request(
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
  v_tier text;
  v_limit integer;
  v_retry integer := 0;
BEGIN
  IF p_user_id IS NULL OR p_session_id IS NULL OR p_request_id IS NULL
    OR p_fingerprint IS NULL OR p_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'invalid_request',
      'retry_after_seconds', 0, 'request_id', p_request_id);
  END IF;
  -- Serializes check-and-reserve across instances (see the original migration).
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
  v_tier := solo_private.customer_tier(p_user_id, p_session_id, v_now, v_policy.open_access);
  IF v_tier NOT IN ('member', 'free') THEN
    RETURN jsonb_build_object('allowed', false, 'code', v_tier,
      'retry_after_seconds', 0, 'request_id', p_request_id);
  END IF;
  v_limit := CASE WHEN v_tier = 'member' THEN v_policy.user_day_limit ELSE v_policy.free_day_limit END;

  SELECT fingerprint INTO v_existing_fingerprint FROM solo_private.chat_requests
    WHERE user_id = p_user_id AND request_id = p_request_id;
  IF FOUND THEN
    v_code := CASE WHEN v_existing_fingerprint = p_fingerprint
      THEN 'duplicate_request' ELSE 'request_conflict' END;
    RETURN jsonb_build_object('allowed', false, 'code', v_code,
      'retry_after_seconds', 0, 'request_id', p_request_id);
  END IF;

  v_day := date_trunc('day', v_now AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
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
  ELSIF v_user_day >= v_limit THEN v_code := 'user_daily_limit';
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
    'retry_after_seconds', 0, 'request_id', p_request_id, 'tier', v_tier,
    'daily_limit', v_limit,
    'remaining_daily', greatest(0, v_limit - v_user_day - 1));
END;
$$;

REVOKE ALL ON FUNCTION solo_private.customer_tier(uuid, uuid, timestamptz, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION solo_private.customer_tier(uuid, uuid, timestamptz, boolean) TO service_role;

COMMIT;

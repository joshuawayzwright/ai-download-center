-- Password-login admission only. Does not enable Auth/chat or enrol accounts.
-- Generated with `supabase migration new solo_auth_admission`; filename aligned
-- to the coordinated release migration order. Apply to commercial SOLO only.
BEGIN;

CREATE TABLE solo_private.auth_rate_policy (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  email_minute integer NOT NULL CHECK (email_minute BETWEEN 1 AND 1000),
  email_hour integer NOT NULL CHECK (email_hour BETWEEN 1 AND 10000),
  ip_minute integer NOT NULL CHECK (ip_minute BETWEEN 1 AND 10000),
  ip_hour integer NOT NULL CHECK (ip_hour BETWEEN 1 AND 100000),
  global_minute integer NOT NULL CHECK (global_minute BETWEEN 1 AND 10000),
  global_hour integer NOT NULL CHECK (global_hour BETWEEN 1 AND 100000),
  global_day integer NOT NULL CHECK (global_day BETWEEN 1 AND 1000000)
);
INSERT INTO solo_private.auth_rate_policy VALUES (true, 5, 20, 10, 60, 30, 200, 500);

CREATE TABLE solo_private.auth_rate_counters (
  scope text NOT NULL CHECK (scope IN ('email', 'ip', 'global')),
  subject_key text NOT NULL CHECK (subject_key ~ '^[0-9a-f]{64}$'),
  window_seconds integer NOT NULL CHECK (window_seconds IN (60, 3600, 86400)),
  window_start bigint NOT NULL CHECK (window_start >= 0),
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts BETWEEN 1 AND 1000000),
  PRIMARY KEY (scope, subject_key, window_seconds, window_start)
);
CREATE INDEX auth_rate_expiry_idx ON solo_private.auth_rate_counters (expires_at);
ALTER TABLE solo_private.auth_rate_policy ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.auth_rate_policy FORCE ROW LEVEL SECURITY;
ALTER TABLE solo_private.auth_rate_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.auth_rate_counters FORCE ROW LEVEL SECURITY;
REVOKE ALL ON solo_private.auth_rate_policy, solo_private.auth_rate_counters
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON solo_private.auth_rate_policy, solo_private.auth_rate_counters TO service_role;
GRANT UPDATE (id) ON solo_private.auth_rate_policy TO service_role;
GRANT INSERT (scope, subject_key, window_seconds, window_start, expires_at, attempts)
  ON solo_private.auth_rate_counters TO service_role;
GRANT UPDATE (attempts) ON solo_private.auth_rate_counters TO service_role;
GRANT DELETE ON solo_private.auth_rate_counters TO service_role;

CREATE FUNCTION public.solo_admit_auth_attempt(p_email_key text, p_ip_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = ''
SET lock_timeout = '2s' AS $$
DECLARE
  v_policy solo_private.auth_rate_policy%ROWTYPE;
  v_now timestamptz;
  v_epoch bigint;
  v_start bigint;
  v_count integer;
  v_retry integer := 0;
  v_i integer;
  v_keys text[];
  v_scopes text[] := ARRAY['global','global','global','email','email','ip','ip'];
  v_windows integer[] := ARRAY[86400,3600,60,3600,60,3600,60];
  v_limits integer[];
BEGIN
  IF p_email_key IS NULL OR p_ip_key IS NULL
    OR p_email_key !~ '^[0-9a-f]{64}$' OR p_ip_key !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'invalid_request', 'retry_after_seconds', 0);
  END IF;
  -- Serializes complete check/increment across serverless callers. The UPDATE
  -- also forces stale REPEATABLE READ snapshots to abort instead of over-admit.
  UPDATE solo_private.auth_rate_policy SET id=true WHERE id=true RETURNING * INTO v_policy;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'configuration_missing', 'retry_after_seconds', 0);
  END IF;
  v_now := clock_timestamp();
  v_epoch := floor(extract(epoch FROM v_now))::bigint;
  v_keys := ARRAY[repeat('0',64),repeat('0',64),repeat('0',64),p_email_key,p_email_key,p_ip_key,p_ip_key];
  v_limits := ARRAY[v_policy.global_day,v_policy.global_hour,v_policy.global_minute,
    v_policy.email_hour,v_policy.email_minute,v_policy.ip_hour,v_policy.ip_minute];
  -- Only fixed UTC windows are retained. Prune before allocating new keys;
  -- rejected requests never create rows. Global caps bound admitted key growth.
  DELETE FROM solo_private.auth_rate_counters WHERE expires_at <= v_now;
  FOR v_i IN 1..7 LOOP
    v_start := v_epoch - (v_epoch % v_windows[v_i]);
    SELECT attempts INTO v_count FROM solo_private.auth_rate_counters
      WHERE scope=v_scopes[v_i] AND subject_key=v_keys[v_i]
        AND window_seconds=v_windows[v_i] AND window_start=v_start;
    IF coalesce(v_count,0) >= v_limits[v_i] THEN
      v_retry := greatest(v_retry, greatest(1,
        ceil(extract(epoch FROM (to_timestamp(v_start + v_windows[v_i]) - v_now)))::integer));
    END IF;
  END LOOP;
  IF v_retry > 0 THEN
    RETURN jsonb_build_object('allowed', false, 'code', 'rate_limited', 'retry_after_seconds', v_retry);
  END IF;
  FOR v_i IN 1..7 LOOP
    v_start := v_epoch - (v_epoch % v_windows[v_i]);
    INSERT INTO solo_private.auth_rate_counters
      (scope,subject_key,window_seconds,window_start,expires_at,attempts)
    VALUES (v_scopes[v_i],v_keys[v_i],v_windows[v_i],v_start,
      to_timestamp(v_start + v_windows[v_i]),1)
    ON CONFLICT (scope,subject_key,window_seconds,window_start)
      DO UPDATE SET attempts=solo_private.auth_rate_counters.attempts+1;
  END LOOP;
  -- No refund path: success, invalid password and upstream failure all consume
  -- this reservation. Never hold the transaction open during an Auth request.
  RETURN jsonb_build_object('allowed', true, 'code', 'admitted', 'retry_after_seconds', 0);
END;
$$;
REVOKE ALL ON FUNCTION public.solo_admit_auth_attempt(text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_admit_auth_attempt(text,text) TO service_role;
COMMIT;

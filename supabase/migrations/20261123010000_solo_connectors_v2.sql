-- SOLO AI connectors v2: Google Contacts, Tasks and Drive (files the user picks),
-- plus one-time claims for confirmed actions. A write (add a booking, add a task,
-- create a Doc) only runs after the user taps Confirm, and each confirmation can run
-- once: a second tap, or a replayed request, finds its nonce already claimed.
BEGIN;

ALTER TABLE solo_private.connections DROP CONSTRAINT connections_provider_check;
ALTER TABLE solo_private.connections ADD CONSTRAINT connections_provider_check
  CHECK (provider IN ('google_calendar', 'google_contacts', 'google_tasks', 'google_drive'));

CREATE OR REPLACE FUNCTION public.solo_connection_save(
  p_user_id uuid, p_session_id uuid, p_provider text, p_ciphertext text, p_scopes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_tier text;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('google_calendar', 'google_contacts', 'google_tasks', 'google_drive')
    OR p_ciphertext IS NULL OR length(p_ciphertext) NOT BETWEEN 40 AND 8192
    OR p_scopes IS NULL OR length(p_scopes) > 1000 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_request');
  END IF;
  v_tier := solo_private.connection_tier(p_user_id, p_session_id);
  IF v_tier NOT IN ('member', 'free') THEN
    RETURN jsonb_build_object('ok', false, 'code', v_tier);
  END IF;
  INSERT INTO solo_private.connections (user_id, provider, token_ciphertext, scopes, connected_at)
    VALUES (p_user_id, p_provider, p_ciphertext, p_scopes, clock_timestamp())
    ON CONFLICT (user_id, provider) DO UPDATE
      SET token_ciphertext = excluded.token_ciphertext, scopes = excluded.scopes,
          connected_at = excluded.connected_at, last_used_at = NULL;
  RETURN jsonb_build_object('ok', true, 'code', 'saved', 'tier', v_tier);
END;
$$;

CREATE TABLE solo_private.connector_actions (
  nonce text PRIMARY KEY CHECK (nonce ~ '^[A-Za-z0-9_-]{16,64}$'),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (length(kind) <= 40),
  claimed_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE solo_private.connector_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.connector_actions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON solo_private.connector_actions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, DELETE ON solo_private.connector_actions TO service_role;
GRANT INSERT (nonce, user_id, kind, claimed_at) ON solo_private.connector_actions TO service_role;

-- 'claimed' the first time a confirmation is used; 'already_claimed' after that.
CREATE FUNCTION public.solo_connector_action_claim(p_user_id uuid, p_session_id uuid, p_nonce text, p_kind text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_tier text;
BEGIN
  IF p_nonce IS NULL OR p_nonce !~ '^[A-Za-z0-9_-]{16,64}$' OR p_kind IS NULL OR length(p_kind) > 40 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_request');
  END IF;
  v_tier := solo_private.connection_tier(p_user_id, p_session_id);
  IF v_tier NOT IN ('member', 'free') THEN
    RETURN jsonb_build_object('ok', false, 'code', v_tier);
  END IF;
  -- Claims older than a day are no longer needed (confirmations expire in 15 minutes).
  DELETE FROM solo_private.connector_actions WHERE claimed_at < clock_timestamp() - interval '1 day';
  INSERT INTO solo_private.connector_actions (nonce, user_id, kind) VALUES (p_nonce, p_user_id, p_kind)
    ON CONFLICT (nonce) DO NOTHING;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'already_claimed', 'tier', v_tier);
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'claimed', 'tier', v_tier);
END;
$$;
REVOKE ALL ON FUNCTION public.solo_connector_action_claim(uuid, uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.solo_connector_action_claim(uuid, uuid, text, text) TO service_role;

COMMIT;

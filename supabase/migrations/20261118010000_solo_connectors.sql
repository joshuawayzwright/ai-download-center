-- SOLO AI connectors (phase 1: Google Calendar, read-only).
-- Stores one encrypted connection key per customer and provider. The server
-- encrypts with AES-256-GCM before calling these functions, so the database
-- never holds a usable Google token. Only the server (service_role) can reach
-- any of it; anon and authenticated have no access. Deleting the SOLO account
-- deletes its connections (ON DELETE CASCADE).
BEGIN;

CREATE TABLE solo_private.connections (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('google_calendar')),
  token_ciphertext text NOT NULL CHECK (length(token_ciphertext) BETWEEN 40 AND 8192),
  scopes text NOT NULL CHECK (length(scopes) <= 1000),
  connected_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  PRIMARY KEY (user_id, provider)
);

ALTER TABLE solo_private.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.connections FORCE ROW LEVEL SECURITY;
REVOKE ALL ON solo_private.connections FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, DELETE ON solo_private.connections TO service_role;
GRANT INSERT (user_id, provider, token_ciphertext, scopes, connected_at)
  ON solo_private.connections TO service_role;
GRANT UPDATE (token_ciphertext, scopes, connected_at, last_used_at)
  ON solo_private.connections TO service_role;

-- 'member' (SOLO AI Pro) or 'free' when the session is valid; otherwise the denial code.
CREATE FUNCTION solo_private.connection_tier(p_user_id uuid, p_session_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  RETURN solo_private.customer_tier(p_user_id, p_session_id, clock_timestamp(),
    coalesce((SELECT open_access FROM solo_private.chat_policy WHERE id = true), false));
END;
$$;

CREATE FUNCTION public.solo_connections_status(p_user_id uuid, p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_tier text;
BEGIN
  v_tier := solo_private.connection_tier(p_user_id, p_session_id);
  IF v_tier NOT IN ('member', 'free') THEN
    RETURN jsonb_build_object('ok', false, 'code', v_tier);
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'tier', v_tier,
    'connections', coalesce((
      SELECT jsonb_agg(jsonb_build_object('provider', c.provider, 'connected_at', c.connected_at)
        ORDER BY c.provider)
      FROM solo_private.connections c WHERE c.user_id = p_user_id), '[]'::jsonb));
END;
$$;

CREATE FUNCTION public.solo_connection_save(
  p_user_id uuid, p_session_id uuid, p_provider text, p_ciphertext text, p_scopes text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_tier text;
BEGIN
  IF p_provider IS NULL OR p_provider NOT IN ('google_calendar') OR p_ciphertext IS NULL
    OR length(p_ciphertext) NOT BETWEEN 40 AND 8192 OR p_scopes IS NULL OR length(p_scopes) > 1000 THEN
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

-- Returns the encrypted key for one use and records when it was used.
CREATE FUNCTION public.solo_connection_token(p_user_id uuid, p_session_id uuid, p_provider text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_tier text;
  v_ciphertext text;
BEGIN
  v_tier := solo_private.connection_tier(p_user_id, p_session_id);
  IF v_tier NOT IN ('member', 'free') THEN
    RETURN jsonb_build_object('ok', false, 'code', v_tier);
  END IF;
  UPDATE solo_private.connections SET last_used_at = clock_timestamp()
    WHERE user_id = p_user_id AND provider = p_provider
    RETURNING token_ciphertext INTO v_ciphertext;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_connected', 'tier', v_tier);
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'ok', 'tier', v_tier, 'ciphertext', v_ciphertext);
END;
$$;

-- Deletes the stored key and hands it back once so the server can cancel it with the provider.
CREATE FUNCTION public.solo_connection_delete(p_user_id uuid, p_session_id uuid, p_provider text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  v_tier text;
  v_ciphertext text;
BEGIN
  v_tier := solo_private.connection_tier(p_user_id, p_session_id);
  IF v_tier NOT IN ('member', 'free') THEN
    RETURN jsonb_build_object('ok', false, 'code', v_tier);
  END IF;
  DELETE FROM solo_private.connections WHERE user_id = p_user_id AND provider = p_provider
    RETURNING token_ciphertext INTO v_ciphertext;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'code', 'not_connected');
  END IF;
  RETURN jsonb_build_object('ok', true, 'code', 'deleted', 'ciphertext', v_ciphertext);
END;
$$;

REVOKE ALL ON FUNCTION solo_private.connection_tier(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_connections_status(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_connection_save(uuid, uuid, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_connection_token(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.solo_connection_delete(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION solo_private.connection_tier(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_connections_status(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_connection_save(uuid, uuid, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_connection_token(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.solo_connection_delete(uuid, uuid, text) TO service_role;

COMMIT;

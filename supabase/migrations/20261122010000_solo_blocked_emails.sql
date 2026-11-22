-- SOLO AI: blocked email addresses.
-- An account created with a blocked address is blocked straight away (a blocked
-- chat_members row), so it can sign in but cannot chat or connect apps. This also
-- covers sign-ups made directly against Supabase Auth, not only through the app.
-- Addresses are compared in a normalised form: lower case, any "+tag" removed, and
-- for Gmail the dots removed, so simple variations of a blocked address still match.
BEGIN;

CREATE FUNCTION solo_private.normalized_email(p_email text)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE
    WHEN p_email IS NULL OR position('@' IN p_email) = 0 THEN lower(p_email)
    ELSE (
      WITH parts AS (
        SELECT split_part(lower(p_email), '@', 1) AS local, split_part(lower(p_email), '@', 2) AS domain
      ), base AS (
        SELECT split_part(local, '+', 1) AS local,
               CASE WHEN domain = 'googlemail.com' THEN 'gmail.com' ELSE domain END AS domain
        FROM parts
      )
      SELECT CASE WHEN domain = 'gmail.com' THEN replace(local, '.', '') ELSE local END || '@' || domain FROM base
    )
  END
$$;

CREATE TABLE solo_private.blocked_emails (
  email text PRIMARY KEY CHECK (email = solo_private.normalized_email(email)),
  reason text CHECK (length(reason) <= 200),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE solo_private.blocked_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE solo_private.blocked_emails FORCE ROW LEVEL SECURITY;
REVOKE ALL ON solo_private.blocked_emails FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON solo_private.blocked_emails TO service_role;

-- Runs as its owner so the Auth service, which creates users, can record the block.
CREATE FUNCTION solo_private.block_listed_signup()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM solo_private.blocked_emails b
             WHERE b.email = solo_private.normalized_email(NEW.email)) THEN
    INSERT INTO solo_private.chat_members (user_id, blocked, expires_at)
      VALUES (NEW.id, true, clock_timestamp())
      ON CONFLICT (user_id) DO UPDATE SET blocked = true;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION solo_private.block_listed_signup() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER solo_block_listed_signup
  AFTER INSERT OR UPDATE OF email ON auth.users
  FOR EACH ROW EXECUTE FUNCTION solo_private.block_listed_signup();

COMMIT;

// Version 1: account/security records only; public tract data stays bundled.
export const POSTGRES_SCHEMA = `
    CREATE TABLE IF NOT EXISTS accounts (id TEXT PRIMARY KEY, terms TEXT NOT NULL, created BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, public_key BYTEA NOT NULL, counter BIGINT NOT NULL, transports TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires BIGINT NOT NULL, verified BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS challenges (hash TEXT PRIMARY KEY, kind TEXT NOT NULL, challenge TEXT NOT NULL, account TEXT NOT NULL, expires BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS recovery (hash TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE);
    CREATE TABLE IF NOT EXISTS usage (id BIGSERIAL PRIMARY KEY, subject TEXT NOT NULL, action TEXT NOT NULL, at BIGINT NOT NULL, amount BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS usage_lookup ON usage(subject,action,at);
    CREATE INDEX IF NOT EXISTS usage_expiry ON usage(at);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS exports (id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, fingerprint TEXT NOT NULL, at BIGINT NOT NULL, filename TEXT NOT NULL, mime TEXT NOT NULL, body BYTEA, rows BIGINT NOT NULL);
    CREATE INDEX IF NOT EXISTS export_owner ON exports(account,at);
    CREATE TABLE IF NOT EXISTS consent_documents (digest TEXT PRIMARY KEY, version TEXT NOT NULL, document TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS consents (hash TEXT PRIMARY KEY, version TEXT NOT NULL, digest TEXT NOT NULL REFERENCES consent_documents(digest), channel TEXT NOT NULL CHECK(channel IN ('web','mcp')), accepted BIGINT NOT NULL, expires BIGINT NOT NULL, revoked BIGINT NOT NULL DEFAULT 0, account TEXT REFERENCES accounts(id) ON DELETE CASCADE, connection_id TEXT);
    CREATE INDEX IF NOT EXISTS consent_retention ON consents(accepted);

CREATE TABLE IF NOT EXISTS mcp_connections (
    id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    label TEXT NOT NULL, consent_hash TEXT NOT NULL UNIQUE REFERENCES consents(hash) ON DELETE CASCADE,
    created BIGINT NOT NULL, last_used BIGINT
  ); CREATE INDEX IF NOT EXISTS mcp_connection_owner ON mcp_connections(account);
CREATE TABLE IF NOT EXISTS mcp_leases (id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, expires BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS mcp_events (subject TEXT NOT NULL, code TEXT NOT NULL, bucket BIGINT NOT NULL, count BIGINT NOT NULL, PRIMARY KEY(subject,code,bucket));
    CREATE TABLE IF NOT EXISTS mcp_cooldowns (subject TEXT PRIMARY KEY, until BIGINT NOT NULL, level BIGINT NOT NULL);
CREATE TABLE IF NOT EXISTS oauth_clients (id TEXT PRIMARY KEY, name TEXT NOT NULL, redirects TEXT NOT NULL, created BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_codes (hash TEXT PRIMARY KEY, client TEXT NOT NULL REFERENCES oauth_clients(id), account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE, redirect TEXT NOT NULL, challenge TEXT NOT NULL, resource TEXT NOT NULL, accepted BIGINT NOT NULL, version TEXT NOT NULL, digest TEXT NOT NULL, expires BIGINT NOT NULL);
    CREATE TABLE IF NOT EXISTS oauth_access (hash TEXT PRIMARY KEY REFERENCES consents(hash) ON DELETE CASCADE, client TEXT NOT NULL REFERENCES oauth_clients(id), resource TEXT NOT NULL, scope TEXT NOT NULL);

CREATE TABLE IF NOT EXISTS public_cache (key TEXT PRIMARY KEY, body TEXT NOT NULL, checked BIGINT NOT NULL, expires BIGINT NOT NULL);
CREATE OR REPLACE FUNCTION oz_account_mcp_cleanup() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM mcp_events WHERE subject=OLD.id;
  DELETE FROM mcp_cooldowns WHERE subject=OLD.id;
  RETURN OLD;
END; $$;
DROP TRIGGER IF EXISTS account_mcp_cleanup ON accounts;
CREATE TRIGGER account_mcp_cleanup AFTER DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION oz_account_mcp_cleanup();
`;

/** Additive metadata: legacy dates remain unknown instead of being fabricated. */
export const ACCOUNT_SCHEMA = `
CREATE TABLE IF NOT EXISTS credential_details (
  credential TEXT PRIMARY KEY REFERENCES credentials(id) ON DELETE CASCADE,
  label TEXT NOT NULL DEFAULT '', created BIGINT, last_used BIGINT
);
CREATE TABLE IF NOT EXISTS session_details (
  hash TEXT PRIMARY KEY REFERENCES sessions(hash) ON DELETE CASCADE,
  id TEXT NOT NULL UNIQUE, created BIGINT, last_used BIGINT
);
CREATE TABLE IF NOT EXISTS account_acceptances (
  account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  version TEXT NOT NULL, accepted BIGINT NOT NULL, PRIMARY KEY(account,version)
);`;

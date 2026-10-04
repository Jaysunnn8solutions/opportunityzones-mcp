/** Portable SQLite/PostgreSQL operations metadata; never research contents. */
export const OPERATIONS_SCHEMA = `
CREATE TABLE IF NOT EXISTS account_allowances (
  account TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  subject TEXT NOT NULL, expires BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS security_events (
  id TEXT PRIMARY KEY, account TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  code TEXT NOT NULL, at BIGINT NOT NULL
);
CREATE INDEX IF NOT EXISTS security_owner ON security_events(account,at);
CREATE TABLE IF NOT EXISTS operator_audit (
  id TEXT PRIMARY KEY, actor TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  action TEXT NOT NULL, target TEXT REFERENCES accounts(id) ON DELETE SET NULL,
  at BIGINT NOT NULL
);`;

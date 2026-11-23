-- A record of every tool call an outside agent made through MCP. It never holds a credential: the arguments are
-- summarised (long text is cut, anything that looks like a secret is replaced).
CREATE TABLE mcp_audit (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  at        TEXT NOT NULL,
  transport TEXT NOT NULL,
  caller    TEXT NOT NULL,
  tool      TEXT NOT NULL,
  args      TEXT NOT NULL,
  outcome   TEXT NOT NULL CHECK (outcome IN ('ok', 'error')),
  detail    TEXT NOT NULL DEFAULT ''
);

CREATE INDEX mcp_audit_at ON mcp_audit (id DESC);

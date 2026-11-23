package mcpserver

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/modelcontextprotocol/go-sdk/mcp"
)

const (
	maxAuditRows  = 5000
	maxArgsChars  = 600
	maxStringArg  = 80
	maxDetailChar = 300
)

// secretKey matches argument names that look like they carry a credential. No tool takes one, but an agent may send
// extra arguments, and the audit trail must never become a place secrets end up.
var secretKey = regexp.MustCompile(`(?i)(token|secret|password|passwd|authorization|api[-_]?key|credential|cookie|bearer)`)

// AuditEntry is one recorded tool call.
type AuditEntry struct {
	ID        int64  `json:"id"`
	At        string `json:"at"`
	Transport string `json:"transport"` // "http" or "stdio"
	Caller    string `json:"caller"`    // what the client called itself: not verified
	Tool      string `json:"tool"`
	Args      string `json:"args"` // a summary, never the full text
	Outcome   string `json:"outcome"`
	Detail    string `json:"detail,omitempty"`
}

// Auditor records every tool call an outside agent makes.
type Auditor struct {
	db  *sql.DB
	now func() time.Time
}

// NewAuditor returns an Auditor writing to db.
func NewAuditor(db *sql.DB) *Auditor { return &Auditor{db: db, now: time.Now} }

// SummarizeArgs turns tool arguments into a short, safe string: long text is cut, lists and objects are counted, and
// anything under a secret-looking name is replaced.
func SummarizeArgs(raw json.RawMessage) string {
	if len(raw) == 0 {
		return "{}"
	}
	var m map[string]any
	if err := json.Unmarshal(raw, &m); err != nil {
		return "(unreadable arguments)"
	}
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	out := make(map[string]any, len(m))
	for _, k := range keys {
		key := clip(strings.Map(func(r rune) rune {
			if unicode.IsControl(r) {
				return ' '
			}
			return r
		}, k), 40)
		switch v := m[k].(type) {
		case string:
			if secretKey.MatchString(k) {
				out[key] = "[redacted]"
			} else if n := len([]rune(v)); n > maxStringArg {
				out[key] = clip(v, maxStringArg) + fmt.Sprintf("… (%d characters)", n)
			} else {
				out[key] = v
			}
		case []any:
			out[key] = fmt.Sprintf("[%d items]", len(v))
		case map[string]any:
			out[key] = "{…}"
		default:
			if secretKey.MatchString(k) {
				out[key] = "[redacted]"
			} else {
				out[key] = v
			}
		}
	}
	b, _ := json.Marshal(out)
	return clip(string(b), maxArgsChars)
}

func clip(s string, n int) string {
	if r := []rune(s); len(r) > n {
		return string(r[:n])
	}
	return s
}

// Record stores one entry and trims the table to the newest rows.
func (a *Auditor) Record(ctx context.Context, e AuditEntry) error {
	if e.Outcome != "ok" {
		e.Outcome = "error"
	}
	_, err := a.db.ExecContext(ctx, `INSERT INTO mcp_audit (at, transport, caller, tool, args, outcome, detail) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		a.now().UTC().Format(time.RFC3339), e.Transport, clip(e.Caller, 100), clip(e.Tool, 100), e.Args, e.Outcome, clip(e.Detail, maxDetailChar))
	if err != nil {
		return err
	}
	_, err = a.db.ExecContext(ctx, `DELETE FROM mcp_audit WHERE id <= (SELECT MAX(id) FROM mcp_audit) - ?`, maxAuditRows)
	return err
}

// List returns the newest entries first.
func (a *Auditor) List(ctx context.Context, limit int) ([]AuditEntry, error) {
	if limit <= 0 || limit > 500 {
		limit = 100
	}
	rows, err := a.db.QueryContext(ctx, `SELECT id, at, transport, caller, tool, args, outcome, detail FROM mcp_audit ORDER BY id DESC LIMIT ?`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []AuditEntry{}
	for rows.Next() {
		var e AuditEntry
		if err := rows.Scan(&e.ID, &e.At, &e.Transport, &e.Caller, &e.Tool, &e.Args, &e.Outcome, &e.Detail); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

// callerOf describes the client as it described itself when it connected. It is a label, not an identity.
func callerOf(ci *mcp.Implementation) string {
	if ci == nil || ci.Name == "" {
		return "unknown client"
	}
	label := ci.Name
	if ci.Version != "" {
		label += " " + ci.Version
	}
	return strings.Join(strings.Fields(strings.Map(func(r rune) rune {
		if unicode.IsControl(r) {
			return ' '
		}
		return r
	}, label)), " ")
}

// Middleware records every tool call after it has run. A failure to write the record is logged and does not stop the
// call: the audit must not be a way to break the tools.
func (a *Auditor) Middleware(transport string) mcp.Middleware {
	return func(next mcp.MethodHandler) mcp.MethodHandler {
		return func(ctx context.Context, method string, req mcp.Request) (mcp.Result, error) {
			res, err := next(ctx, method, req)
			if method != "tools/call" {
				return res, err
			}
			e := AuditEntry{Transport: transport, Caller: "unknown client", Tool: "(unknown)", Args: "{}", Outcome: "ok"}
			if ctr, ok := req.(*mcp.CallToolRequest); ok && ctr.Params != nil {
				e.Tool = ctr.Params.Name
				e.Args = SummarizeArgs(ctr.Params.Arguments)
				e.Caller = callerOf(ctr.ClientInfo())
			}
			switch {
			case err != nil:
				e.Outcome, e.Detail = "error", err.Error()
			default:
				if r, ok := res.(*mcp.CallToolResult); ok && r.IsError {
					e.Outcome = "error"
					for _, c := range r.Content {
						if t, ok := c.(*mcp.TextContent); ok {
							e.Detail = t.Text
							break
						}
					}
				}
			}
			if rerr := a.Record(context.WithoutCancel(ctx), e); rerr != nil {
				log.Printf("mcp audit: could not record %s: %v", e.Tool, rerr)
			}
			return res, err
		}
	}
}

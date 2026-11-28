package service

import (
	"context"
	"log"
)

// The events of the security log.
const (
	EventSignIn        = "sign_in"
	EventSignInFailed  = "sign_in_failed"
	EventPaused        = "sign_in_paused"
	EventSignOut       = "sign_out"
	EventSignUp        = "sign_up"
	EventUserAdded     = "user_added"
	EventPasswordOwn   = "password_changed"
	EventPasswordSet   = "password_set"
	EventRole          = "role_changed"
	EventStatus        = "status_changed"
	EventSettings      = "security_changed"
	EventSettingsReset = "security_reset"
	EventEveryoneOut   = "everyone_signed_out"
)

const (
	keptEvents = 2000
	eventsPage = 50
)

// SecurityEvent is one line of the log.
type SecurityEvent struct {
	ID      int64  `json:"id"`
	At      string `json:"at"`
	Event   string `json:"event"`
	Actor   string `json:"actor,omitempty"`
	Subject string `json:"subject,omitempty"`
	Address string `json:"address,omitempty"`
	Detail  string `json:"detail,omitempty"`
}

type addressKey struct{}

// WithAddress returns a context that says where a request came from, for the security log.
func WithAddress(ctx context.Context, addr string) context.Context {
	return context.WithValue(ctx, addressKey{}, addr)
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) > n {
		return string(r[:n])
	}
	return s
}

// record adds a line to the log. A log that cannot be written never stops what is being done.
func (a *Accounts) record(ctx context.Context, event, subject, detail string) {
	actor := ""
	if p, ok := PrincipalFrom(ctx); ok && p.User != nil {
		actor = p.User.Email
	}
	addr, _ := ctx.Value(addressKey{}).(string)
	ctx = context.WithoutCancel(ctx) // recorded even if the visitor has gone
	if _, err := a.db.ExecContext(ctx, `INSERT INTO security_events (at, event, actor, subject, address, detail) VALUES (?, ?, ?, ?, ?, ?)`,
		a.stamp(), event, actor, clip(subject, 254), clip(addr, 64), clip(detail, 300)); err != nil {
		log.Printf("security log: %v", err)
		return
	}
	if _, err := a.db.ExecContext(ctx, `DELETE FROM security_events WHERE id <= (SELECT MAX(id) FROM security_events) - ?`, keptEvents); err != nil {
		log.Printf("security log: %v", err)
	}
}

// SecurityLog returns the newest events, those older than before when it is above zero, and whether there are more.
func (a *Accounts) SecurityLog(ctx context.Context, before int64) ([]SecurityEvent, bool, error) {
	query, args := `SELECT id, at, event, actor, subject, address, detail FROM security_events`, []any{}
	if before > 0 {
		query, args = query+` WHERE id < ?`, append(args, before)
	}
	rows, err := a.db.QueryContext(ctx, query+` ORDER BY id DESC LIMIT ?`, append(args, eventsPage+1)...)
	if err != nil {
		return nil, false, err
	}
	defer rows.Close()
	out := []SecurityEvent{}
	for rows.Next() {
		var e SecurityEvent
		if err := rows.Scan(&e.ID, &e.At, &e.Event, &e.Actor, &e.Subject, &e.Address, &e.Detail); err != nil {
			return nil, false, err
		}
		out = append(out, e)
	}
	if len(out) > eventsPage {
		return out[:eventsPage], true, rows.Err()
	}
	return out, false, rows.Err()
}

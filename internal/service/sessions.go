package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"time"
)

// How long a sign-in lasts unless the server says otherwise.
const (
	DefaultSessionIdle = 20 * time.Minute
	DefaultSessionMax  = 12 * time.Hour
	// useRecorded is how stale the time of last use may be before it is written again, so that not every request writes.
	useRecorded = 15 * time.Second
)

// SessionTimes is how long a sign-in has left.
type SessionTimes struct {
	Remaining time.Duration
	// Limit says what ends it first: "idle" (using the app extends it) or "max" (nothing does).
	Limit string
}

// SessionLimits are the longest a sign-in may go unused, and last in all.
func (a *Accounts) SessionLimits(ctx context.Context) (idle, max time.Duration) {
	now, mark := a.now(), a.cache.mark()
	if idle, max, ok := a.cache.limits(now); ok {
		return idle, max
	}
	s, _ := a.Security(ctx)
	a.cache.keepLimits(mark, s.idle(), s.max(), now)
	return s.idle(), s.max()
}

// StartSession signs a person in without a password (used after sign-up).
func (a *Accounts) StartSession(ctx context.Context, userID string) (string, error) {
	return a.startSession(ctx, userID)
}

func (a *Accounts) startSession(ctx context.Context, userID string) (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	token := base64.RawURLEncoding.EncodeToString(b)
	now := a.now().UTC()
	idle, max := a.SessionLimits(ctx)
	_, err := a.db.ExecContext(ctx, `INSERT INTO sessions (token_hash, user_id, created_at, last_seen_at, expires_at) VALUES (?, ?, ?, ?, ?)`,
		tokenHash(token), userID, now.Format(time.RFC3339), now.Format(time.RFC3339), now.Add(max).Format(time.RFC3339))
	if err != nil {
		return "", err
	}
	// tidy up what has ended (the times are text in one format, so they compare in order)
	_, _ = a.db.ExecContext(ctx, `DELETE FROM sessions WHERE created_at < ? OR last_seen_at < ?`,
		now.Add(-max).Format(time.RFC3339), now.Add(-idle).Format(time.RFC3339))
	return token, nil
}

// Authenticate returns the person a session token belongs to, counting this as use of the session.
func (a *Accounts) Authenticate(ctx context.Context, token string) (User, error) {
	u, _, err := a.Session(ctx, token, true)
	return u, err
}

// Session returns the person a session token belongs to and how long the session has left. With use, this is the person
// doing something and the idle time starts again; without it (a screen refreshing itself) nothing is extended.
func (a *Accounts) Session(ctx context.Context, token string, use bool) (User, SessionTimes, error) {
	var none SessionTimes
	if token == "" {
		return User{}, none, ErrUnauthorized
	}
	now := a.now().UTC()
	idle, max := a.SessionLimits(ctx)
	key := string(tokenHash(token))
	over := func(began, last time.Time) bool { return !now.Before(began.Add(max)) || !now.Before(last.Add(idle)) }
	e, kept := a.cache.get(key, now)
	if kept && over(e.began, e.last) {
		// what is kept says it has ended: look again before ending it, as another server may have seen it used
		a.cache.drop(key)
		kept = false
	}
	if !kept {
		mark := a.cache.mark()
		var uid, created, seen string
		err := a.db.QueryRowContext(ctx, `SELECT user_id, created_at, last_seen_at FROM sessions WHERE token_hash = ?`, tokenHash(token)).Scan(&uid, &created, &seen)
		if errors.Is(err, sql.ErrNoRows) {
			return User{}, none, ErrUnauthorized
		}
		if err != nil {
			return User{}, none, err
		}
		began, err1 := time.Parse(time.RFC3339, created)
		last, err2 := time.Parse(time.RFC3339, seen)
		if err1 != nil || err2 != nil || over(began, last) {
			_, _ = a.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = ?`, tokenHash(token))
			return User{}, none, ErrUnauthorized
		}
		u, _, err := a.loadUser(ctx, `id = ?`, uid)
		if err != nil || u.Status != "active" {
			return User{}, none, ErrUnauthorized
		}
		e = cachedSession{user: u, began: began, last: last}
		a.cache.put(mark, key, e, now)
	}
	u, began, last := e.user, e.began, e.last
	if use && now.Sub(last) >= useRecorded {
		res, err := a.db.ExecContext(ctx, `UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?`, now.Format(time.RFC3339), tokenHash(token))
		if err == nil {
			if n, nerr := res.RowsAffected(); nerr == nil && n == 0 { // ended by someone else since it was read
				a.cache.drop(key)
				return User{}, none, ErrUnauthorized
			}
			last = now
			// kept to the second, as the database has it
			a.cache.used(key, now.Truncate(time.Second))
		}
	}
	t := SessionTimes{Remaining: last.Add(idle).Sub(now), Limit: "idle"}
	if left := began.Add(max).Sub(now); left <= t.Remaining {
		t = SessionTimes{Remaining: left, Limit: "max"}
	}
	return u, t, nil
}

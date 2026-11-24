package service

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"time"
	"unicode/utf8"
)

const (
	// KeyPrefix starts every API key, so one is easy to recognise (and to find if it leaks into a log or a repository).
	KeyPrefix        = "cpk_"
	maxKeyName       = 60
	maxKeysPerUser   = 20
	keyLastUsedEvery = time.Minute
)

// KeyScopes are the scopes a key can be given.
var KeyScopes = []string{"editor"}

// APIKey is a key as it is listed. The secret is never in it.
type APIKey struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Prefix     string `json:"prefix"`
	Scope      string `json:"scope"`
	CreatedAt  string `json:"createdAt"`
	LastUsedAt string `json:"lastUsedAt,omitempty"`
}

// CreateKey makes a key for a person and returns it with the secret, which is shown this once and kept only as a hash.
func (a *Accounts) CreateKey(ctx context.Context, userID, name, scope string) (APIKey, string, error) {
	name = squash(name)
	if name == "" || utf8.RuneCountInString(name) > maxKeyName {
		return APIKey{}, "", invalid("give the key a name of up to %d characters", maxKeyName)
	}
	if scope == "" {
		scope = "editor"
	}
	if _, ok := keyScopes[scope]; !ok {
		return APIKey{}, "", invalid("scope must be one of: editor")
	}
	if _, err := a.Get(ctx, userID); err != nil {
		return APIKey{}, "", err
	}
	var n int
	if err := a.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM api_keys WHERE user_id = ? AND revoked_at = ''`, userID).Scan(&n); err != nil {
		return APIKey{}, "", err
	}
	if n >= maxKeysPerUser {
		return APIKey{}, "", fmt.Errorf("%w: at most %d keys; revoke one you no longer use", ErrConflict, maxKeysPerUser)
	}
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return APIKey{}, "", err
	}
	secret := KeyPrefix + base64.RawURLEncoding.EncodeToString(b)
	k := APIKey{ID: newID(), Name: name, Prefix: secret[:len(KeyPrefix)+4], Scope: scope, CreatedAt: a.stamp()}
	if _, err := a.db.ExecContext(ctx, `INSERT INTO api_keys (id, user_id, name, prefix, key_hash, scope, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
		k.ID, userID, k.Name, k.Prefix, tokenHash(secret), k.Scope, k.CreatedAt); err != nil {
		return APIKey{}, "", err
	}
	return k, secret, nil
}

// Keys lists a person's active keys, newest first.
func (a *Accounts) Keys(ctx context.Context, userID string) ([]APIKey, error) {
	rows, err := a.db.QueryContext(ctx, `SELECT id, name, prefix, scope, created_at, last_used_at FROM api_keys WHERE user_id = ? AND revoked_at = '' ORDER BY created_at DESC, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []APIKey{}
	for rows.Next() {
		var k APIKey
		if err := rows.Scan(&k.ID, &k.Name, &k.Prefix, &k.Scope, &k.CreatedAt, &k.LastUsedAt); err != nil {
			return nil, err
		}
		out = append(out, k)
	}
	return out, rows.Err()
}

// RevokeKey ends a key. A person can only revoke their own; one that is not theirs looks like one that does not exist.
func (a *Accounts) RevokeKey(ctx context.Context, userID, keyID string) error {
	res, err := a.db.ExecContext(ctx, `UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at = ''`, a.stamp(), keyID, userID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return ErrNotFound
	}
	return nil
}

// AuthenticateKey returns the person a key acts for, with the key's id and scope. A revoked key, an unknown one and one whose
// person is disabled all answer the same.
func (a *Accounts) AuthenticateKey(ctx context.Context, secret string) (User, string, string, error) {
	if len(secret) < len(KeyPrefix)+20 || secret[:len(KeyPrefix)] != KeyPrefix {
		return User{}, "", "", ErrUnauthorized
	}
	var id, uid, scope, last string
	err := a.db.QueryRowContext(ctx, `SELECT id, user_id, scope, last_used_at FROM api_keys WHERE key_hash = ? AND revoked_at = ''`, tokenHash(secret)).Scan(&id, &uid, &scope, &last)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, "", "", ErrUnauthorized
	}
	if err != nil {
		return User{}, "", "", err
	}
	u, err := a.Get(ctx, uid)
	if err != nil || u.Status != "active" {
		return User{}, "", "", ErrUnauthorized
	}
	if t, perr := time.Parse(time.RFC3339, last); perr != nil || a.now().Sub(t) > keyLastUsedEvery {
		_, _ = a.db.ExecContext(ctx, `UPDATE api_keys SET last_used_at = ? WHERE id = ?`, a.stamp(), id)
	}
	return u, id, scope, nil
}

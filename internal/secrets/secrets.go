// Package secrets encrypts credentials before they are stored.
//
// Values are sealed with AES-256-GCM. The key is derived from a secret string (CARDPRESS_SECRET_KEY, or a generated key
// file for local use) with HKDF-SHA256. Each value gets its own random nonce, and the field it belongs to is bound
// in as additional data, so a ciphertext copied into another field fails to open.
package secrets

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/hkdf"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// MinSecretLen is the shortest secret accepted. Use a long random value, for example `openssl rand -hex 32`.
const MinSecretLen = 32

// ErrCannotOpen means a value could not be decrypted: the key changed or the data was altered.
var ErrCannotOpen = errors.New("cannot decrypt: wrong key or damaged data")

// Box seals and opens values.
type Box struct {
	aead   cipher.AEAD
	Source string // "env" or "file", for display
}

// NewBox derives a key from secret.
func NewBox(secret, source string) (*Box, error) {
	if len(secret) < MinSecretLen {
		return nil, fmt.Errorf("the secret key is too short: use at least %d characters (for example `openssl rand -hex 32`)", MinSecretLen)
	}
	key, err := hkdf.Key(sha256.New, []byte(secret), nil, "cardpress credentials v1", 32)
	if err != nil {
		return nil, err
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	aead, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	return &Box{aead: aead, Source: source}, nil
}

// Seal encrypts plain, binding aad (for example "linkedin/accessToken"). The result is base64 of nonce plus ciphertext.
func (b *Box) Seal(plain, aad string) (string, error) {
	nonce := make([]byte, b.aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", err
	}
	out := b.aead.Seal(nonce, nonce, []byte(plain), []byte(aad))
	return base64.StdEncoding.EncodeToString(out), nil
}

// Open reverses Seal.
func (b *Box) Open(sealed, aad string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(sealed)
	if err != nil || len(raw) < b.aead.NonceSize() {
		return "", ErrCannotOpen
	}
	n := b.aead.NonceSize()
	plain, err := b.aead.Open(nil, raw[:n], raw[n:], []byte(aad))
	if err != nil {
		return "", ErrCannotOpen
	}
	return string(plain), nil
}

// KeyFileSecret returns the secret stored in path, creating the file (mode 0600) with a random secret if it does not
// exist. It is meant for a local, single-user setup: the key then lives next to the database, so back both up together.
func KeyFileSecret(path string) (secret string, created bool, err error) {
	if b, rerr := os.ReadFile(path); rerr == nil {
		s := strings.TrimSpace(string(b))
		if len(s) < MinSecretLen {
			return "", false, fmt.Errorf("the key file %s is damaged (too short); remove it only if you accept losing the stored credentials", path)
		}
		return s, false, nil
	} else if !errors.Is(rerr, os.ErrNotExist) {
		return "", false, rerr
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return "", false, err
	}
	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", false, err
	}
	secret = hex.EncodeToString(raw)
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return "", false, err
	}
	if _, err := f.WriteString(secret + "\n"); err != nil {
		f.Close()
		return "", false, err
	}
	return secret, true, f.Close()
}

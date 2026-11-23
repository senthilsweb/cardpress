package secrets

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

const key = "0123456789abcdef0123456789abcdef"

func box(t *testing.T, secret string) *Box {
	t.Helper()
	b, err := NewBox(secret, "env")
	if err != nil {
		t.Fatal(err)
	}
	return b
}

func TestSealOpenRoundTrip(t *testing.T) {
	b := box(t, key)
	sealed, err := b.Seal("tok-123", "linkedin/accessToken")
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(sealed, "tok-123") {
		t.Fatal("plaintext visible in the sealed value")
	}
	got, err := b.Open(sealed, "linkedin/accessToken")
	if err != nil || got != "tok-123" {
		t.Fatalf("%q %v", got, err)
	}
	again, _ := b.Seal("tok-123", "linkedin/accessToken")
	if again == sealed {
		t.Fatal("two seals of the same value must differ (random nonce)")
	}
}

func TestOpenRejectsWrongKeyFieldAndTampering(t *testing.T) {
	b := box(t, key)
	sealed, _ := b.Seal("secret", "x/apiSecret")
	if _, err := b.Open(sealed, "x/apiKey"); !errors.Is(err, ErrCannotOpen) {
		t.Fatalf("a value moved to another field must not open: %v", err)
	}
	if _, err := box(t, strings.Repeat("z", 32)).Open(sealed, "x/apiSecret"); !errors.Is(err, ErrCannotOpen) {
		t.Fatalf("wrong key: %v", err)
	}
	tampered := sealed[:len(sealed)-4] + "AAAA"
	if _, err := b.Open(tampered, "x/apiSecret"); !errors.Is(err, ErrCannotOpen) {
		t.Fatalf("tampered: %v", err)
	}
	for _, junk := range []string{"", "!!!", "AAAA"} {
		if _, err := b.Open(junk, "x"); !errors.Is(err, ErrCannotOpen) {
			t.Fatalf("junk %q: %v", junk, err)
		}
	}
}

func TestShortSecretRejected(t *testing.T) {
	if _, err := NewBox("short", "env"); err == nil {
		t.Fatal("expected error")
	}
}

func TestKeyFileCreatedPrivateAndReused(t *testing.T) {
	path := filepath.Join(t.TempDir(), "nested", "secret.key")
	s1, created, err := KeyFileSecret(path)
	if err != nil || !created || len(s1) < MinSecretLen {
		t.Fatalf("%q %v %v", s1, created, err)
	}
	if fi, _ := os.Stat(path); fi.Mode().Perm() != 0o600 {
		t.Fatalf("key file mode = %v, want 0600", fi.Mode().Perm())
	}
	s2, created, err := KeyFileSecret(path)
	if err != nil || created || s2 != s1 {
		t.Fatalf("reuse failed: %v %v", created, err)
	}
	if err := os.WriteFile(path, []byte("tiny"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := KeyFileSecret(path); err == nil {
		t.Fatal("a damaged key file must be an error, never silently replaced")
	}
}

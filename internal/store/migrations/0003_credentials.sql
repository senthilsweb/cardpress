-- One row per credential field. value is base64(nonce + AES-GCM ciphertext); the plaintext is never stored.
CREATE TABLE credentials (
  network    TEXT NOT NULL,
  field      TEXT NOT NULL,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (network, field)
);

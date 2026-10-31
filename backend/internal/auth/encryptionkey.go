package auth

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
)

// publishedKeys are the SHA-256 hashes of encryption keys that have been
// published, and so protect nothing: anyone can read them.
//
// The first is the development key docker-compose.yml carried until
// 2026-10-24, so that `docker compose up` had 2FA out of the box. It is in
// the repository's history for good. Development now generates a key per
// machine (docker-compose.override.yml), and this list makes sure the old one
// can never protect a real instance, however it got into its .env.
//
// Hashes, not the keys, so that the keys are not written out here again for
// every secret scanner to find.
var publishedKeys = map[string]bool{
	"07b55e08f76d79135803828747e7bf24dc6a79fa3cd9b88d15cf0e2928581339": true,
}

// ErrPublishedKey is returned for an encryption key everyone can read.
var ErrPublishedKey = errors.New("this is the development key once published in the nafin-toolbox repository, " +
	"which anyone can read: it protects nothing. Generate your own with `openssl rand -hex 32` " +
	"and see \"If your instance ran on the published key\" in SECURITY.md")

// IsPublishedKey reports whether hexKey is one of publishedKeys.
func IsPublishedKey(hexKey string) bool {
	sum := sha256.Sum256([]byte(strings.ToLower(strings.TrimSpace(hexKey))))
	return publishedKeys[hex.EncodeToString(sum[:])]
}

// LoadEncryptionKey finds the encryption key the server is given, and says
// where it came from.
//
//   - ENCRYPTION_KEY: the key itself, as 64 hex characters. Production sets it
//     from .env.
//   - ENCRYPTION_KEY_FILE: a file holding it. Development generates one per
//     machine; Docker secrets work the same way.
//
// ENCRYPTION_KEY wins when both are set. Neither gives (nil, "", nil): the
// server runs without 2FA and says so. A key that is malformed or published
// is an error, so the server stops rather than run on it.
func LoadEncryptionKey(getenv func(string) string, readFile func(string) ([]byte, error)) ([]byte, string, error) {
	keyHex, source := getenv("ENCRYPTION_KEY"), "ENCRYPTION_KEY"
	if keyHex == "" {
		path := getenv("ENCRYPTION_KEY_FILE")
		if path == "" {
			return nil, "", nil
		}
		b, err := readFile(path)
		if err != nil {
			return nil, "", fmt.Errorf("reading ENCRYPTION_KEY_FILE: %w", err)
		}
		keyHex, source = strings.TrimSpace(string(b)), "ENCRYPTION_KEY_FILE ("+path+")"
	}
	if IsPublishedKey(keyHex) {
		return nil, source, fmt.Errorf("%s: %w", source, ErrPublishedKey)
	}
	key, err := ParseEncryptionKey(strings.ToLower(keyHex))
	if err != nil {
		return nil, source, fmt.Errorf("%s: %w", source, err)
	}
	return key, source, nil
}

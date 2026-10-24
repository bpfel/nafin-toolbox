package auth

import (
	"crypto/hkdf"
	"crypto/pbkdf2"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"strings"
)

// The keys a password stands for, derived the same way as in the browser
// (frontend/src/lib/crypto/keys.ts). See plans/key-separation-plan.md.
//
//	masterKey = PBKDF2-SHA256(password, salt = lower-case email, iterations)
//	authKey   = HKDF-SHA256(masterKey, info = "nafin v2 auth")   — sent to sign in
//	vaultKEK  = HKDF-SHA256(masterKey, info = "nafin v2 vault")  — never sent
//
// The server stores bcrypt(authKey) and never sees the password, or anything
// that leads to vaultKEK. This file exists for the one password the server
// makes itself: the temporary password of an admin reset, whose auth key it
// has to store. It derives the auth key only; there is no Go code for the
// vault key, on purpose.
//
// Neither side normalises the password's Unicode: version 1 accounts derived
// their vault key from the password's bytes as typed, and migration has to
// reach the same bits.

const (
	// AuthVersionPassword: the account signs in with its password, and the
	// server has seen it. Every account made before key separation.
	AuthVersionPassword = 1
	// AuthVersionKey: the account signs in with an auth key derived from the
	// password in the browser.
	AuthVersionKey = 2

	authKeyInfo = "nafin v2 auth"
)

func masterKey(password, email string, iterations int) ([]byte, error) {
	return pbkdf2.Key(sha256.New, password, []byte(strings.ToLower(email)), iterations, 32)
}

// DeriveAuthKey is the auth key for password on the account with this email,
// base64 as the browser sends it.
func DeriveAuthKey(password, email string, iterations int) (string, error) {
	m, err := masterKey(password, email, iterations)
	if err != nil {
		return "", err
	}
	k, err := hkdf.Key(sha256.New, m, nil, authKeyInfo, 32)
	if err != nil {
		return "", err
	}
	return base64.StdEncoding.EncodeToString(k), nil
}

var errMalformedAuthKey = errors.New("malformed auth key")

// ValidAuthKey reports whether s has the shape of an auth key: 32 bytes,
// base64. The only check the server can make on a password it never sees —
// the rules for the password itself are the browser's (lib/auth/rules.ts).
func ValidAuthKey(s string) bool {
	b, err := base64.StdEncoding.DecodeString(s)
	return err == nil && len(b) == 32
}

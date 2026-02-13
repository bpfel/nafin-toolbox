package auth

import (
	"crypto/rand"
	"encoding/hex"
	"testing"
)

func generateTestKey(t *testing.T) []byte {
	t.Helper()
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatalf("generating test key: %v", err)
	}
	return key
}

func TestParseEncryptionKey(t *testing.T) {
	key := make([]byte, 32)
	rand.Read(key)
	hexKey := hex.EncodeToString(key)

	parsed, err := ParseEncryptionKey(hexKey)
	if err != nil {
		t.Fatalf("ParseEncryptionKey: %v", err)
	}
	if len(parsed) != 32 {
		t.Fatalf("expected 32 bytes, got %d", len(parsed))
	}

	// Too short
	if _, err := ParseEncryptionKey("abcd"); err == nil {
		t.Error("expected error for short key")
	}

	// Invalid hex
	if _, err := ParseEncryptionKey("zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz"); err == nil {
		t.Error("expected error for invalid hex")
	}
}

func TestEncryptDecrypt_RoundTrip(t *testing.T) {
	key := generateTestKey(t)
	plaintext := []byte("my-secret-totp-key-BASE32ENCODED")

	encrypted, err := Encrypt(plaintext, key)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	decrypted, err := Decrypt(encrypted, key)
	if err != nil {
		t.Fatalf("Decrypt: %v", err)
	}

	if string(decrypted) != string(plaintext) {
		t.Errorf("decrypted %q, want %q", decrypted, plaintext)
	}
}

func TestDecrypt_WrongKey(t *testing.T) {
	key1 := generateTestKey(t)
	key2 := generateTestKey(t)

	encrypted, err := Encrypt([]byte("secret"), key1)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	_, err = Decrypt(encrypted, key2)
	if err == nil {
		t.Error("expected decryption error with wrong key")
	}
}

func TestDecrypt_TamperedCiphertext(t *testing.T) {
	key := generateTestKey(t)

	encrypted, err := Encrypt([]byte("secret"), key)
	if err != nil {
		t.Fatalf("Encrypt: %v", err)
	}

	// Tamper with last character
	tampered := encrypted[:len(encrypted)-1] + "X"

	_, err = Decrypt(tampered, key)
	if err == nil {
		t.Error("expected error for tampered ciphertext")
	}
}

func TestEncrypt_DifferentCiphertexts(t *testing.T) {
	key := generateTestKey(t)
	plaintext := []byte("same-input")

	enc1, _ := Encrypt(plaintext, key)
	enc2, _ := Encrypt(plaintext, key)

	if enc1 == enc2 {
		t.Error("same plaintext produced identical ciphertext (nonce not random)")
	}
}

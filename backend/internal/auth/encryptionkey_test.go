package auth

import (
	"errors"
	"os"
	"strings"
	"testing"
)

// The development key docker-compose.yml published until 2026-10-24. Here once,
// to prove the server refuses it; see publishedKeys.
const formerDevKey = "bcbb68dd891f7a97bf3370ff8800ab3eb3cc4226efbb09fcc519791cb8a76174" // gitleaks:allow

const someKey = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff"

func env(vars map[string]string) func(string) string {
	return func(k string) string { return vars[k] }
}

func files(contents map[string]string) func(string) ([]byte, error) {
	return func(p string) ([]byte, error) {
		if c, ok := contents[p]; ok {
			return []byte(c), nil
		}
		return nil, os.ErrNotExist
	}
}

func TestLoadEncryptionKey_RefusesThePublishedKey(t *testing.T) {
	for name, getenv := range map[string]func(string) string{
		"in ENCRYPTION_KEY":         env(map[string]string{"ENCRYPTION_KEY": formerDevKey}),
		"in upper case":             env(map[string]string{"ENCRYPTION_KEY": strings.ToUpper(formerDevKey)}),
		"in a file, with a newline": env(map[string]string{"ENCRYPTION_KEY_FILE": "/k"}),
	} {
		_, _, err := LoadEncryptionKey(getenv, files(map[string]string{"/k": formerDevKey + "\n"}))
		if !errors.Is(err, ErrPublishedKey) {
			t.Errorf("%s: err = %v, want ErrPublishedKey", name, err)
		}
	}
}

func TestLoadEncryptionKey_FromEitherPlace(t *testing.T) {
	key, source, err := LoadEncryptionKey(env(map[string]string{"ENCRYPTION_KEY": someKey}), files(nil))
	if err != nil || len(key) != 32 || source != "ENCRYPTION_KEY" {
		t.Errorf("from the environment: %d bytes from %q, %v", len(key), source, err)
	}

	key, source, err = LoadEncryptionKey(env(map[string]string{"ENCRYPTION_KEY_FILE": "/run/k"}), files(map[string]string{"/run/k": someKey + "\n"}))
	if err != nil || len(key) != 32 || !strings.Contains(source, "/run/k") {
		t.Errorf("from a file: %d bytes from %q, %v", len(key), source, err)
	}

	// The variable wins: production sets it, and a stray file must not
	// override what the operator wrote in .env.
	_, source, _ = LoadEncryptionKey(env(map[string]string{"ENCRYPTION_KEY": someKey, "ENCRYPTION_KEY_FILE": "/run/k"}), files(map[string]string{"/run/k": "ff"}))
	if source != "ENCRYPTION_KEY" {
		t.Errorf("both set: source %q, want ENCRYPTION_KEY", source)
	}
}

func TestLoadEncryptionKey_NoneIsNoError(t *testing.T) {
	key, _, err := LoadEncryptionKey(env(nil), files(nil))
	if key != nil || err != nil {
		t.Errorf("nothing set = %v, %v; want nil, nil", key, err)
	}
}

func TestLoadEncryptionKey_BadInputStops(t *testing.T) {
	if _, _, err := LoadEncryptionKey(env(map[string]string{"ENCRYPTION_KEY": "short"}), files(nil)); err == nil {
		t.Error("a short key was accepted")
	}
	if _, _, err := LoadEncryptionKey(env(map[string]string{"ENCRYPTION_KEY_FILE": "/missing"}), files(nil)); err == nil {
		t.Error("a missing key file was accepted")
	}
}

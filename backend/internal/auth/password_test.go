package auth

import (
	"testing"
)

func TestHashPassword(t *testing.T) {
	hash, err := HashPassword("test-password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}
	if hash == "" {
		t.Fatal("hash is empty")
	}
	if hash == "test-password" {
		t.Fatal("hash equals plaintext")
	}
}

func TestCheckPassword(t *testing.T) {
	hash, err := HashPassword("correct-password")
	if err != nil {
		t.Fatalf("HashPassword: %v", err)
	}

	tests := []struct {
		name  string
		plain string
		want  bool
	}{
		{name: "correct password", plain: "correct-password", want: true},
		{name: "wrong password", plain: "wrong-password", want: false},
		{name: "empty password", plain: "", want: false},
		{name: "similar password", plain: "correct-passwor", want: false},
		{name: "password with extra char", plain: "correct-password1", want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := CheckPassword(hash, tt.plain)
			if got != tt.want {
				t.Errorf("CheckPassword(%q) = %v, want %v", tt.plain, got, tt.want)
			}
		})
	}
}

func TestCheckPassword_InvalidHash(t *testing.T) {
	if CheckPassword("not-a-bcrypt-hash", "anything") {
		t.Error("expected false for invalid hash")
	}
	if CheckPassword("", "anything") {
		t.Error("expected false for empty hash")
	}
}

func TestHashPassword_DifferentHashesForSameInput(t *testing.T) {
	h1, _ := HashPassword("same-password")
	h2, _ := HashPassword("same-password")
	if h1 == h2 {
		t.Error("expected different hashes for same password (bcrypt uses random salt)")
	}
}

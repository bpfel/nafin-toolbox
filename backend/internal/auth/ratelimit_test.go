package auth

import (
	"net/http"
	"testing"
	"time"
)

func TestLoginRateLimiter_AllowsUnderLimit(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		if !rl.Allow("1.2.3.4") {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}
}

func TestLoginRateLimiter_BlocksOverLimit(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		rl.Allow("1.2.3.4")
	}

	if rl.Allow("1.2.3.4") {
		t.Fatal("4th attempt should be blocked")
	}
}

func TestLoginRateLimiter_DifferentKeysAreIndependent(t *testing.T) {
	rl := NewLoginRateLimiter(2, time.Minute)

	rl.Allow("1.1.1.1")
	rl.Allow("1.1.1.1")

	if rl.Allow("1.1.1.1") {
		t.Fatal("key 1.1.1.1 should be blocked")
	}

	if !rl.Allow("2.2.2.2") {
		t.Fatal("key 2.2.2.2 should be allowed")
	}
}

func TestLoginRateLimiter_ExpiresOldEntries(t *testing.T) {
	rl := NewLoginRateLimiter(2, 50*time.Millisecond)

	rl.Allow("ip")
	rl.Allow("ip")

	if rl.Allow("ip") {
		t.Fatal("should be blocked before window expires")
	}

	time.Sleep(60 * time.Millisecond)

	if !rl.Allow("ip") {
		t.Fatal("should be allowed after window expires")
	}
}

func TestClientIP_XRealIP(t *testing.T) {
	r, _ := http.NewRequest("GET", "/", nil)
	r.Header.Set("X-Real-IP", "10.0.0.1")
	r.RemoteAddr = "192.168.1.1:12345"

	if got := clientIP(r); got != "10.0.0.1" {
		t.Fatalf("expected 10.0.0.1, got %s", got)
	}
}

func TestClientIP_XForwardedFor(t *testing.T) {
	r, _ := http.NewRequest("GET", "/", nil)
	r.Header.Set("X-Forwarded-For", "10.0.0.1, 10.0.0.2")
	r.RemoteAddr = "192.168.1.1:12345"

	if got := clientIP(r); got != "10.0.0.1" {
		t.Fatalf("expected 10.0.0.1, got %s", got)
	}
}

func TestClientIP_XForwardedForSingle(t *testing.T) {
	r, _ := http.NewRequest("GET", "/", nil)
	r.Header.Set("X-Forwarded-For", "10.0.0.1")
	r.RemoteAddr = "192.168.1.1:12345"

	if got := clientIP(r); got != "10.0.0.1" {
		t.Fatalf("expected 10.0.0.1, got %s", got)
	}
}

func TestClientIP_RemoteAddr(t *testing.T) {
	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "192.168.1.1:12345"

	if got := clientIP(r); got != "192.168.1.1" {
		t.Fatalf("expected 192.168.1.1, got %s", got)
	}
}

func TestClientIP_RemoteAddrNoPort(t *testing.T) {
	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "192.168.1.1"

	if got := clientIP(r); got != "192.168.1.1" {
		t.Fatalf("expected 192.168.1.1, got %s", got)
	}
}

package auth

import (
	"net/http"
	"testing"
	"time"
)

func TestLoginRateLimiter_AllowsUnderLimit(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		r := newRequestWithRemote("1.2.3.4:12345")
		if !rl.Allow(r) {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}
}

func TestLoginRateLimiter_BlocksOverLimit(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		rl.Allow(newRequestWithRemote("1.2.3.4:12345"))
	}

	if rl.Allow(newRequestWithRemote("1.2.3.4:12345")) {
		t.Fatal("4th attempt should be blocked")
	}
}

func TestLoginRateLimiter_DifferentKeysAreIndependent(t *testing.T) {
	rl := NewLoginRateLimiter(2, time.Minute)

	rl.Allow(newRequestWithRemote("1.1.1.1:1"))
	rl.Allow(newRequestWithRemote("1.1.1.1:2"))

	if rl.Allow(newRequestWithRemote("1.1.1.1:3")) {
		t.Fatal("key 1.1.1.1 should be blocked")
	}

	if !rl.Allow(newRequestWithRemote("2.2.2.2:1")) {
		t.Fatal("key 2.2.2.2 should be allowed")
	}
}

func TestLoginRateLimiter_ExpiresOldEntries(t *testing.T) {
	rl := NewLoginRateLimiter(2, 50*time.Millisecond)

	rl.Allow(newRequestWithRemote("1.1.1.1:1"))
	rl.Allow(newRequestWithRemote("1.1.1.1:2"))

	if rl.Allow(newRequestWithRemote("1.1.1.1:3")) {
		t.Fatal("should be blocked before window expires")
	}

	time.Sleep(60 * time.Millisecond)

	if !rl.Allow(newRequestWithRemote("1.1.1.1:4")) {
		t.Fatal("should be allowed after window expires")
	}
}

func TestClientIP_TrustedProxy_XRealIP(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	rl.SetTrustedProxies([]string{"172.16.0.0/12"})

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.3:12345"
	r.Header.Set("X-Real-IP", "10.0.0.1")

	if got := rl.ClientIP(r); got != "10.0.0.1" {
		t.Fatalf("expected 10.0.0.1, got %s", got)
	}
}

func TestClientIP_TrustedProxy_XForwardedFor(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	rl.SetTrustedProxies([]string{"172.16.0.0/12"})

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.3:12345"
	r.Header.Set("X-Forwarded-For", "203.0.113.50, 172.18.0.1")

	if got := rl.ClientIP(r); got != "203.0.113.50" {
		t.Fatalf("expected 203.0.113.50, got %s", got)
	}
}

func TestClientIP_UntrustedProxy_IgnoresHeaders(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	rl.SetTrustedProxies([]string{"172.16.0.0/12"})

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "1.2.3.4:12345"
	r.Header.Set("X-Real-IP", "10.0.0.1")
	r.Header.Set("X-Forwarded-For", "10.0.0.1")

	if got := rl.ClientIP(r); got != "1.2.3.4" {
		t.Fatalf("expected 1.2.3.4 (remote addr), got %s", got)
	}
}

func TestClientIP_NoTrustedProxies_UsesRemoteAddr(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	// No trusted proxies set

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "192.168.1.1:12345"
	r.Header.Set("X-Real-IP", "10.0.0.1")

	if got := rl.ClientIP(r); got != "192.168.1.1" {
		t.Fatalf("expected 192.168.1.1, got %s", got)
	}
}

func TestClientIP_RemoteAddrNoPort(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "192.168.1.1"

	if got := rl.ClientIP(r); got != "192.168.1.1" {
		t.Fatalf("expected 192.168.1.1, got %s", got)
	}
}

func TestAllowKey_RateLimitsByKey(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		if !rl.AllowKey("user@example.com") {
			t.Fatalf("attempt %d should be allowed", i+1)
		}
	}

	if rl.AllowKey("user@example.com") {
		t.Fatal("4th attempt for same email should be blocked")
	}

	// Different email should still be allowed
	if !rl.AllowKey("other@example.com") {
		t.Fatal("different email should be allowed")
	}
}

func newRequestWithRemote(addr string) *http.Request {
	r, _ := http.NewRequest("POST", "/api/auth/login", nil)
	r.RemoteAddr = addr
	return r
}

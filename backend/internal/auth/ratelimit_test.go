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

func TestClientIP_TrustedProxy_XRealIPWithoutForwardedFor(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	rl.SetTrustedProxies([]string{"172.16.0.0/12"})

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.3:12345"
	r.Header.Set("X-Real-IP", "10.0.0.1")

	if got := rl.ClientIP(r); got != "10.0.0.1" {
		t.Fatalf("expected 10.0.0.1, got %s", got)
	}
}

// The production chain: an outer proxy, then the frontend's nginx, which sets
// X-Real-IP to the outer proxy's address. Read first, that made every visitor
// one client, and five wrong passwords on any account locked out all of them.
func TestClientIP_BehindTwoProxies_IsTheClient(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	rl.SetTrustedProxies([]string{"172.16.0.0/12"})

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.3:12345"
	r.Header.Set("X-Real-IP", "172.18.0.1")
	r.Header.Set("X-Forwarded-For", "203.0.113.50, 172.18.0.1")

	if got := rl.ClientIP(r); got != "203.0.113.50" {
		t.Fatalf("expected 203.0.113.50, got %s", got)
	}
}

// The leftmost entry is whatever the client sent. Trusting it would let a
// client name a fresh address with every attempt and never be limited.
func TestClientIP_SpoofedForwardedFor_IsIgnored(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	rl.SetTrustedProxies([]string{"172.16.0.0/12"})

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.3:12345"
	r.Header.Set("X-Forwarded-For", "1.1.1.1, 203.0.113.50, 172.18.0.1")

	if got := rl.ClientIP(r); got != "203.0.113.50" {
		t.Fatalf("expected 203.0.113.50, got %s", got)
	}
}

// Tailscale serve on a NAS: the tailnet address is not in the private ranges,
// so it is the client.
func TestClientIP_TailscaleServe_IsTheTailnetAddress(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	rl.SetTrustedProxies([]string{"172.16.0.0/12", "192.168.0.0/16", "10.0.0.0/8"})

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.19.0.3:12345"
	r.Header.Set("X-Real-IP", "172.19.0.1")
	r.Header.Set("X-Forwarded-For", "100.120.205.42, 172.19.0.1")

	if got := rl.ClientIP(r); got != "100.120.205.42" {
		t.Fatalf("expected 100.120.205.42, got %s", got)
	}
}

func TestClientIP_TrustedAllTheWay_IsTheLeftmost(t *testing.T) {
	rl := NewLoginRateLimiter(10, time.Minute)
	rl.SetTrustedProxies([]string{"172.16.0.0/12", "192.168.0.0/16"})

	r, _ := http.NewRequest("GET", "/", nil)
	r.RemoteAddr = "172.18.0.3:12345"
	r.Header.Set("X-Forwarded-For", "192.168.1.20, 172.18.0.1")

	if got := rl.ClientIP(r); got != "192.168.1.20" {
		t.Fatalf("expected 192.168.1.20, got %s", got)
	}
}

func TestForget_ClearsOneKeyOnly(t *testing.T) {
	rl := NewLoginRateLimiter(1, time.Minute)
	rl.RecordFailureKey("a")
	rl.RecordFailureKey("b")

	rl.Forget("a")

	if !rl.CheckKey("a") {
		t.Error("a should be clear after Forget")
	}
	if rl.CheckKey("b") {
		t.Error("b should still be at its limit")
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

func newRequestWithRemote(addr string) *http.Request {
	r, _ := http.NewRequest("POST", "/api/auth/login", nil)
	r.RemoteAddr = addr
	return r
}

// --- Check() and RecordFailure() tests ---

// TestCheck_ReturnsTrueWhenUnderLimit tests that Check() returns true when under the limit
// and does NOT record an attempt
func TestCheck_ReturnsTrueWhenUnderLimit(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	r := newRequestWithRemote("10.0.0.1:12345")

	// First check should return true
	if !rl.Check(r) {
		t.Fatal("Check() should return true when no attempts recorded")
	}

	// Verify Check() didn't consume the limit by checking again
	if !rl.Check(r) {
		t.Fatal("Check() should not record an attempt")
	}

	// Verify we can still make 3 actual attempts via Allow()
	for i := 0; i < 3; i++ {
		if !rl.Allow(r) {
			t.Fatalf("Allow() attempt %d should succeed (Check didn't consume limit)", i+1)
		}
	}

	// Now 4th should fail
	if rl.Allow(r) {
		t.Fatal("Allow() attempt 4 should fail (limit=3)")
	}
}

// TestCheck_ReturnsFalseWhenAtLimit tests that Check() returns false when at the limit
func TestCheck_ReturnsFalseWhenAtLimit(t *testing.T) {
	rl := NewLoginRateLimiter(2, time.Minute)

	r := newRequestWithRemote("10.0.0.2:12345")

	// Record 2 attempts (reaching limit)
	rl.Allow(r)
	rl.Allow(r)

	// Check should now return false
	if rl.Check(r) {
		t.Fatal("Check() should return false when at limit")
	}

	// Verify we can't make another attempt
	if rl.Allow(r) {
		t.Fatal("Allow() should fail when at limit")
	}
}

// TestCheck_ReturnsFalseWhenOverLimit tests that Check() returns false when already over limit
func TestCheck_ReturnsFalseWhenOverLimit(t *testing.T) {
	rl := NewLoginRateLimiter(1, time.Minute)

	r := newRequestWithRemote("10.0.0.3:12345")

	// Record attempt (at limit)
	rl.Allow(r)

	// Check should return false
	if rl.Check(r) {
		t.Fatal("Check() should return false when at limit")
	}

	// Record another failure via RecordFailure (now over limit conceptually)
	rl.RecordFailure(r)

	// Check should still return false
	if rl.Check(r) {
		t.Fatal("Check() should return false when over limit")
	}
}

// TestRecordFailure_RecordsAttempt tests that RecordFailure() records a failed attempt
func TestRecordFailure_RecordsAttempt(t *testing.T) {
	rl := NewLoginRateLimiter(2, time.Minute)

	r := newRequestWithRemote("10.0.0.4:12345")

	// Before recording, should be under limit
	if !rl.Check(r) {
		t.Fatal("Check() should return true initially")
	}

	// Record a failure
	rl.RecordFailure(r)

	// Still under limit (1 of 2)
	if !rl.Check(r) {
		t.Fatal("Check() should return true after 1 failure (limit=2)")
	}

	// Record another failure
	rl.RecordFailure(r)

	// Now at limit (2 of 2)
	if rl.Check(r) {
		t.Fatal("Check() should return false after 2 failures (limit=2)")
	}
}

// TestRecordFailure_DoesNotAllowMoreAttempts tests that RecordFailure prevents future Allow()
func TestRecordFailure_DoesNotAllowMoreAttempts(t *testing.T) {
	rl := NewLoginRateLimiter(1, time.Minute)

	r := newRequestWithRemote("10.0.0.5:12345")

	// Record failure
	rl.RecordFailure(r)

	// Should be at limit
	if rl.Allow(r) {
		t.Fatal("Allow() should fail after RecordFailure() reaches limit")
	}
}

// TestCheckAndRecordFailure_Interaction tests the interaction between Check() and RecordFailure()
func TestCheckAndRecordFailure_Interaction(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	r := newRequestWithRemote("10.0.0.6:12345")

	// Scenario: Check before each login attempt, RecordFailure on failure

	// Attempt 1
	if !rl.Check(r) {
		t.Fatal("Check() should pass for attempt 1")
	}
	rl.RecordFailure(r) // Login failed

	// Attempt 2
	if !rl.Check(r) {
		t.Fatal("Check() should pass for attempt 2 (1 failure recorded)")
	}
	rl.RecordFailure(r) // Login failed

	// Attempt 3
	if !rl.Check(r) {
		t.Fatal("Check() should pass for attempt 3 (2 failures recorded)")
	}
	rl.RecordFailure(r) // Login failed

	// Attempt 4 - should be blocked
	if rl.Check(r) {
		t.Fatal("Check() should fail for attempt 4 (3 failures recorded, limit=3)")
	}
	// RecordFailure not called because Check() returned false (pre-check pattern)
}

// TestCheckAndAllow_Difference tests that Check() doesn't consume but Allow() does
func TestCheckAndAllow_Difference(t *testing.T) {
	rl := NewLoginRateLimiter(2, time.Minute)

	r := newRequestWithRemote("10.0.0.7:12345")

	// Multiple Check() calls don't consume limit
	for i := 0; i < 10; i++ {
		if !rl.Check(r) {
			t.Fatalf("Check() call %d should not consume limit", i+1)
		}
	}

	// But Allow() does consume
	if !rl.Allow(r) {
		t.Fatal("Allow() attempt 1 should succeed")
	}
	if !rl.Allow(r) {
		t.Fatal("Allow() attempt 2 should succeed")
	}
	if rl.Allow(r) {
		t.Fatal("Allow() attempt 3 should fail (limit=2)")
	}

	// Check() should now return false
	if rl.Check(r) {
		t.Fatal("Check() should return false after Allow() consumed limit")
	}
}

// TestRecordFailure_PrunesExpiredEntries tests that RecordFailure prunes old attempts
func TestRecordFailure_PrunesExpiredEntries(t *testing.T) {
	rl := NewLoginRateLimiter(2, 50*time.Millisecond)

	r := newRequestWithRemote("10.0.0.8:12345")

	// Record 2 failures
	rl.RecordFailure(r)
	rl.RecordFailure(r)

	// Should be at limit
	if rl.Check(r) {
		t.Fatal("Check() should return false immediately after 2 failures")
	}

	// Wait for window to expire
	time.Sleep(60 * time.Millisecond)

	// Should be allowed again
	if !rl.Check(r) {
		t.Fatal("Check() should return true after window expires")
	}

	// RecordFailure should have pruned old entries
	rl.RecordFailure(r)
	if !rl.Check(r) {
		t.Fatal("Check() should return true after RecordFailure pruned old entries")
	}
}

// TestCheck_ConcurrentSafety tests that Check() is safe to call concurrently
func TestCheck_ConcurrentSafety(t *testing.T) {
	rl := NewLoginRateLimiter(100, time.Minute)

	r := newRequestWithRemote("10.0.0.9:12345")

	// Launch multiple goroutines calling Check()
	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 100; j++ {
				rl.Check(r)
			}
			done <- true
		}()
	}

	// Wait for all goroutines
	for i := 0; i < 10; i++ {
		<-done
	}

	// Check() calls shouldn't have consumed limit
	if !rl.Check(r) {
		t.Fatal("Check() calls should not consume limit even under concurrent access")
	}
}

// TestRecordFailure_ConcurrentSafety tests that RecordFailure() is safe to call concurrently
func TestRecordFailure_ConcurrentSafety(t *testing.T) {
	rl := NewLoginRateLimiter(100, time.Minute)

	r := newRequestWithRemote("10.0.0.10:12345")

	// Launch 10 goroutines each calling RecordFailure 10 times = 100 total
	done := make(chan bool)
	for i := 0; i < 10; i++ {
		go func() {
			for j := 0; j < 10; j++ {
				rl.RecordFailure(r)
			}
			done <- true
		}()
	}

	for i := 0; i < 10; i++ {
		<-done
	}

	// Should have recorded 100 failures — at the limit, so Check returns false
	if rl.Check(r) {
		t.Fatal("RecordFailure() should have recorded all 100 concurrent calls")
	}
}

// TestCheck_EmptyKey tests that Check() handles empty client IP gracefully
func TestCheck_EmptyKey(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	r := newRequestWithRemote("")

	// Should not panic and should return true initially
	if !rl.Check(r) {
		t.Fatal("Check() with empty RemoteAddr should return true initially")
	}
}

// TestRecordFailure_EmptyKey tests that RecordFailure() handles empty client IP gracefully
func TestRecordFailure_EmptyKey(t *testing.T) {
	rl := NewLoginRateLimiter(1, time.Minute)

	r := newRequestWithRemote("")

	// Should not panic
	rl.RecordFailure(r)

	// Check should return false after reaching limit
	if rl.Check(r) {
		t.Fatal("Check() should return false after RecordFailure() with empty key")
	}
}

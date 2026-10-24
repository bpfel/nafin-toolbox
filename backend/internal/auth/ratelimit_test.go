package auth

import (
	"net/http"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
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

// --- Reserve and Release ---

func TestReserve_RefusesOnceTheWindowIsFull(t *testing.T) {
	rl := NewLoginRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		if _, ok := rl.Reserve("k"); !ok {
			t.Fatalf("attempt %d should be reserved", i+1)
		}
	}
	if _, ok := rl.Reserve("k"); ok {
		t.Fatal("attempt 4 should be refused (limit=3)")
	}
}

// The reason Reserve exists. Check-then-RecordFailure let every request that
// arrived before the first failure was recorded through; here five hundred
// arrive together and exactly the limit get past.
func TestReserve_ParallelBurstGetsOnlyTheLimit(t *testing.T) {
	rl := NewLoginRateLimiter(5, time.Minute)

	var wg sync.WaitGroup
	var granted atomic.Int32
	start := make(chan struct{})
	for i := 0; i < 500; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			if _, ok := rl.Reserve("victim@example.com"); ok {
				granted.Add(1)
			}
		}()
	}
	close(start)
	wg.Wait()

	if got := granted.Load(); got != 5 {
		t.Fatalf("granted %d of 500 parallel attempts, want 5", got)
	}
}

func TestRelease_GivesBackThisAttemptOnly(t *testing.T) {
	rl := NewLoginRateLimiter(2, time.Minute)

	failed, _ := rl.Reserve("k")
	_ = failed // a wrong password: kept
	right, _ := rl.Reserve("k")
	right.Release()

	if _, ok := rl.Reserve("k"); !ok {
		t.Fatal("the released attempt should have freed a place")
	}
	if _, ok := rl.Reserve("k"); ok {
		t.Fatal("the failure beside it should still count")
	}
}

func TestRelease_TwiceOrZeroDoesNothing(t *testing.T) {
	rl := NewLoginRateLimiter(2, time.Minute)

	a, _ := rl.Reserve("k")
	rl.Reserve("k")
	a.Release()
	a.Release()
	Reservation{}.Release()

	rl.Reserve("k")
	if _, ok := rl.Reserve("k"); ok {
		t.Fatal("a second Release must not give back an attempt it did not take")
	}
}

func TestReserveAll_TakesNoneWhenOneIsFull(t *testing.T) {
	roomy := NewLoginRateLimiter(5, time.Minute)
	full := NewLoginRateLimiter(1, time.Minute)
	full.Reserve("k")

	if _, ok := ReserveAll(Slot{roomy, "k"}, Slot{full, "k"}); ok {
		t.Fatal("should be refused: the second slot is full")
	}
	for i := 0; i < 5; i++ {
		if _, ok := roomy.Reserve("k"); !ok {
			t.Fatalf("the refused request should not count against the first slot (attempt %d)", i+1)
		}
	}
}

func TestReserveAll_ReleaseGivesBackEvery(t *testing.T) {
	a := NewLoginRateLimiter(1, time.Minute)
	b := NewLoginRateLimiter(1, time.Minute)

	taken, ok := ReserveAll(Slot{a, "k"}, Slot{b, "k"})
	if !ok {
		t.Fatal("both slots are empty")
	}
	taken.Release()

	if _, ok := ReserveAll(Slot{a, "k"}, Slot{b, "k"}); !ok {
		t.Fatal("both slots should be free again")
	}
}

func TestReserve_ExpiredAttemptsStopCounting(t *testing.T) {
	rl := NewLoginRateLimiter(2, 50*time.Millisecond)
	rl.Reserve("k")
	rl.Reserve("k")

	time.Sleep(60 * time.Millisecond)

	if _, ok := rl.Reserve("k"); !ok {
		t.Fatal("should be reserved after the window has passed")
	}
}

func TestForget_ClearsOneKeyOnly(t *testing.T) {
	rl := NewLoginRateLimiter(1, time.Minute)
	rl.Reserve("a")
	rl.Reserve("b")

	rl.Forget("a")

	if _, ok := rl.Reserve("a"); !ok {
		t.Error("a should be clear after Forget")
	}
	if _, ok := rl.Reserve("b"); ok {
		t.Error("b should still be at its limit")
	}
}

func TestReserve_EmptyKey(t *testing.T) {
	rl := NewLoginRateLimiter(1, time.Minute)

	if _, ok := rl.Reserve(""); !ok {
		t.Fatal("an empty key is a key like any other")
	}
	if _, ok := rl.Reserve(""); ok {
		t.Fatal("and is limited like any other")
	}
}

// --- What an administrator sees and clears ---

func TestLockouts_ListsOnlyFullKeys(t *testing.T) {
	rl := NewLoginRateLimiter(2, time.Minute)
	rl.Reserve("full")
	first := time.Now()
	rl.Reserve("full")
	rl.Reserve("half")

	got := rl.Lockouts()
	if len(got) != 1 || got[0].Key != "full" || got[0].Attempts != 2 {
		t.Fatalf("Lockouts() = %+v, want only full with 2 attempts", got)
	}
	// Until is when the oldest attempt leaves the window.
	if d := got[0].Until.Sub(first.Add(time.Minute)); d > time.Second || d < -time.Second {
		t.Errorf("Until = %v, want about %v", got[0].Until, first.Add(time.Minute))
	}
}

func TestForgetWhere_ClearsWhatMatches(t *testing.T) {
	rl := NewLoginRateLimiter(1, time.Minute)
	rl.Reserve("1.2.3.4|anna@example.ch")
	rl.Reserve("5.6.7.8|anna@example.ch")
	rl.Reserve("1.2.3.4|ben@example.ch")

	if n := rl.ForgetWhere(func(k string) bool { return strings.HasSuffix(k, "|anna@example.ch") }); n != 2 {
		t.Fatalf("cleared %d, want 2", n)
	}
	if _, ok := rl.Reserve("5.6.7.8|anna@example.ch"); !ok {
		t.Error("anna should be clear")
	}
	if _, ok := rl.Reserve("1.2.3.4|ben@example.ch"); ok {
		t.Error("ben should still be locked out")
	}
}

// A key tried once used to stay for good, so cycling through addresses grew
// the map without end.
func TestSweep_DropsKeysWithNothingInTheirWindow(t *testing.T) {
	rl := NewLoginRateLimiter(5, 20*time.Millisecond)
	for i := 0; i < 1000; i++ {
		rl.Reserve("address" + strconv.Itoa(i) + "@example.ch")
	}
	time.Sleep(30 * time.Millisecond)
	rl.Reserve("one-more@example.ch")

	rl.mu.Lock()
	defer rl.mu.Unlock()
	if n := len(rl.attempts); n != 1 {
		t.Errorf("%d keys kept after their window passed, want 1", n)
	}
}

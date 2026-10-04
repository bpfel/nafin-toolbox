package auth

import (
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// LoginRateLimiter tracks login attempts per IP using an in-memory sliding window.
type LoginRateLimiter struct {
	mu             sync.Mutex
	attempts       map[string][]time.Time
	max            int
	window         time.Duration
	trustedProxies []*net.IPNet
}

func NewLoginRateLimiter(max int, window time.Duration) *LoginRateLimiter {
	return &LoginRateLimiter{
		attempts: make(map[string][]time.Time),
		max:      max,
		window:   window,
	}
}

// SetTrustedProxies configures CIDR ranges whose X-Forwarded-For / X-Real-IP
// headers will be trusted. If empty, only RemoteAddr is used.
func (rl *LoginRateLimiter) SetTrustedProxies(cidrs []string) {
	rl.trustedProxies = parseCIDRs(cidrs)
}

// Allow records an attempt for the request's client IP and returns true if under the limit.
func (rl *LoginRateLimiter) Allow(r *http.Request) bool {
	key := rl.ClientIP(r)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	pruned := rl.recent(key, time.Now())
	if len(pruned) >= rl.max {
		rl.attempts[key] = pruned
		return false
	}

	rl.attempts[key] = append(pruned, time.Now())
	return true
}

// Check returns true if under the limit without recording an attempt.
func (rl *LoginRateLimiter) Check(r *http.Request) bool {
	return rl.CheckKey(rl.ClientIP(r))
}

// RecordFailure records a failed attempt for the request's client IP.
func (rl *LoginRateLimiter) RecordFailure(r *http.Request) {
	rl.RecordFailureKey(rl.ClientIP(r))
}

// CheckKey is Check for a key the caller builds — a client and an account
// together, for one.
func (rl *LoginRateLimiter) CheckKey(key string) bool {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	return len(rl.recent(key, time.Now())) < rl.max
}

// RecordFailureKey is RecordFailure for a key the caller builds.
func (rl *LoginRateLimiter) RecordFailureKey(key string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rl.attempts[key] = append(rl.recent(key, now), now)
}

// Forget clears a key's attempts: the right password ends the run of wrong
// ones before it, rather than leaving them to count against the next typo.
func (rl *LoginRateLimiter) Forget(key string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	delete(rl.attempts, key)
}

// recent prunes a key's attempts to those inside the window. Callers hold mu.
func (rl *LoginRateLimiter) recent(key string, now time.Time) []time.Time {
	cutoff := now.Add(-rl.window)
	existing := rl.attempts[key]
	pruned := existing[:0]
	for _, t := range existing {
		if t.After(cutoff) {
			pruned = append(pruned, t)
		}
	}
	return pruned
}

// ClientIP is the address of whoever sent the request, as far as the
// trusted proxies in front of the API can vouch for it.
func (rl *LoginRateLimiter) ClientIP(r *http.Request) string {
	return clientIP(r, rl.trustedProxies)
}

// clientIP walks the forwarding chain from the API outwards and stops at the
// first address no trusted proxy stands for.
//
// A request reaches the API through at least the frontend's nginx, and in
// production through another proxy in front of that. Each appends the address
// it was talked to by to X-Forwarded-For, so the chain reads, left to right:
// client, outer proxy, nginx — and RemoteAddr is nginx itself. Walking from
// the right and skipping every trusted hop lands on the client.
//
// It used to prefer X-Real-IP, which nginx sets to its own $remote_addr: the
// outer proxy's address, the same for every visitor. Every failed sign-in on
// an instance counted against one bucket, so five wrong passwords on one
// account locked every account out, from every device.
//
// Nor is the leftmost entry the answer, although it usually holds the client:
// it is whatever the client sent, and a client that sends a fresh one with
// every attempt is never limited at all.
//
// X-Real-IP is still read when there is no X-Forwarded-For, from a proxy that
// sets only that.
func clientIP(r *http.Request, trusted []*net.IPNet) string {
	addr := remoteAddrIP(r.RemoteAddr)
	if !isTrusted(addr, trusted) {
		return addr
	}

	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded == "" {
		if ip := strings.TrimSpace(r.Header.Get("X-Real-IP")); ip != "" {
			return ip
		}
		return addr
	}

	hops := strings.Split(forwarded, ",")
	for i := len(hops) - 1; i >= 0; i-- {
		hop := strings.TrimSpace(hops[i])
		if hop == "" {
			continue
		}
		addr = hop
		if !isTrusted(hop, trusted) {
			return hop
		}
	}
	// Trusted all the way: the leftmost is as far out as anyone can see.
	return addr
}

// parseCIDRs turns TRUSTED_PROXIES entries into networks, skipping any that
// do not parse.
func parseCIDRs(cidrs []string) []*net.IPNet {
	var nets []*net.IPNet
	for _, cidr := range cidrs {
		_, n, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		nets = append(nets, n)
	}
	return nets
}

func isTrusted(ip string, trusted []*net.IPNet) bool {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	for _, n := range trusted {
		if n.Contains(parsed) {
			return true
		}
	}
	return false
}

func remoteAddrIP(addr string) string {
	host, _, err := net.SplitHostPort(addr)
	if err != nil {
		return addr
	}
	return host
}

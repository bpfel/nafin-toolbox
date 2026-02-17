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
	var nets []*net.IPNet
	for _, cidr := range cidrs {
		_, n, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		nets = append(nets, n)
	}
	rl.trustedProxies = nets
}

// Allow records an attempt for the request's client IP and returns true if under the limit.
func (rl *LoginRateLimiter) Allow(r *http.Request) bool {
	key := rl.ClientIP(r)

	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	cutoff := now.Add(-rl.window)

	// Prune expired entries
	existing := rl.attempts[key]
	pruned := existing[:0]
	for _, t := range existing {
		if t.After(cutoff) {
			pruned = append(pruned, t)
		}
	}

	if len(pruned) >= rl.max {
		rl.attempts[key] = pruned
		return false
	}

	rl.attempts[key] = append(pruned, now)
	return true
}

// ClientIP extracts the client IP from the request.
// Proxy headers (X-Real-IP, X-Forwarded-For) are only trusted when
// RemoteAddr is in the configured trusted proxy CIDR ranges.
func (rl *LoginRateLimiter) ClientIP(r *http.Request) string {
	remoteIP := remoteAddrIP(r.RemoteAddr)

	if rl.isTrustedProxy(remoteIP) {
		if ip := r.Header.Get("X-Real-IP"); ip != "" {
			return ip
		}
		if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
			// Take the first IP (original client)
			if i := strings.IndexByte(forwarded, ','); i > 0 {
				return strings.TrimSpace(forwarded[:i])
			}
			return strings.TrimSpace(forwarded)
		}
	}

	return remoteIP
}

func (rl *LoginRateLimiter) isTrustedProxy(ip string) bool {
	if len(rl.trustedProxies) == 0 {
		return false
	}
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return false
	}
	for _, n := range rl.trustedProxies {
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

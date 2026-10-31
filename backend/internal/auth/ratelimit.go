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
	// When every key was last pruned. See sweep.
	swept time.Time
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

	now := time.Now()
	rl.sweep(now)
	pruned := rl.recent(key, now)
	if len(pruned) >= rl.max {
		rl.attempts[key] = pruned
		return false
	}

	rl.attempts[key] = append(pruned, now)
	return true
}

// Forget clears a key's attempts: the right password ends the run of wrong
// ones before it, rather than leaving them to count against the next typo.
func (rl *LoginRateLimiter) Forget(key string) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	delete(rl.attempts, key)
}

// Reservation is one attempt counted against a key before it was made.
type Reservation struct {
	rl  *LoginRateLimiter
	key string
	at  time.Time
}

// Reserve counts an attempt for key before the work it guards is done, and
// refuses when the window is already full.
//
// Check-then-RecordFailure, which the sign-in handlers used before, counted a
// failure only once a bcrypt comparison had finished, a quarter of a second
// later. Every request that arrived in that quarter second had passed the
// check: five hundred parallel guesses at one password all got through a
// limit of five. A reservation is taken under the same lock as the check, so
// the sixth request is refused however close behind the fifth it comes.
//
// An attempt that turns out not to be a failure — the right password — is
// given back with Release.
func (rl *LoginRateLimiter) Reserve(key string) (Reservation, bool) {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	rl.sweep(now)
	pruned := rl.recent(key, now)
	if len(pruned) >= rl.max {
		rl.attempts[key] = pruned
		return Reservation{}, false
	}
	rl.attempts[key] = append(pruned, now)
	return Reservation{rl: rl, key: key, at: now}, true
}

// Release gives back an attempt that did not fail. It removes this attempt
// only: failures recorded beside it, by this client or another, still count.
// Releasing the zero Reservation, or one already released, does nothing.
func (r Reservation) Release() {
	if r.rl == nil {
		return
	}
	r.rl.mu.Lock()
	defer r.rl.mu.Unlock()

	existing := r.rl.attempts[r.key]
	for i, t := range existing {
		if t.Equal(r.at) {
			r.rl.attempts[r.key] = append(existing[:i], existing[i+1:]...)
			return
		}
	}
}

// Reservations are attempts taken together, against several limiters.
type Reservations []Reservation

// Release gives every one of them back.
func (rs Reservations) Release() {
	for _, r := range rs {
		r.Release()
	}
}

// Slot names one key in one limiter, for ReserveAll.
type Slot struct {
	Limiter *LoginRateLimiter
	Key     string
}

// ReserveAll reserves an attempt in every slot, or in none: when one is full,
// those already taken are given back, so a refused request does not count
// against the limits it was never measured by.
func ReserveAll(slots ...Slot) (Reservations, bool) {
	taken := make(Reservations, 0, len(slots))
	for _, s := range slots {
		r, ok := s.Limiter.Reserve(s.Key)
		if !ok {
			taken.Release()
			return nil, false
		}
		taken = append(taken, r)
	}
	return taken, true
}

// sweep drops every key with nothing left in its window, at most once a
// window. Callers hold mu.
//
// A key used to be pruned only when it was tried again, so a key tried once
// stayed for good. Somebody cycling through a million addresses, or a million
// forged clients, filled the map with a million keys nobody would touch again
// — a way to run the server out of memory with sign-in attempts alone.
func (rl *LoginRateLimiter) sweep(now time.Time) {
	if now.Sub(rl.swept) < rl.window {
		return
	}
	rl.swept = now
	for key := range rl.attempts {
		if pruned := rl.recent(key, now); len(pruned) == 0 {
			delete(rl.attempts, key)
		} else {
			rl.attempts[key] = pruned
		}
	}
}

// Lockout is a key whose window is full: the next attempt will be refused.
type Lockout struct {
	Key      string
	Attempts int
	// When the oldest attempt leaves the window, and one more is allowed.
	Until time.Time
}

// Lockouts lists the keys that are refused right now, for an administrator
// deciding whether somebody is being kept out on purpose.
func (rl *LoginRateLimiter) Lockouts() []Lockout {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	now := time.Now()
	var out []Lockout
	for key := range rl.attempts {
		pruned := rl.recent(key, now)
		rl.attempts[key] = pruned
		if len(pruned) >= rl.max {
			out = append(out, Lockout{Key: key, Attempts: len(pruned), Until: pruned[0].Add(rl.window)})
		}
	}
	return out
}

// ForgetWhere clears every key match accepts, and reports how many it cleared.
func (rl *LoginRateLimiter) ForgetWhere(match func(key string) bool) int {
	rl.mu.Lock()
	defer rl.mu.Unlock()

	n := 0
	for key := range rl.attempts {
		if match(key) {
			delete(rl.attempts, key)
			n++
		}
	}
	return n
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

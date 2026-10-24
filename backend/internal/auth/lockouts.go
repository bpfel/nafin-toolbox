package auth

import (
	"encoding/json"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
)

// The limits an administrator can see and clear, by the name the Audit screen
// shows them under. Setup is left out: it is closed for good once there is an
// account, and the upkeep reminder limits a button only an admin can press.
//
// Every one of these lives in memory. Restarting the API clears them all,
// which is the blunt version of what this does one key at a time.
func (deps *HandlerDeps) lockoutLimiters() map[string]*LoginRateLimiter {
	return map[string]*LoginRateLimiter{
		// Keyed by email: thirty misses an hour, from anywhere. The one a
		// deliberate lockout fills, and the one most likely to want clearing.
		"address": deps.LoginEmailLimiter,
		// Keyed by client address: misses across any accounts.
		"client": deps.LoginLimiter,
		// Keyed "client|email": one device's misses at one account.
		"client_address": deps.LoginAccountLimiter,
		// Keyed by user id: wrong 2FA codes, and wrong passwords behind a
		// session.
		"two_factor":     deps.Verify2FAUserLimiter,
		"password_check": deps.PasswordCheckLimiter,
		// Keyed by client address: wrong 2FA codes, and invitation links that
		// do not exist.
		"two_factor_client": deps.Verify2FALimiter,
		"verification":      deps.VerifyEmailLimiter,
		// Keyed by device: failures from a browser that signed in before.
		"device": deps.DeviceLimiter,
	}
}

// LockoutEntry is one refused key, as the Audit screen lists it.
type LockoutEntry struct {
	Kind     string    `json:"kind"`
	Key      string    `json:"key"`
	Attempts int       `json:"attempts"`
	Until    time.Time `json:"until"`
	// For the kinds keyed by user id, whose address that is — an id means
	// nothing to the person reading the list.
	Email string `json:"email,omitempty"`
}

// HandleListLockouts lists every key that is being refused right now.
func HandleListLockouts(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !adminOnly(w, deps, UserFromContext(r.Context())) {
			return
		}

		entries := []LockoutEntry{}
		for kind, limiter := range deps.lockoutLimiters() {
			if limiter == nil {
				continue
			}
			for _, l := range limiter.Lockouts() {
				e := LockoutEntry{Kind: kind, Key: l.Key, Attempts: l.Attempts, Until: l.Until}
				if kind == "two_factor" || kind == "password_check" {
					if id, err := strconv.Atoi(l.Key); err == nil {
						if u, err := deps.Store.GetUserByID(r.Context(), id); err == nil && u != nil {
							e.Email = u.Email
						}
					}
				}
				entries = append(entries, e)
			}
		}
		// Soonest to lapse last: the ones that will still be there in an hour
		// are the ones worth reading first.
		sort.Slice(entries, func(i, j int) bool { return entries[i].Until.After(entries[j].Until) })

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"lockouts": entries})
	}
}

// ClearLockoutsRequest names what to clear: one key of one kind, or every
// lockout there is.
type ClearLockoutsRequest struct {
	Kind string `json:"kind"`
	Key  string `json:"key"`
	All  bool   `json:"all"`
}

// HandleClearLockouts lets an administrator let somebody back in before their
// window runs out — someone whose address is being guessed at on purpose, for
// one.
//
// Clearing an address clears that address's per-device counts too, so the
// person can sign in from wherever they are rather than only from a device that
// never tried. Every clearing is written to the audit log.
func HandleClearLockouts(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !adminOnly(w, deps, caller) {
			return
		}

		var req ClearLockoutsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		limiters := deps.lockoutLimiters()
		cleared := 0
		switch {
		case req.All:
			for _, l := range limiters {
				if l != nil {
					cleared += l.ForgetWhere(func(string) bool { return true })
				}
			}
		case req.Key != "" && limiters[req.Kind] != nil:
			cleared += limiters[req.Kind].ForgetWhere(func(k string) bool { return k == req.Key })
			if req.Kind == "address" && deps.LoginAccountLimiter != nil {
				suffix := "|" + req.Key
				cleared += deps.LoginAccountLimiter.ForgetWhere(func(k string) bool { return strings.HasSuffix(k, suffix) })
			}
		default:
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "kind and key, or all, required")
			return
		}

		deps.Store.LogAudit(r.Context(), &caller.ID, AuditLockoutCleared, r, map[string]any{
			"kind": req.Kind, "key": req.Key, "all": req.All, "cleared": cleared,
		})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]int{"cleared": cleared})
	}
}

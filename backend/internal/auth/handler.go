package auth

import (
	"encoding/json"
	"net/http"
	"os"
	"strings"
	"time"
)

func HandleLogin(store *Store, limiter *LoginRateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow(clientIP(r)) {
			w.Header().Set("Retry-After", "900")
			http.Error(w, `{"error":"too many login attempts"}`, http.StatusTooManyRequests)
			return
		}

		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Email == "" || req.Password == "" {
			http.Error(w, `{"error":"email and password required"}`, http.StatusBadRequest)
			return
		}

		user, err := store.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if user == nil || !CheckPassword(user.PasswordHash, req.Password) {
			http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
			return
		}

		// Invalidate existing sessions before creating a new one
		if err := store.DeleteUserSessions(r.Context(), user.ID); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		sess, err := store.CreateSession(r.Context(), user.ID)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}

func HandleLogout(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("session")
		if err == nil {
			store.DeleteSession(r.Context(), cookie.Value)
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "session",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   isSecureCookie(),
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func HandleMe(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// HandleInvite creates a new user. Requires admin role.
func HandleInvite(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		var req InviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Email == "" || req.Password == "" {
			http.Error(w, `{"error":"email and password required"}`, http.StatusBadRequest)
			return
		}

		if err := ValidateEmail(req.Email); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		if err := ValidatePassword(req.Password); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		// Default to "user" role, only allow "admin" or "user"
		role := RoleUser
		if req.Role == RoleAdmin {
			role = RoleAdmin
		}

		existing, err := store.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if existing != nil {
			http.Error(w, `{"error":"user already exists"}`, http.StatusConflict)
			return
		}

		hash, err := HashPassword(req.Password)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		user, err := store.CreateUser(r.Context(), req.Email, hash, role)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(user)
	}
}

// HandleListUsers returns all users. Requires admin role.
func HandleListUsers(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		users, err := store.ListUsers(r.Context())
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if users == nil {
			users = []User{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

// HandleSetup creates the first user as admin. Only works when no users exist.
func HandleSetup(store *Store, limiter *LoginRateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !limiter.Allow(clientIP(r)) {
			w.Header().Set("Retry-After", "900")
			http.Error(w, `{"error":"too many attempts"}`, http.StatusTooManyRequests)
			return
		}

		count, err := store.UserCount(r.Context())
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if count > 0 {
			http.Error(w, `{"error":"setup already completed"}`, http.StatusForbidden)
			return
		}

		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Email == "" || req.Password == "" {
			http.Error(w, `{"error":"email and password required"}`, http.StatusBadRequest)
			return
		}

		if err := ValidateEmail(req.Email); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		if err := ValidatePassword(req.Password); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		hash, err := HashPassword(req.Password)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		user, err := store.CreateUser(r.Context(), req.Email, hash, RoleAdmin)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		// Auto-login after setup
		sess, err := store.CreateSession(r.Context(), user.ID)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(user)
	}
}

// HandleNeedsSetup checks if any users exist (public endpoint).
func HandleNeedsSetup(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		count, err := store.UserCount(r.Context())
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"needs_setup": count == 0})
	}
}

func sessionCookie(token string, expires time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
	}
}

func isSecureCookie() bool {
	return strings.EqualFold(os.Getenv("COOKIE_SECURE"), "true")
}

// ValidatePassword checks minimum password requirements.
func ValidatePassword(pw string) error {
	if len(pw) < 8 {
		return errShortPassword
	}
	return nil
}

// ValidateEmail checks that the email has a basic valid format.
func ValidateEmail(email string) error {
	at := strings.Index(email, "@")
	if at < 1 {
		return errInvalidEmail
	}
	domain := email[at+1:]
	if !strings.Contains(domain, ".") || strings.HasSuffix(domain, ".") {
		return errInvalidEmail
	}
	return nil
}

var (
	errShortPassword = &validationError{"password must be at least 8 characters"}
	errInvalidEmail  = &validationError{"invalid email address"}
)

type validationError struct {
	msg string
}

func (e *validationError) Error() string {
	return e.msg
}

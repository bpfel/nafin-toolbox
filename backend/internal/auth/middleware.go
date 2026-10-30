package auth

import (
	"context"
	"net/http"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
)

type contextKey string

const userContextKey contextKey = "user"

func RequireAuth(store *Store) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			cookie, err := r.Cookie("session")
			if err != nil {
				apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
				return
			}

			sess, err := store.GetSession(r.Context(), cookie.Value)
			if err != nil || sess == nil {
				apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
				return
			}

			user, err := store.GetUserByID(r.Context(), sess.UserID)
			if err != nil || user == nil {
				apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
				return
			}

			ctx := context.WithValue(r.Context(), userContextKey, user)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireEnrolment holds the instance's "2FA for everyone" setting on the
// server. While it is on, a user without a second factor can do nothing but
// set one up: read who they are and the settings, change a password they were
// told to change, enrol, delete their account, or sign out. Only the browser
// held the rule before, and anything that skipped the browser signed in with
// the password alone and used every route.
//
// Administrators are held by AdminReady instead, which asks for a factor
// whatever the setting. Nothing is held where 2FA cannot be enabled at all.
func RequireEnrolment(deps *HandlerDeps) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			user := UserFromContext(r.Context())
			if user == nil || user.IsAdmin() || user.TOTPEnabled || deps.EncryptionKey == nil || allowedBeforeEnrolment(r, user) {
				next.ServeHTTP(w, r)
				return
			}
			required, err := deps.Store.GetSetting(r.Context(), "require_2fa")
			if err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}
			if required == "true" {
				apierror.Write(w, apierror.Auth, http.StatusForbidden, "2FA setup required")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// allowedBeforeEnrolment is what a user waiting to enrol may still do: what
// the browser needs to show them the enrolment screen and get them through it.
func allowedBeforeEnrolment(r *http.Request, user *User) bool {
	switch r.Method + " " + r.URL.Path {
	case "GET /api/auth/me", "GET /api/auth/settings",
		"POST /api/auth/logout", "POST /api/auth/logout-everywhere",
		"POST /api/auth/2fa/setup", "POST /api/auth/2fa/confirm",
		"DELETE /api/auth/account":
		return true
	case "POST /api/auth/change-password":
		// The browser asks for a password change before 2FA (gate.ts): a
		// password somebody else has seen is the wrong one to protect.
		return user.MustChangePassword
	}
	return false
}

func UserFromContext(ctx context.Context) *User {
	u, _ := ctx.Value(userContextKey).(*User)
	return u
}

// ContextWithUser returns a context with the given user set. Useful for tests.
func ContextWithUser(ctx context.Context, user *User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

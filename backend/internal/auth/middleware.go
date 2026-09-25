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

func UserFromContext(ctx context.Context) *User {
	u, _ := ctx.Value(userContextKey).(*User)
	return u
}

// ContextWithUser returns a context with the given user set. Useful for tests.
func ContextWithUser(ctx context.Context, user *User) context.Context {
	return context.WithValue(ctx, userContextKey, user)
}

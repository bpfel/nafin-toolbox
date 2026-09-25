package server

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
	"os"
	"strings"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/auth"
	"github.com/bpfel/nafin-toolbox/internal/email"
	"github.com/bpfel/nafin-toolbox/internal/household"
	"github.com/bpfel/nafin-toolbox/internal/upkeep"
	"github.com/bpfel/nafin-toolbox/internal/vault"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Server struct {
	router *chi.Mux
	db     *sql.DB
}

func New(db *sql.DB, emailSender email.Sender, encryptionKey []byte, appURL string) *Server {
	s := &Server{
		router: chi.NewRouter(),
		db:     db,
	}
	s.routes(emailSender, encryptionKey, appURL)
	return s
}

func (s *Server) routes(emailSender email.Sender, encryptionKey []byte, appURL string) {
	allowedOrigins := getAllowedOrigins()

	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(securityHeaders)
	s.router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   allowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))
	s.router.Use(originCheck(allowedOrigins))

	authStore := auth.NewStore(s.db)
	loginLimiter := auth.NewLoginRateLimiter(5, 15*time.Minute)
	setupLimiter := auth.NewLoginRateLimiter(5, 15*time.Minute)
	verifyEmailLimiter := auth.NewLoginRateLimiter(5, 15*time.Minute)
	verify2FALimiter := auth.NewLoginRateLimiter(10, 15*time.Minute)
	// Four figures change about four times a year between them; six sends an
	// hour is room to retry a bounced one without leaving a mail button open.
	remindLimiter := auth.NewLoginRateLimiter(6, time.Hour)
	if proxies := os.Getenv("TRUSTED_PROXIES"); proxies != "" {
		var cidrs []string
		for _, c := range strings.Split(proxies, ",") {
			c = strings.TrimSpace(c)
			if c != "" {
				cidrs = append(cidrs, c)
			}
		}
		loginLimiter.SetTrustedProxies(cidrs)
		setupLimiter.SetTrustedProxies(cidrs)
		verifyEmailLimiter.SetTrustedProxies(cidrs)
		verify2FALimiter.SetTrustedProxies(cidrs)
		remindLimiter.SetTrustedProxies(cidrs)
	}

	deps := &auth.HandlerDeps{
		Store:              authStore,
		LoginLimiter:       loginLimiter,
		SetupLimiter:       setupLimiter,
		VerifyEmailLimiter: verifyEmailLimiter,
		Verify2FALimiter:   verify2FALimiter,
		EmailSender:        emailSender,
		EncryptionKey:      encryptionKey,
		AppURL:             appURL,
	}

	s.router.Route("/api", func(r chi.Router) {
		r.Use(maxBodySize(1 << 20)) // 1 MB

		// Public routes (no auth required)
		r.Get("/health", s.handleHealth)
		r.Post("/auth/login", auth.HandleLogin(deps))
		r.Get("/auth/needs-setup", auth.HandleNeedsSetup(deps))
		r.Post("/auth/setup", auth.HandleSetup(deps))
		r.Post("/auth/verify-email", auth.HandleVerifyEmail(deps))
		r.Post("/auth/verify-2fa", auth.HandleVerify2FA(deps))

		// Protected routes (require auth)
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth(authStore))
			r.Get("/auth/me", auth.HandleMe)
			r.Post("/auth/logout", auth.HandleLogout(deps))
			r.Post("/auth/change-password", auth.HandleChangePassword(deps))
			r.Get("/auth/settings", auth.HandleGetSettings(deps))

			// 2FA management
			r.Post("/auth/2fa/setup", auth.HandleSetup2FA(deps))
			r.Post("/auth/2fa/confirm", auth.HandleConfirm2FA(deps))
			r.Delete("/auth/2fa", auth.HandleDisable2FA(deps))
			r.Post("/auth/2fa/recovery-codes", auth.HandleRegenerateRecoveryCodes(deps))

			// Account management
			r.Delete("/auth/account", auth.HandleDeleteAccount(deps))

			// Admin routes
			r.Post("/auth/invite", auth.HandleInvite(deps))
			r.Get("/auth/users", auth.HandleListUsers(deps))
			r.Delete("/auth/users/{id}", auth.HandleAdminDeleteUser(deps))
			r.Post("/auth/users/{id}/reset-password", auth.HandleAdminResetPassword(deps))
			r.Post("/auth/resend-verification/{id}", auth.HandleResendVerification(deps))
			r.Post("/auth/settings/require-2fa", auth.HandleAdminRequire2FA(deps))
			r.Get("/auth/audit-logs", auth.HandleListAuditLogs(deps))

			r.Post("/upkeep/remind", upkeep.Handle(deps, remindLimiter))

			r.Route("/vault", vault.Routes(s.db))
			r.Route("/households", household.Routes(s.db))
		})
	})
}

func (s *Server) ListenAndServe(addr string) error {
	return http.ListenAndServe(addr, s.router)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// getAllowedOrigins reads CORS_ORIGINS env var (comma-separated) or defaults to localhost:3000.
func getAllowedOrigins() []string {
	env := os.Getenv("CORS_ORIGINS")
	if env == "" {
		return []string{"http://localhost:3000"}
	}
	var origins []string
	for _, o := range strings.Split(env, ",") {
		o = strings.TrimSpace(o)
		if o != "" {
			origins = append(origins, o)
		}
	}
	if len(origins) == 0 {
		return []string{"http://localhost:3000"}
	}
	return origins
}

// originCheck rejects state-changing requests (POST/PUT/DELETE) whose Origin header
// is present but not in the allowed list. This is the OWASP-recommended CSRF
// defense for SPA + JSON APIs using SameSite cookies.
func originCheck(allowed []string) func(http.Handler) http.Handler {
	set := make(map[string]struct{}, len(allowed))
	for _, o := range allowed {
		set[o] = struct{}{}
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
				next.ServeHTTP(w, r)
				return
			}
			origin := r.Header.Get("Origin")
			if origin == "" {
				// No Origin header (e.g. same-origin, curl) — allow
				next.ServeHTTP(w, r)
				return
			}
			if _, ok := set[origin]; !ok {
				apierror.Write(w, apierror.Server, http.StatusForbidden, "origin not allowed")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")
		w.Header().Set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
		next.ServeHTTP(w, r)
	})
}

func maxBodySize(n int64) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			r.Body = http.MaxBytesReader(w, r.Body, n)
			next.ServeHTTP(w, r)
		})
	}
}

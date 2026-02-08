package server

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/bpfel/nafin-toolbox/internal/auth"
	"github.com/bpfel/nafin-toolbox/internal/budget"
	"github.com/bpfel/nafin-toolbox/internal/module"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
)

type Server struct {
	router *chi.Mux
	db     *sql.DB
}

func New(db *sql.DB) *Server {
	s := &Server{
		router: chi.NewRouter(),
		db:     db,
	}
	s.routes()
	return s
}

func (s *Server) routes() {
	s.router.Use(middleware.Logger)
	s.router.Use(middleware.Recoverer)
	s.router.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	authStore := auth.NewStore(s.db)

	s.router.Route("/api", func(r chi.Router) {
		// Public routes (no auth required)
		r.Get("/health", s.handleHealth)
		r.Post("/auth/login", auth.HandleLogin(authStore))
		r.Get("/auth/needs-setup", auth.HandleNeedsSetup(authStore))
		r.Post("/auth/setup", auth.HandleSetup(authStore))

		// Protected routes (require auth)
		r.Group(func(r chi.Router) {
			r.Use(auth.RequireAuth(authStore))
			r.Get("/auth/me", auth.HandleMe)
			r.Post("/auth/logout", auth.HandleLogout(authStore))
			r.Post("/auth/invite", auth.HandleInvite(authStore))
			r.Get("/auth/users", auth.HandleListUsers(authStore))
			r.Route("/modules", module.Routes(s.db))
			r.Route("/budget", budget.Routes(s.db))

			// Module routes are registered here as they are implemented:
			// r.Route("/accounts", account.Routes(s.db))
			// r.Route("/allocations", allocation.Routes(s.db))
			// r.Route("/provision", provision.Routes(s.db))
			// r.Route("/investments", investment.Routes(s.db))
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

package server

import (
	"database/sql"
	"encoding/json"
	"net/http"

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
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type", "Authorization"},
		AllowCredentials: true,
	}))

	s.router.Route("/api", func(r chi.Router) {
		r.Get("/health", s.handleHealth)
		r.Get("/modules", s.handleListModules)

		// Module routes are registered here as they are implemented:
		// r.Route("/accounts", account.Routes(s.db))
		// r.Route("/budget", budget.Routes(s.db))
		// r.Route("/allocations", allocation.Routes(s.db))
		// r.Route("/provision", provision.Routes(s.db))
		// r.Route("/investments", investment.Routes(s.db))
	})
}

func (s *Server) ListenAndServe(addr string) error {
	return http.ListenAndServe(addr, s.router)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleListModules(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(), "SELECT id, name, enabled_at FROM modules ORDER BY enabled_at")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	type moduleInfo struct {
		ID        string `json:"id"`
		Name      string `json:"name"`
		EnabledAt string `json:"enabled_at"`
	}

	modules := []moduleInfo{}
	for rows.Next() {
		var m moduleInfo
		if err := rows.Scan(&m.ID, &m.Name, &m.EnabledAt); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		modules = append(modules, m)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(modules)
}

package module

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/bpfel/nafin-toolbox/internal/apierror"

	"github.com/bpfel/nafin-toolbox/internal/auth"
	"github.com/go-chi/chi/v5"
)

// KnownModules maps module IDs to their display names.
var KnownModules = map[string]string{
	Accounts:    "Accounts",
	Budget:      "Budget",
	Allocations: "Allocations",
	Provision3a: "Pillar 3a",
	Investments: "Investments",
}

type enableRequest struct {
	ID string `json:"id"`
}

// Routes returns a chi router function for module management endpoints.
// All routes require auth middleware to be applied upstream.
func Routes(db *sql.DB) func(r chi.Router) {
	return func(r chi.Router) {
		r.Get("/", handleList(db))
		r.Post("/", handleEnable(db))
		r.Delete("/{id}", handleDisable(db))
	}
}

func handleList(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := auth.UserFromContext(r.Context()).ID

		rows, err := db.QueryContext(r.Context(),
			"SELECT id, name, enabled_at FROM modules WHERE user_id = $1 ORDER BY enabled_at",
			userID,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		defer rows.Close()

		modules := []Module{}
		for rows.Next() {
			var m Module
			if err := rows.Scan(&m.ID, &m.Name, &m.EnabledAt); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			modules = append(modules, m)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(modules)
	}
}

func handleEnable(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := auth.UserFromContext(r.Context()).ID

		var req enableRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Module, http.StatusBadRequest, "invalid JSON")
			return
		}

		name, ok := KnownModules[req.ID]
		if !ok {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "unknown module ID: " + req.ID})
			return
		}

		var m Module
		err := db.QueryRowContext(r.Context(),
			`INSERT INTO modules (user_id, id, name) VALUES ($1, $2, $3)
			 ON CONFLICT (user_id, id) DO UPDATE SET id = EXCLUDED.id
			 RETURNING id, name, enabled_at`,
			userID, req.ID, name,
		).Scan(&m.ID, &m.Name, &m.EnabledAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(m)
	}
}

func handleDisable(db *sql.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := auth.UserFromContext(r.Context()).ID
		id := chi.URLParam(r, "id")

		result, err := db.ExecContext(r.Context(),
			"DELETE FROM modules WHERE user_id = $1 AND id = $2",
			userID, id,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		rows, _ := result.RowsAffected()
		if rows == 0 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusNotFound)
			json.NewEncoder(w).Encode(map[string]string{"error": "module not found"})
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

package budget

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

func Routes(db *sql.DB) func(r chi.Router) {
	store := NewStore(db)
	return func(r chi.Router) {
		r.Get("/categories", handleListCategories(store))
		r.Post("/categories", handleCreateCategory(store))
		r.Put("/categories/{id}", handleUpdateCategory(store))
		r.Delete("/categories/{id}", handleDeleteCategory(store))

		r.Get("/periods", handleListPeriods(store))
		r.Post("/periods", handleCreatePeriod(store))
		r.Get("/periods/{year}/{month}", handleGetPeriodSummary(store))
		r.Put("/periods/{year}/{month}/entries", handleUpsertEntry(store))
		r.Post("/periods/{year}/{month}/copy", handleCopyPeriod(store))

		r.Delete("/entries/{id}", handleDeleteEntry(store))

		r.Post("/seed-defaults", handleSeedDefaults(store))
	}
}

func handleListCategories(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		includeArchived := r.URL.Query().Get("include_archived") == "true"
		cats, err := store.ListCategories(r.Context(), includeArchived)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if cats == nil {
			cats = []Category{}
		}
		writeJSON(w, http.StatusOK, cats)
	}
}

func handleCreateCategory(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var c Category
		if err := json.NewDecoder(r.Body).Decode(&c); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}
		if c.Name == "" || (c.Type != "income" && c.Type != "expense") || (c.Frequency != "monthly" && c.Frequency != "yearly") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name, type (income/expense), and frequency (monthly/yearly) are required"})
			return
		}
		if err := store.CreateCategory(r.Context(), &c); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusCreated, c)
	}
}

func handleUpdateCategory(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(chi.URLParam(r, "id"))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid category id"})
			return
		}

		existing, err := store.GetCategory(r.Context(), id)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "category not found"})
			return
		}

		var update struct {
			Name      *string `json:"name"`
			Type      *string `json:"type"`
			Frequency *string `json:"frequency"`
			SortOrder *int    `json:"sort_order"`
			Archived  *bool   `json:"archived"`
		}
		if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		if update.Name != nil {
			existing.Name = *update.Name
		}
		if update.Type != nil {
			existing.Type = *update.Type
		}
		if update.Frequency != nil {
			existing.Frequency = *update.Frequency
		}
		if update.SortOrder != nil {
			existing.SortOrder = *update.SortOrder
		}
		if update.Archived != nil {
			existing.Archived = *update.Archived
		}

		if err := store.UpdateCategory(r.Context(), existing); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, existing)
	}
}

func handleDeleteCategory(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(chi.URLParam(r, "id"))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid category id"})
			return
		}
		if err := store.DeleteCategory(r.Context(), id); err != nil {
			writeJSON(w, http.StatusConflict, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func handleListPeriods(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		periods, err := store.ListPeriods(r.Context())
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		if periods == nil {
			periods = []Period{}
		}
		writeJSON(w, http.StatusOK, periods)
	}
}

func handleCreatePeriod(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var p Period
		if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}
		if p.Year < 2000 || p.Year > 2100 || p.Month < 1 || p.Month > 12 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid year or month"})
			return
		}
		if err := store.CreatePeriod(r.Context(), &p); err != nil {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "period already exists"})
			return
		}
		writeJSON(w, http.StatusCreated, p)
	}
}

func handleGetPeriodSummary(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		year, month, err := parseYearMonth(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}
		summary, err := store.GetPeriodSummary(r.Context(), year, month)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "period not found"})
			return
		}
		if summary.Entries == nil {
			summary.Entries = []Entry{}
		}
		writeJSON(w, http.StatusOK, summary)
	}
}

func handleUpsertEntry(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		year, month, err := parseYearMonth(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		period, err := store.GetPeriodByYearMonth(r.Context(), year, month)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "period not found"})
			return
		}

		var req struct {
			CategoryID int    `json:"category_id"`
			Amount     string `json:"amount"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		entry, err := store.UpsertEntry(r.Context(), period.ID, req.CategoryID, req.Amount)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, entry)
	}
}

func handleDeleteEntry(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id, err := strconv.Atoi(chi.URLParam(r, "id"))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid entry id"})
			return
		}
		if err := store.DeleteEntry(r.Context(), id); err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func handleCopyPeriod(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		year, month, err := parseYearMonth(r)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
			return
		}

		var req struct {
			FromYear  int `json:"from_year"`
			FromMonth int `json:"from_month"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		fromPeriod, err := store.GetPeriodByYearMonth(r.Context(), req.FromYear, req.FromMonth)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "source period not found"})
			return
		}

		// Create target period if it doesn't exist
		toPeriod, err := store.GetPeriodByYearMonth(r.Context(), year, month)
		if err != nil {
			p := &Period{Year: year, Month: month}
			if err := store.CreatePeriod(r.Context(), p); err != nil {
				http.Error(w, err.Error(), http.StatusInternalServerError)
				return
			}
			toPeriod = p
		}

		if err := store.CopyPeriodEntries(r.Context(), fromPeriod.ID, toPeriod.ID); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		summary, err := store.GetPeriodSummary(r.Context(), year, month)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, summary)
	}
}

func handleSeedDefaults(store *Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		categoriesCreated, periodCreated, err := SeedDefaults(r.Context(), store)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeJSON(w, http.StatusOK, map[string]interface{}{
			"categories_created": categoriesCreated,
			"period_created":     periodCreated,
		})
	}
}

func parseYearMonth(r *http.Request) (int, int, error) {
	year, err := strconv.Atoi(chi.URLParam(r, "year"))
	if err != nil {
		return 0, 0, fmt.Errorf("invalid year")
	}
	month, err := strconv.Atoi(chi.URLParam(r, "month"))
	if err != nil || month < 1 || month > 12 {
		return 0, 0, fmt.Errorf("invalid month")
	}
	return year, month, nil
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}


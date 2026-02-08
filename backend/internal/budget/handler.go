package budget

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"

	"github.com/go-chi/chi/v5"
)

// maxAmount is the largest value that fits in NUMERIC(12,2): 10 digits + 2 decimals.
const maxAmount = 9_999_999_999.99

// validateAmount checks that s is a valid decimal number within the DB column range.
// Returns the parsed value or an error.
func validateAmount(s string) (float64, error) {
	v, err := strconv.ParseFloat(s, 64)
	if err != nil {
		return 0, fmt.Errorf("invalid number: %s", s)
	}
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return 0, fmt.Errorf("invalid number: %s", s)
	}
	if v < -maxAmount || v > maxAmount {
		return 0, fmt.Errorf("amount out of range (max %.2f)", maxAmount)
	}
	return v, nil
}

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
		if c.Name == "" || (c.Type != "income" && c.Type != "expense") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "name and type (income/expense) are required"})
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

		var req struct {
			CategoryID    int     `json:"category_id"`
			PlannedAmount *string `json:"planned_amount"`
			ActualAmount  *string `json:"actual_amount"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		if req.PlannedAmount == nil && req.ActualAmount == nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "at least one of planned_amount or actual_amount must be provided"})
			return
		}

		if req.PlannedAmount != nil {
			if _, err := validateAmount(*req.PlannedAmount); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "planned_amount: " + err.Error()})
				return
			}
		}
		if req.ActualAmount != nil {
			if _, err := validateAmount(*req.ActualAmount); err != nil {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "actual_amount: " + err.Error()})
				return
			}
		}

		period, err := store.GetPeriodByYearMonth(r.Context(), year, month)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "period not found"})
			return
		}

		entry, err := store.UpsertEntry(r.Context(), period.ID, req.CategoryID, req.PlannedAmount, req.ActualAmount)
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

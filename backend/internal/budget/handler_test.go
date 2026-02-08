package budget

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
)

func TestValidateAmount(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{name: "zero", input: "0", wantErr: false},
		{name: "positive integer", input: "100", wantErr: false},
		{name: "positive decimal", input: "1234.56", wantErr: false},
		{name: "negative value", input: "-500.00", wantErr: false},
		{name: "max boundary", input: "9999999999.99", wantErr: false},
		{name: "negative max boundary", input: "-9999999999.99", wantErr: false},
		{name: "over max", input: "10000000000.00", wantErr: true},
		{name: "under negative max", input: "-10000000000.00", wantErr: true},
		{name: "way too large", input: "999999999999999", wantErr: true},
		{name: "empty string", input: "", wantErr: true},
		{name: "not a number", input: "abc", wantErr: true},
		{name: "NaN", input: "NaN", wantErr: true},
		{name: "Inf", input: "Inf", wantErr: true},
		{name: "negative Inf", input: "-Inf", wantErr: true},
		{name: "small decimal", input: "0.01", wantErr: false},
		{name: "large valid", input: "9999999999.00", wantErr: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := validateAmount(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("validateAmount(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
		})
	}
}

func TestValidateAmountValue(t *testing.T) {
	v, err := validateAmount("123.45")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v != 123.45 {
		t.Errorf("got %f, want 123.45", v)
	}
}

// TestUpsertEntryValidation tests that the HTTP handler rejects bad amounts
// with 400 instead of passing them to the DB (which would cause a 500).
func TestUpsertEntryValidation(t *testing.T) {
	// nil DB — we should never reach the store because validation fails first
	store := &Store{db: nil}

	r := chi.NewRouter()
	r.Put("/periods/{year}/{month}/entries", handleUpsertEntry(store))

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "oversized planned_amount returns 400",
			body:       `{"category_id":1,"planned_amount":"99999999999999"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "out of range",
		},
		{
			name:       "oversized actual_amount returns 400",
			body:       `{"category_id":1,"actual_amount":"10000000000.00"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "out of range",
		},
		{
			name:       "non-numeric planned_amount returns 400",
			body:       `{"category_id":1,"planned_amount":"abc"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid number",
		},
		{
			name:       "NaN planned_amount returns 400",
			body:       `{"category_id":1,"planned_amount":"NaN"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid number",
		},
		{
			name:       "missing both amounts returns 400",
			body:       `{"category_id":1}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "at least one",
		},
		{
			name:       "invalid JSON returns 400",
			body:       `{bad json`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid JSON",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPut, "/periods/2026/1/entries", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			r.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tt.wantStatus, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), tt.wantSubstr) {
				t.Errorf("body %q does not contain %q", w.Body.String(), tt.wantSubstr)
			}
		})
	}
}

func TestFixedCategoryError(t *testing.T) {
	err := &FixedCategoryError{msg: "test error"}

	if err.Error() != "test error" {
		t.Errorf("Error() = %q, want %q", err.Error(), "test error")
	}

	// Verify it works with errors.As
	var target *FixedCategoryError
	if !errors.As(err, &target) {
		t.Error("errors.As should match FixedCategoryError")
	}
}

func TestCreateCategoryWithGroupFields(t *testing.T) {
	// nil DB — handler validation happens before store call
	store := &Store{db: nil}

	r := chi.NewRouter()
	r.Post("/categories", handleCreateCategory(store))

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "missing name returns 400",
			body:       `{"type":"income","group_name":"Employment"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "name and type",
		},
		{
			name:       "invalid type returns 400",
			body:       `{"name":"Rent","type":"other","group_name":"Housing"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "name and type",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/categories", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			r.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tt.wantStatus, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), tt.wantSubstr) {
				t.Errorf("body %q does not contain %q", w.Body.String(), tt.wantSubstr)
			}
		})
	}
}

func TestCategoryModelGroupFields(t *testing.T) {
	// Verify that Category JSON marshaling includes new fields
	c := Category{
		ID:             1,
		Name:           "Rent",
		Type:           "expense",
		SortOrder:      10,
		GroupName:      "Housing",
		GroupSortOrder: 10,
		Fixed:          true,
	}

	data, err := json.Marshal(c)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result["group_name"] != "Housing" {
		t.Errorf("group_name = %v, want Housing", result["group_name"])
	}
	if result["group_sort_order"] != float64(10) {
		t.Errorf("group_sort_order = %v, want 10", result["group_sort_order"])
	}
	if result["fixed"] != true {
		t.Errorf("fixed = %v, want true", result["fixed"])
	}
}

func TestEntryModelGroupFields(t *testing.T) {
	e := Entry{
		ID:                1,
		PeriodID:          1,
		CategoryID:        1,
		CategoryName:      "Rent",
		CategoryType:      "expense",
		CategoryGroupName: "Housing",
		CategoryFixed:     true,
		PlannedAmount:     "1350.00",
		ActualAmount:      "1350.00",
	}

	data, err := json.Marshal(e)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(data, &result); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result["category_group_name"] != "Housing" {
		t.Errorf("category_group_name = %v, want Housing", result["category_group_name"])
	}
	if result["category_fixed"] != true {
		t.Errorf("category_fixed = %v, want true", result["category_fixed"])
	}
}

func TestReorderCategoriesValidation(t *testing.T) {
	store := &Store{db: nil}

	r := chi.NewRouter()
	r.Post("/categories/reorder", handleReorderCategories(store))

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "empty category_ids returns 400",
			body:       `{"category_ids":[]}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "category_ids required",
		},
		{
			name:       "missing category_ids returns 400",
			body:       `{}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "category_ids required",
		},
		{
			name:       "invalid JSON returns 400",
			body:       `{bad`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid JSON",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/categories/reorder", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			r.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tt.wantStatus, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), tt.wantSubstr) {
				t.Errorf("body %q does not contain %q", w.Body.String(), tt.wantSubstr)
			}
		})
	}
}

func TestBFSDefaultsHaveGroups(t *testing.T) {
	defaults := BFSDefaults()

	groupsSeen := make(map[string]bool)
	fixedCount := 0
	for _, d := range defaults {
		if d.GroupName == "" {
			t.Errorf("default %q has empty group_name", d.Name)
		}
		groupsSeen[d.GroupName] = true
		if d.Fixed {
			fixedCount++
		}
	}

	expectedGroups := []string{"Employment", "Housing", "Insurance & Taxes", "Living", "Lifestyle", "Savings"}
	for _, g := range expectedGroups {
		if !groupsSeen[g] {
			t.Errorf("expected group %q not found in defaults", g)
		}
	}

	if fixedCount == 0 {
		t.Error("expected at least one fixed category in defaults")
	}
}

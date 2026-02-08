package budget

import (
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

package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// --- Login handler tests ---

func TestHandleLogin_Validation(t *testing.T) {
	// nil DB — we test validation before any DB call
	store := &Store{db: nil}

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "empty body",
			body:       `{}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "email and password required",
		},
		{
			name:       "missing password",
			body:       `{"email":"test@test.com"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "email and password required",
		},
		{
			name:       "missing email",
			body:       `{"password":"secret"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "email and password required",
		},
		{
			name:       "invalid JSON",
			body:       `{bad json`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid request body",
		},
		{
			name:       "empty strings",
			body:       `{"email":"","password":""}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "email and password required",
		},
	}

	handler := HandleLogin(store)
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/auth/login", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tt.wantStatus, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), tt.wantSubstr) {
				t.Errorf("body %q does not contain %q", w.Body.String(), tt.wantSubstr)
			}
		})
	}
}

// --- Invite handler tests ---

func TestHandleInvite_RequiresAdmin(t *testing.T) {
	store := &Store{db: nil}
	handler := HandleInvite(store)

	// Set up context with a non-admin user
	user := &User{ID: 1, Email: "user@test.com", Role: RoleUser}
	ctx := context.WithValue(context.Background(), userContextKey, user)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/invite",
		strings.NewReader(`{"email":"new@test.com","password":"pass123"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
	if !strings.Contains(w.Body.String(), "admin access required") {
		t.Errorf("body %q does not contain 'admin access required'", w.Body.String())
	}
}

func TestHandleInvite_Validation(t *testing.T) {
	store := &Store{db: nil}
	handler := HandleInvite(store)

	// Set up context with an admin user
	admin := &User{ID: 1, Email: "admin@test.com", Role: RoleAdmin}
	ctx := context.WithValue(context.Background(), userContextKey, admin)

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "empty body",
			body:       `{}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "email and password required",
		},
		{
			name:       "missing password",
			body:       `{"email":"new@test.com"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "email and password required",
		},
		{
			name:       "invalid JSON",
			body:       `{bad`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid request body",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/auth/invite", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(ctx)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, tt.wantStatus, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), tt.wantSubstr) {
				t.Errorf("body %q does not contain %q", w.Body.String(), tt.wantSubstr)
			}
		})
	}
}

// --- ListUsers handler tests ---

func TestHandleListUsers_RequiresAdmin(t *testing.T) {
	store := &Store{db: nil}
	handler := HandleListUsers(store)

	user := &User{ID: 1, Email: "user@test.com", Role: RoleUser}
	ctx := context.WithValue(context.Background(), userContextKey, user)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/users", nil)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

// Note: HandleSetup requires a DB connection (calls UserCount first),
// so validation tests for it live in store_integration_test.go.

// --- Me handler tests ---

func TestHandleMe_NoUser(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	w := httptest.NewRecorder()

	HandleMe(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleMe_WithUser(t *testing.T) {
	user := &User{ID: 42, Email: "me@test.com", Role: RoleAdmin}
	ctx := context.WithValue(context.Background(), userContextKey, user)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/me", nil)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	HandleMe(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}

	if result["email"] != "me@test.com" {
		t.Errorf("email = %v, want me@test.com", result["email"])
	}
	if result["role"] != "admin" {
		t.Errorf("role = %v, want admin", result["role"])
	}
	if result["id"] != float64(42) {
		t.Errorf("id = %v, want 42", result["id"])
	}
}

// --- Logout handler tests ---

func TestHandleLogout_ClearsCookie(t *testing.T) {
	store := &Store{db: nil}
	handler := HandleLogout(store)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	// No session cookie — should still succeed
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	// Check that the session cookie is cleared
	cookies := w.Result().Cookies()
	found := false
	for _, c := range cookies {
		if c.Name == "session" {
			found = true
			if c.MaxAge != -1 {
				t.Errorf("cookie MaxAge = %d, want -1 (expired)", c.MaxAge)
			}
			if c.Value != "" {
				t.Errorf("cookie Value = %q, want empty", c.Value)
			}
		}
	}
	if !found {
		t.Error("expected session cookie in response")
	}
}

// --- Model tests ---

func TestUserIsAdmin(t *testing.T) {
	tests := []struct {
		role string
		want bool
	}{
		{RoleAdmin, true},
		{RoleUser, false},
		{"", false},
		{"superadmin", false},
	}

	for _, tt := range tests {
		u := &User{Role: tt.role}
		if got := u.IsAdmin(); got != tt.want {
			t.Errorf("User{Role: %q}.IsAdmin() = %v, want %v", tt.role, got, tt.want)
		}
	}
}

func TestUserJSON_HidesPasswordHash(t *testing.T) {
	u := User{
		ID:           1,
		Email:        "test@test.com",
		Role:         RoleAdmin,
		PasswordHash: "$2a$12$somehash",
	}

	data, err := json.Marshal(u)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	s := string(data)
	if strings.Contains(s, "password_hash") {
		t.Error("JSON output contains password_hash")
	}
	if strings.Contains(s, "$2a$") {
		t.Error("JSON output contains bcrypt hash value")
	}
	if !strings.Contains(s, "test@test.com") {
		t.Error("JSON output missing email")
	}
	if !strings.Contains(s, "admin") {
		t.Error("JSON output missing role")
	}
}

// --- UserFromContext tests ---

func TestUserFromContext_NoUser(t *testing.T) {
	ctx := context.Background()
	u := UserFromContext(ctx)
	if u != nil {
		t.Errorf("expected nil user, got %v", u)
	}
}

func TestUserFromContext_WithUser(t *testing.T) {
	user := &User{ID: 1, Email: "test@test.com", Role: RoleUser}
	ctx := context.WithValue(context.Background(), userContextKey, user)
	got := UserFromContext(ctx)
	if got == nil {
		t.Fatal("expected non-nil user")
	}
	if got.ID != 1 || got.Email != "test@test.com" {
		t.Errorf("got user %+v, want id=1 email=test@test.com", got)
	}
}

func TestUserFromContext_WrongType(t *testing.T) {
	ctx := context.WithValue(context.Background(), userContextKey, "not-a-user")
	u := UserFromContext(ctx)
	if u != nil {
		t.Errorf("expected nil for wrong type, got %v", u)
	}
}

package auth

import (
	"context"
	"database/sql"
	"net/http"
	"net/http/httptest"
	"testing"
)

// TestRequireAuth_NoCookie tests that RequireAuth returns 401 when no session cookie is present
func TestRequireAuth_NoCookie(t *testing.T) {
	store := &Store{db: nil}

	middleware := RequireAuth(store)
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if w.Body.String() != `{"error":"unauthorized"}`+"\n" {
		t.Errorf("body = %q, want unauthorized error", w.Body.String())
	}
}

// TestRequireAuth_ValidSession_UserInjected tests that UserFromContext works correctly
func TestRequireAuth_ValidSession_UserInjected(t *testing.T) {
	testUser := &User{
		ID:            42,
		Email:         "auth@test.com",
		Role:          RoleAdmin,
		EmailVerified: true,
	}

	ctx := ContextWithUser(context.Background(), testUser)

	extracted := UserFromContext(ctx)
	if extracted == nil {
		t.Fatal("UserFromContext returned nil for context with user")
	}
	if extracted.ID != 42 {
		t.Errorf("extracted user ID = %d, want 42", extracted.ID)
	}
	if extracted.Email != "auth@test.com" {
		t.Errorf("extracted user email = %q, want auth@test.com", extracted.Email)
	}
	if extracted.Role != RoleAdmin {
		t.Errorf("extracted user role = %q, want admin", extracted.Role)
	}
}

// TestRequireAuth_Integration_WithRealDB tests the full flow with a test database
func TestRequireAuth_Integration_WithRealDB(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping integration test in short mode")
	}

	dbURL := "postgres://finance:finance@localhost:5432/finance?sslmode=disable"
	db, err := sql.Open("pgx", dbURL)
	if err != nil {
		t.Skipf("skipping integration test: %v", err)
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		t.Skipf("skipping integration test: database not available: %v", err)
	}

	store := NewStore(db)
	ctx := context.Background()

	testEmail := "middleware_test@example.com"
	hash, _ := HashPassword("testpass123")
	user, err := store.CreateUserFull(ctx, testEmail, hash, RoleUser, false, true)
	if err != nil {
		t.Fatalf("creating test user: %v", err)
	}
	defer store.DeleteUser(ctx, user.ID)

	sess, err := store.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatalf("creating session: %v", err)
	}
	defer store.DeleteSession(ctx, sess.Token)

	middleware := RequireAuth(store)

	var capturedUser *User
	handler := middleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		capturedUser = UserFromContext(r.Context())
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("success"))
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/protected", nil)
	req.AddCookie(&http.Cookie{
		Name:  "session",
		Value: sess.Token,
	})
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}
	if capturedUser == nil {
		t.Fatal("user was not injected into context")
	}
	if capturedUser.ID != user.ID {
		t.Errorf("injected user ID = %d, want %d", capturedUser.ID, user.ID)
	}
	if capturedUser.Email != testEmail {
		t.Errorf("injected user email = %q, want %q", capturedUser.Email, testEmail)
	}
	if w.Body.String() != "success" {
		t.Errorf("next handler was not called, body = %q", w.Body.String())
	}
}

// TestUserFromContext_NilUser tests UserFromContext handles nil pointer
func TestUserFromContext_NilUser(t *testing.T) {
	var nilUser *User
	ctx := context.WithValue(context.Background(), userContextKey, nilUser)
	user := UserFromContext(ctx)
	if user != nil {
		t.Errorf("UserFromContext with nil user pointer = %v, want nil", user)
	}
}

// TestContextWithUser tests the exported context helper
func TestContextWithUser(t *testing.T) {
	u := &User{ID: 99, Email: "ctx@test.com", Role: RoleUser}
	ctx := ContextWithUser(context.Background(), u)
	got := UserFromContext(ctx)
	if got == nil {
		t.Fatal("expected user from context")
	}
	if got.ID != 99 {
		t.Errorf("user ID = %d, want 99", got.ID)
	}
}

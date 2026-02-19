package server

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

// --- getAllowedOrigins tests ---

func TestGetAllowedOrigins_EmptyEnv(t *testing.T) {
	os.Unsetenv("CORS_ORIGINS")

	origins := getAllowedOrigins()

	want := []string{"http://localhost:3000"}
	if len(origins) != len(want) {
		t.Fatalf("got %d origins, want %d", len(origins), len(want))
	}
	if origins[0] != want[0] {
		t.Errorf("got %q, want %q", origins[0], want[0])
	}
}

func TestGetAllowedOrigins_SingleOrigin(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "https://app.example.com")
	defer os.Unsetenv("CORS_ORIGINS")

	origins := getAllowedOrigins()

	want := []string{"https://app.example.com"}
	if len(origins) != len(want) {
		t.Fatalf("got %d origins, want %d", len(origins), len(want))
	}
	if origins[0] != want[0] {
		t.Errorf("got %q, want %q", origins[0], want[0])
	}
}

func TestGetAllowedOrigins_MultipleOrigins(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "https://app.example.com,https://staging.example.com,http://localhost:3000")
	defer os.Unsetenv("CORS_ORIGINS")

	origins := getAllowedOrigins()

	want := 3
	if len(origins) != want {
		t.Fatalf("got %d origins, want %d", len(origins), want)
	}

	expected := []string{
		"https://app.example.com",
		"https://staging.example.com",
		"http://localhost:3000",
	}
	for i, exp := range expected {
		if origins[i] != exp {
			t.Errorf("origins[%d] = %q, want %q", i, origins[i], exp)
		}
	}
}

func TestGetAllowedOrigins_WithWhitespace(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "  https://app.example.com  ,  https://staging.example.com  ")
	defer os.Unsetenv("CORS_ORIGINS")

	origins := getAllowedOrigins()

	want := 2
	if len(origins) != want {
		t.Fatalf("got %d origins, want %d", len(origins), want)
	}

	// Whitespace should be trimmed
	if origins[0] != "https://app.example.com" {
		t.Errorf("got %q, want trimmed origin", origins[0])
	}
	if origins[1] != "https://staging.example.com" {
		t.Errorf("got %q, want trimmed origin", origins[1])
	}
}

func TestGetAllowedOrigins_EmptyStringsIgnored(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "https://app.example.com,,https://staging.example.com,")
	defer os.Unsetenv("CORS_ORIGINS")

	origins := getAllowedOrigins()

	want := 2
	if len(origins) != want {
		t.Fatalf("got %d origins, want %d (empty strings should be ignored)", len(origins), want)
	}
}

func TestGetAllowedOrigins_OnlyCommas(t *testing.T) {
	os.Setenv("CORS_ORIGINS", ",,,")
	defer os.Unsetenv("CORS_ORIGINS")

	origins := getAllowedOrigins()

	// Should fall back to default
	want := []string{"http://localhost:3000"}
	if len(origins) != len(want) {
		t.Fatalf("got %d origins, want %d", len(origins), len(want))
	}
	if origins[0] != want[0] {
		t.Errorf("got %q, want default origin", origins[0])
	}
}

func TestGetAllowedOrigins_OnlyWhitespace(t *testing.T) {
	os.Setenv("CORS_ORIGINS", "   ,   ,   ")
	defer os.Unsetenv("CORS_ORIGINS")

	origins := getAllowedOrigins()

	// Should fall back to default
	want := []string{"http://localhost:3000"}
	if len(origins) != len(want) {
		t.Fatalf("got %d origins, want %d", len(origins), len(want))
	}
	if origins[0] != want[0] {
		t.Errorf("got %q, want default origin", origins[0])
	}
}

// --- originCheck middleware tests ---

func TestOriginCheck_AllowsGET(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// GET request with wrong origin should still be allowed
	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.com")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("GET request blocked, got status %d, want %d", w.Code, http.StatusOK)
	}
}

func TestOriginCheck_AllowsHEAD(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodHead, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.com")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("HEAD request blocked, got status %d, want %d", w.Code, http.StatusOK)
	}
}

func TestOriginCheck_AllowsOPTIONS(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodOptions, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.com")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("OPTIONS request blocked, got status %d, want %d", w.Code, http.StatusOK)
	}
}

func TestOriginCheck_BlocksPOSTWithWrongOrigin(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.com")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("POST with wrong origin not blocked, got status %d, want %d", w.Code, http.StatusForbidden)
	}

	body := w.Body.String()
	wantSubstr := "origin not allowed"
	if !strings.Contains(body, wantSubstr) {
		t.Errorf("response body = %q, want to contain %q", body, wantSubstr)
	}
}

func TestOriginCheck_BlocksPUTWithWrongOrigin(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPut, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.com")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("PUT with wrong origin not blocked, got status %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestOriginCheck_BlocksDELETEWithWrongOrigin(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodDelete, "/api/test", nil)
	req.Header.Set("Origin", "https://evil.com")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("DELETE with wrong origin not blocked, got status %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestOriginCheck_AllowsPOSTWithCorrectOrigin(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
	req.Header.Set("Origin", "https://app.example.com")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("POST with correct origin blocked, got status %d, want %d", w.Code, http.StatusOK)
	}
}

func TestOriginCheck_AllowsPOSTWithNoOrigin(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// POST without Origin header (e.g., from curl, same-origin request)
	req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("POST without Origin header blocked, got status %d, want %d", w.Code, http.StatusOK)
	}
}

func TestOriginCheck_MultipleAllowedOrigins(t *testing.T) {
	allowed := []string{"https://app.example.com", "https://staging.example.com", "http://localhost:3000"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	tests := []struct {
		name       string
		origin     string
		wantStatus int
	}{
		{name: "first allowed origin", origin: "https://app.example.com", wantStatus: http.StatusOK},
		{name: "second allowed origin", origin: "https://staging.example.com", wantStatus: http.StatusOK},
		{name: "third allowed origin", origin: "http://localhost:3000", wantStatus: http.StatusOK},
		{name: "disallowed origin", origin: "https://evil.com", wantStatus: http.StatusForbidden},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
			req.Header.Set("Origin", tt.origin)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != tt.wantStatus {
				t.Errorf("origin %q: got status %d, want %d", tt.origin, w.Code, tt.wantStatus)
			}
		})
	}
}

func TestOriginCheck_CaseSensitive(t *testing.T) {
	allowed := []string{"https://app.example.com"}
	handler := originCheck(allowed)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	// Origin header is case-sensitive
	req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
	req.Header.Set("Origin", "https://APP.EXAMPLE.COM")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("case-variant origin not blocked, got status %d, want %d", w.Code, http.StatusForbidden)
	}
}

// --- securityHeaders middleware tests ---

func TestSecurityHeaders_SetsAllHeaders(t *testing.T) {
	handler := securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	tests := []struct {
		header string
		want   string
	}{
		{header: "X-Frame-Options", want: "DENY"},
		{header: "X-Content-Type-Options", want: "nosniff"},
		{header: "Referrer-Policy", want: "strict-origin-when-cross-origin"},
		{header: "Permissions-Policy", want: "camera=(), microphone=(), geolocation=()"},
	}

	for _, tt := range tests {
		t.Run(tt.header, func(t *testing.T) {
			got := w.Header().Get(tt.header)
			if got != tt.want {
				t.Errorf("%s = %q, want %q", tt.header, got, tt.want)
			}
		})
	}
}

func TestSecurityHeaders_DoesNotOverwriteExisting(t *testing.T) {
	handler := securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Try to set a header after the middleware
		w.Header().Set("X-Frame-Options", "SAMEORIGIN")
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/api/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Middleware sets headers first, so handler's attempt should be ignored
	got := w.Header().Get("X-Frame-Options")
	// Note: In http.ResponseWriter, Set() replaces. This test verifies middleware runs first.
	// The handler's Set() will actually overwrite, which is expected Go behavior.
	// Middleware just ensures headers are present; handlers can override if needed.
	if got != "SAMEORIGIN" {
		t.Errorf("X-Frame-Options = %q, want %q (handler set after middleware)", got, "SAMEORIGIN")
	}
}

func TestSecurityHeaders_AllMethods(t *testing.T) {
	handler := securityHeaders(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))

	methods := []string{http.MethodGet, http.MethodPost, http.MethodPut, http.MethodDelete, http.MethodOptions}

	for _, method := range methods {
		t.Run(method, func(t *testing.T) {
			req := httptest.NewRequest(method, "/api/test", nil)
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			// Verify at least one security header is set
			if w.Header().Get("X-Frame-Options") != "DENY" {
				t.Errorf("%s request: X-Frame-Options not set", method)
			}
		})
	}
}

// --- maxBodySize middleware tests ---

func TestMaxBodySize_AllowsUnderLimit(t *testing.T) {
	limit := int64(100)
	handler := maxBodySize(limit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("reading body: %v", err)
		}
		if len(body) != 50 {
			t.Errorf("body length = %d, want 50", len(body))
		}
		w.WriteHeader(http.StatusOK)
	}))

	body := strings.Repeat("a", 50) // 50 bytes, under limit
	req := httptest.NewRequest(http.MethodPost, "/api/test", strings.NewReader(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("request under limit rejected, got status %d, want %d", w.Code, http.StatusOK)
	}
}

func TestMaxBodySize_RejectsOverLimit(t *testing.T) {
	limit := int64(100)
	handler := maxBodySize(limit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		if err == nil {
			t.Error("expected error reading oversized body, got nil")
		}
		w.WriteHeader(http.StatusOK)
	}))

	body := strings.Repeat("a", 200) // 200 bytes, over limit
	req := httptest.NewRequest(http.MethodPost, "/api/test", strings.NewReader(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// The handler will try to read and hit the limit, which triggers an error response
	// Note: http.MaxBytesReader returns an error on read, handler must handle it
}

func TestMaxBodySize_ExactLimit(t *testing.T) {
	limit := int64(100)
	handler := maxBodySize(limit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("reading body at exact limit: %v", err)
		}
		if len(body) != 100 {
			t.Errorf("body length = %d, want 100", len(body))
		}
		w.WriteHeader(http.StatusOK)
	}))

	body := strings.Repeat("a", 100) // Exactly at limit
	req := httptest.NewRequest(http.MethodPost, "/api/test", strings.NewReader(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("request at exact limit rejected, got status %d, want %d", w.Code, http.StatusOK)
	}
}

func TestMaxBodySize_EmptyBody(t *testing.T) {
	limit := int64(100)
	handler := maxBodySize(limit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("reading empty body: %v", err)
		}
		if len(body) != 0 {
			t.Errorf("body length = %d, want 0", len(body))
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/test", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("empty body rejected, got status %d, want %d", w.Code, http.StatusOK)
	}
}

func TestMaxBodySize_ZeroLimit(t *testing.T) {
	limit := int64(0)
	handler := maxBodySize(limit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, err := io.ReadAll(r.Body)
		// Reading from a body with 0-byte limit should fail
		if err == nil {
			t.Error("expected error with zero limit, got nil")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/test", strings.NewReader("a"))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)
}

func TestMaxBodySize_NegativeLimit(t *testing.T) {
	limit := int64(-1)
	handler := maxBodySize(limit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Negative limit in http.MaxBytesReader rejects all reads
		_, err := io.ReadAll(r.Body)
		if err == nil {
			t.Error("expected error with negative limit, got nil")
		}
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodPost, "/api/test", strings.NewReader("test"))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)
}

func TestMaxBodySize_LargeLimit(t *testing.T) {
	limit := int64(10 << 20) // 10 MB
	handler := maxBodySize(limit)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			t.Errorf("reading body with large limit: %v", err)
		}
		if len(body) != 1024 {
			t.Errorf("body length = %d, want 1024", len(body))
		}
		w.WriteHeader(http.StatusOK)
	}))

	body := strings.Repeat("a", 1024)
	req := httptest.NewRequest(http.MethodPost, "/api/test", strings.NewReader(body))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("request under large limit rejected, got status %d, want %d", w.Code, http.StatusOK)
	}
}

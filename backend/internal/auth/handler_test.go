package auth

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
	"github.com/bpfel/nafin-toolbox/internal/email"
	"github.com/pquerna/otp/totp"
)

func testDeps() *HandlerDeps {
	limiter := NewLoginRateLimiter(100, time.Minute)
	return &HandlerDeps{
		Store:                &Store{db: nil},
		LoginLimiter:         limiter,
		LoginAccountLimiter:  limiter,
		SetupLimiter:         limiter,
		VerifyEmailLimiter:   limiter,
		Verify2FALimiter:     limiter,
		LoginEmailLimiter:    limiter,
		Verify2FAUserLimiter: limiter,
		PasswordCheckLimiter: limiter,
		DeviceLimiter:        limiter,
		EmailSender:          &email.LogSender{},
		AppURL:               "http://localhost:3000",
	}
}

func testDepsWithKey() *HandlerDeps {
	deps := testDeps()
	deps.EncryptionKey = make([]byte, 32) // zeroed 32-byte key, valid for tests
	return deps
}

func adminCtx() context.Context {
	admin := &User{ID: 1, Email: "admin@test.com", Role: RoleAdmin, EmailVerified: true, PasswordHash: mustHash("admin123")}
	return context.WithValue(context.Background(), userContextKey, admin)
}

func userCtx() context.Context {
	user := &User{ID: 2, Email: "user@test.com", Role: RoleUser, EmailVerified: true, PasswordHash: mustHash("user1234")}
	return context.WithValue(context.Background(), userContextKey, user)
}

func mustHash(pw string) string {
	h, err := HashPassword(pw)
	if err != nil {
		panic(err)
	}
	return h
}

// --- Login handler tests ---

func TestHandleLogin_Validation(t *testing.T) {
	deps := testDeps()

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

	handler := HandleLogin(deps)
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
	deps := testDeps()
	handler := HandleInvite(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/invite",
		strings.NewReader(`{"email":"new@test.com","password":"pass1234"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx())
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
	deps := testDeps()
	handler := HandleInvite(deps)

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
			wantSubstr: "email required",
		},
		{
			name:       "invalid JSON",
			body:       `{bad`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid request body",
		},
		{
			name:       "invalid email format",
			body:       `{"email":"not-an-email"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid email",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/auth/invite", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(adminCtx())
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

func TestHandleInvite_FallbackRequiresPassword(t *testing.T) {
	// With LogSender (no SMTP), invite requires admin-set password
	deps := testDeps()
	handler := HandleInvite(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/invite",
		strings.NewReader(`{"email":"new@test.com"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(adminCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// Should fail because LogSender requires password fallback
	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d (body: %s)", w.Code, http.StatusBadRequest, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "password required") {
		t.Errorf("body %q does not contain 'password required'", w.Body.String())
	}
}

func TestHandleInvite_FallbackShortPassword(t *testing.T) {
	deps := testDeps()
	handler := HandleInvite(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/invite",
		strings.NewReader(`{"email":"new@test.com","password":"short"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(adminCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "password must be at least 8 characters") {
		t.Errorf("body %q does not contain password length error", w.Body.String())
	}
}

func TestEmailEnabled(t *testing.T) {
	// The settings endpoint reports this to the invite form, and HandleInvite
	// branches on it: both have to agree on what "no SMTP" looks like.
	deps := testDeps()
	if emailEnabled(deps) {
		t.Error("emailEnabled with a LogSender = true, want false")
	}

	deps.EmailSender = &email.SMTPSender{}
	if !emailEnabled(deps) {
		t.Error("emailEnabled with an SMTPSender = false, want true")
	}
}

// Each rule a user's input can break has a code of its own, so the code they
// read out says which rule it was. The frontend reports the same codes when it
// catches the rule first, so they must not drift.
func TestValidationErrorsHaveTheirOwnCodes(t *testing.T) {
	for err, want := range map[error]string{
		errShortPassword: "AUTH-051",
		errInvalidEmail:  "AUTH-052",
	} {
		if got := apierror.CodeFor(apierror.Auth, err.Error()); got != want {
			t.Errorf("%q has code %s, want %s", err.Error(), got, want)
		}
	}
}

func TestHandleChangePassword_ShortPasswordCarriesItsCode(t *testing.T) {
	deps := testDeps()
	hash, _ := HashPassword("old-pass-123")
	user := &User{ID: 1, Email: "a@example.ch", Role: RoleUser, PasswordHash: hash}
	body := strings.NewReader(`{"current_password":"old-pass-123","new_password":"short"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", body)
	req = req.WithContext(ContextWithUser(req.Context(), user))
	w := httptest.NewRecorder()

	HandleChangePassword(deps).ServeHTTP(w, req)

	if !strings.Contains(w.Body.String(), `"code":"AUTH-051"`) {
		t.Errorf("body %q does not carry AUTH-051", w.Body.String())
	}
}

// --- ListUsers handler tests ---

func TestHandleListUsers_RequiresAdmin(t *testing.T) {
	deps := testDeps()
	handler := HandleListUsers(deps)

	req := httptest.NewRequest(http.MethodGet, "/api/auth/users", nil)
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

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
	user := &User{ID: 42, Email: "me@test.com", Role: RoleAdmin, EmailVerified: true}
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
	if result["email_verified"] != true {
		t.Errorf("email_verified = %v, want true", result["email_verified"])
	}
}

// --- Logout handler tests ---

func TestHandleLogout_ClearsCookie(t *testing.T) {
	deps := testDeps()
	handler := HandleLogout(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

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

// --- ChangePassword handler tests ---

func TestHandleChangePassword_RequiresAuth(t *testing.T) {
	deps := testDeps()
	handler := HandleChangePassword(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password",
		strings.NewReader(`{"current_password":"old","new_password":"newpass12"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleChangePassword_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleChangePassword(deps)

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
			wantSubstr: "current and new password required",
		},
		{
			name:       "missing new password",
			body:       `{"current_password":"old"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "current and new password required",
		},
		{
			name:       "missing current password",
			body:       `{"new_password":"newpass12"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "current and new password required",
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
			req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(userCtx())
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

func TestHandleChangePassword_WrongCurrentPassword(t *testing.T) {
	deps := testDeps()
	handler := HandleChangePassword(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password",
		strings.NewReader(`{"current_password":"wrongpassword","new_password":"newpass12"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if !strings.Contains(w.Body.String(), "current password is incorrect") {
		t.Errorf("body %q does not contain 'current password is incorrect'", w.Body.String())
	}
}

func TestHandleChangePassword_ShortNewPassword(t *testing.T) {
	deps := testDeps()
	handler := HandleChangePassword(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password",
		strings.NewReader(`{"current_password":"user1234","new_password":"short"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "password must be at least 8 characters") {
		t.Errorf("body %q does not contain password length error", w.Body.String())
	}
}

// --- Setup handler tests ---

func TestHandleSetup_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleSetup(deps)

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
			name:       "invalid JSON",
			body:       `{bad`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid request body",
		},
		{
			name:       "missing password",
			body:       `{"email":"admin@test.com"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "email and password required",
		},
		{
			name:       "invalid email",
			body:       `{"email":"notanemail","password":"password123"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "invalid email",
		},
		{
			name:       "short password",
			body:       `{"email":"admin@test.com","password":"short"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "password must be at least 8 characters",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/auth/setup", strings.NewReader(tt.body))
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
		ID:            1,
		Email:         "test@test.com",
		Role:          RoleAdmin,
		PasswordHash:  "$2a$12$somehash",
		EmailVerified: true,
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
	if !strings.Contains(s, `"email_verified":true`) {
		t.Error("JSON output missing email_verified")
	}
}

func TestUserJSON_IncludesNewFields(t *testing.T) {
	u := User{
		ID:            1,
		Email:         "test@test.com",
		Role:          RoleUser,
		EmailVerified: true,
		TOTPEnabled:   true,
	}

	data, err := json.Marshal(u)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	s := string(data)
	if !strings.Contains(s, `"email_verified":true`) {
		t.Errorf("missing email_verified in %s", s)
	}
	if !strings.Contains(s, `"totp_enabled":true`) {
		t.Errorf("missing totp_enabled in %s", s)
	}
}

func TestUserJSON_DefaultFieldValues(t *testing.T) {
	u := User{ID: 1, Email: "test@test.com", Role: RoleUser}

	data, err := json.Marshal(u)
	if err != nil {
		t.Fatalf("json.Marshal: %v", err)
	}

	s := string(data)
	if !strings.Contains(s, `"email_verified":false`) {
		t.Errorf("expected email_verified=false in %s", s)
	}
	if !strings.Contains(s, `"totp_enabled":false`) {
		t.Errorf("expected totp_enabled=false in %s", s)
	}
	if !strings.Contains(s, `"must_change_password":false`) {
		t.Errorf("expected must_change_password=false in %s", s)
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

// --- VerifyEmail handler tests ---

func TestHandleVerifyEmail_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleVerifyEmail(deps)

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
			wantSubstr: "token and password required",
		},
		{
			name:       "missing password",
			body:       `{"token":"abc"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "token and password required",
		},
		{
			name:       "short password",
			body:       `{"token":"abc","password":"short"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "password must be at least 8 characters",
		},
		{
			name:       "missing token",
			body:       `{"password":"longpassword"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "token and password required",
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
			req := httptest.NewRequest(http.MethodPost, "/api/auth/verify-email", strings.NewReader(tt.body))
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

// --- Verify2FA handler tests ---

func TestHandleVerify2FA_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleVerify2FA(deps)

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
			wantSubstr: "mfa_token and code required",
		},
		{
			name:       "missing code",
			body:       `{"mfa_token":"abc"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "mfa_token and code required",
		},
		{
			name:       "missing mfa_token",
			body:       `{"code":"123456"}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "mfa_token and code required",
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
			req := httptest.NewRequest(http.MethodPost, "/api/auth/verify-2fa", strings.NewReader(tt.body))
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

// --- Setup2FA handler tests ---

func TestHandleSetup2FA_RequiresAuth(t *testing.T) {
	deps := testDeps()
	handler := HandleSetup2FA(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/setup", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleSetup2FA_NoEncryptionKey(t *testing.T) {
	deps := testDeps()
	deps.EncryptionKey = nil
	handler := HandleSetup2FA(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/setup", nil)
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want %d", w.Code, http.StatusServiceUnavailable)
	}
	if !strings.Contains(w.Body.String(), "encryption key not configured") {
		t.Errorf("body %q does not mention encryption key", w.Body.String())
	}
}

func TestHandleSetup2FA_AlreadyEnabled(t *testing.T) {
	deps := testDepsWithKey()
	handler := HandleSetup2FA(deps)

	user := &User{ID: 1, Email: "user@test.com", Role: RoleUser, TOTPEnabled: true}
	ctx := context.WithValue(context.Background(), userContextKey, user)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/setup", nil)
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("status = %d, want %d", w.Code, http.StatusConflict)
	}
	if !strings.Contains(w.Body.String(), "already enabled") {
		t.Errorf("body %q does not contain 'already enabled'", w.Body.String())
	}
}

// --- Confirm2FA handler tests ---

func TestHandleConfirm2FA_RequiresAuth(t *testing.T) {
	deps := testDeps()
	handler := HandleConfirm2FA(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/confirm",
		strings.NewReader(`{"code":"123456"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleConfirm2FA_AlreadyEnabled(t *testing.T) {
	deps := testDeps()
	handler := HandleConfirm2FA(deps)

	user := &User{ID: 1, Email: "user@test.com", Role: RoleUser, TOTPEnabled: true}
	ctx := context.WithValue(context.Background(), userContextKey, user)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/confirm",
		strings.NewReader(`{"code":"123456"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("status = %d, want %d", w.Code, http.StatusConflict)
	}
}

func TestHandleConfirm2FA_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleConfirm2FA(deps)

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "empty code",
			body:       `{"code":""}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "code required",
		},
		{
			name:       "empty body",
			body:       `{}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "code required",
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
			req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/confirm", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(userCtx())
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

// --- DeleteAccount handler tests ---

func TestHandleDeleteAccount_RequiresAuth(t *testing.T) {
	deps := testDeps()
	handler := HandleDeleteAccount(deps)

	req := httptest.NewRequest(http.MethodDelete, "/api/auth/account", strings.NewReader(`{"password":"test1234"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleDeleteAccount_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleDeleteAccount(deps)

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "empty password",
			body:       `{}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "password required",
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
			req := httptest.NewRequest(http.MethodDelete, "/api/auth/account", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(userCtx())
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

func TestHandleDeleteAccount_WrongPassword(t *testing.T) {
	deps := testDeps()
	handler := HandleDeleteAccount(deps)

	req := httptest.NewRequest(http.MethodDelete, "/api/auth/account",
		strings.NewReader(`{"password":"wrongpassword"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if !strings.Contains(w.Body.String(), "incorrect password") {
		t.Errorf("body %q does not contain 'incorrect password'", w.Body.String())
	}
}

// --- Disable2FA handler tests ---

func TestHandleDisable2FA_RequiresAuth(t *testing.T) {
	deps := testDeps()
	handler := HandleDisable2FA(deps)

	req := httptest.NewRequest(http.MethodDelete, "/api/auth/2fa",
		strings.NewReader(`{"password":"test1234"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleDisable2FA_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleDisable2FA(deps)

	req := httptest.NewRequest(http.MethodDelete, "/api/auth/2fa", strings.NewReader(`{}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d (body: %s)", w.Code, http.StatusBadRequest, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "password required") {
		t.Errorf("body %q does not contain 'password required'", w.Body.String())
	}
}

func TestHandleDisable2FA_WrongPassword(t *testing.T) {
	deps := testDeps()
	handler := HandleDisable2FA(deps)

	req := httptest.NewRequest(http.MethodDelete, "/api/auth/2fa",
		strings.NewReader(`{"password":"wrongpassword"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if !strings.Contains(w.Body.String(), "incorrect password") {
		t.Errorf("body %q does not contain 'incorrect password'", w.Body.String())
	}
}

// --- RegenerateRecoveryCodes handler tests ---

func TestHandleRegenerateRecoveryCodes_RequiresAuth(t *testing.T) {
	deps := testDeps()
	handler := HandleRegenerateRecoveryCodes(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/recovery-codes",
		strings.NewReader(`{"password":"test1234"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleRegenerateRecoveryCodes_Requires2FAEnabled(t *testing.T) {
	deps := testDeps()
	handler := HandleRegenerateRecoveryCodes(deps)

	// User without 2FA enabled
	user := &User{ID: 1, Email: "user@test.com", Role: RoleUser, TOTPEnabled: false}
	ctx := context.WithValue(context.Background(), userContextKey, user)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/recovery-codes",
		strings.NewReader(`{"password":"test1234"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(ctx)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "2FA is not enabled") {
		t.Errorf("body %q does not contain '2FA is not enabled'", w.Body.String())
	}
}

func TestHandleRegenerateRecoveryCodes_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleRegenerateRecoveryCodes(deps)

	user := &User{ID: 1, Email: "user@test.com", Role: RoleUser, TOTPEnabled: true, PasswordHash: mustHash("test1234")}
	ctx := context.WithValue(context.Background(), userContextKey, user)

	tests := []struct {
		name       string
		body       string
		wantStatus int
		wantSubstr string
	}{
		{
			name:       "empty password",
			body:       `{}`,
			wantStatus: http.StatusBadRequest,
			wantSubstr: "password required",
		},
		{
			name:       "wrong password",
			body:       `{"password":"wrongpass"}`,
			wantStatus: http.StatusUnauthorized,
			wantSubstr: "incorrect password",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/auth/2fa/recovery-codes", strings.NewReader(tt.body))
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

// --- AdminDeleteUser handler tests ---

func TestHandleAdminDeleteUser_RequiresAdmin(t *testing.T) {
	deps := testDeps()
	handler := HandleAdminDeleteUser(deps)

	req := httptest.NewRequest(http.MethodDelete, "/api/auth/users/5", nil)
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

// --- ResendVerification handler tests ---

func TestHandleResendVerification_RequiresAdmin(t *testing.T) {
	deps := testDeps()
	handler := HandleResendVerification(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/resend-verification/5", nil)
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

// --- AdminRequire2FA handler tests ---

func TestHandleAdminRequire2FA_RequiresAdmin(t *testing.T) {
	deps := testDeps()
	handler := HandleAdminRequire2FA(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/settings/require-2fa",
		strings.NewReader(`{"require":true}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusForbidden {
		t.Errorf("status = %d, want %d", w.Code, http.StatusForbidden)
	}
}

func TestHandleAdminRequire2FA_Validation(t *testing.T) {
	deps := testDeps()
	handler := HandleAdminRequire2FA(deps)

	req := httptest.NewRequest(http.MethodPost, "/api/auth/settings/require-2fa",
		strings.NewReader(`{bad`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(adminCtx())
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

// --- Validation helper tests ---

func TestValidateEmail(t *testing.T) {
	tests := []struct {
		email string
		valid bool
	}{
		{"user@example.com", true},
		{"a@b.co", true},
		{"user+tag@domain.org", true},
		{"", false},
		{"noatsign", false},
		{"@domain.com", false},
		{"user@", false},
		{"user@nodot", false},
		{"user@domain.", false},
	}

	for _, tt := range tests {
		err := ValidateEmail(tt.email)
		if tt.valid && err != nil {
			t.Errorf("ValidateEmail(%q) = %v, want nil", tt.email, err)
		}
		if !tt.valid && err == nil {
			t.Errorf("ValidateEmail(%q) = nil, want error", tt.email)
		}
	}
}

func TestValidatePassword(t *testing.T) {
	tests := []struct {
		pw    string
		valid bool
	}{
		{"12345678", true},
		{"longpassword", true},
		{"abcdefgh", true},
		{"", false},
		{"short", false},
		{"1234567", false},
	}

	for _, tt := range tests {
		err := ValidatePassword(tt.pw)
		if tt.valid && err != nil {
			t.Errorf("ValidatePassword(%q) = %v, want nil", tt.pw, err)
		}
		if !tt.valid && err == nil {
			t.Errorf("ValidatePassword(%q) = nil, want error", tt.pw)
		}
	}
}

// --- generateRecoveryCodes tests ---

func TestGenerateRecoveryCodes(t *testing.T) {
	codes, hashes, err := generateRecoveryCodes(10)
	if err != nil {
		t.Fatalf("generateRecoveryCodes: %v", err)
	}

	if len(codes) != 10 {
		t.Errorf("got %d codes, want 10", len(codes))
	}
	if len(hashes) != 10 {
		t.Errorf("got %d hashes, want 10", len(hashes))
	}

	// Each code should be 8 hex chars
	for i, code := range codes {
		if len(code) != 8 {
			t.Errorf("code[%d] = %q, want 8 chars", i, code)
		}
	}

	// Each hash should be a valid bcrypt hash
	for i, hash := range hashes {
		if !strings.HasPrefix(hash, "$2a$") {
			t.Errorf("hash[%d] = %q, want bcrypt prefix", i, hash)
		}
	}

	// Codes should match their hashes
	for i, code := range codes {
		if !CheckPassword(hashes[i], code) {
			t.Errorf("code[%d] %q does not match hash[%d]", i, code, i)
		}
	}

	// All codes should be unique
	seen := make(map[string]bool)
	for _, code := range codes {
		if seen[code] {
			t.Errorf("duplicate recovery code: %q", code)
		}
		seen[code] = true
	}
}

func TestGenerateRecoveryCodes_DifferentEachCall(t *testing.T) {
	codes1, _, _ := generateRecoveryCodes(3)
	codes2, _, _ := generateRecoveryCodes(3)

	allSame := true
	for i := range codes1 {
		if codes1[i] != codes2[i] {
			allSame = false
			break
		}
	}
	if allSame {
		t.Error("two calls to generateRecoveryCodes produced identical codes")
	}
}

// --- userIDPtr helper tests ---

func TestUserIDPtr(t *testing.T) {
	if got := userIDPtr(nil); got != nil {
		t.Errorf("userIDPtr(nil) = %v, want nil", got)
	}

	user := &User{ID: 42}
	ptr := userIDPtr(user)
	if ptr == nil {
		t.Fatal("userIDPtr(&User{ID:42}) = nil, want non-nil")
	}
	if *ptr != 42 {
		t.Errorf("*userIDPtr(&User{ID:42}) = %d, want 42", *ptr)
	}
}

// --- sessionCookie tests ---

func TestSessionCookie_Properties(t *testing.T) {
	expires := time.Now().Add(24 * time.Hour)
	c := sessionCookie("test-token", expires)

	if c.Name != "session" {
		t.Errorf("name = %q, want session", c.Name)
	}
	if c.Value != "test-token" {
		t.Errorf("value = %q, want test-token", c.Value)
	}
	if c.Path != "/" {
		t.Errorf("path = %q, want /", c.Path)
	}
	if !c.HttpOnly {
		t.Error("expected HttpOnly = true")
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Errorf("SameSite = %d, want SameSiteLaxMode", c.SameSite)
	}
}

// --- Spent codes, temporary passwords and password re-checks ---

func TestTOTPStep_MatchesTheDriftWindowAndNothingElse(t *testing.T) {
	key, err := totp.Generate(totp.GenerateOpts{Issuer: "test", AccountName: "a@b.ch"})
	if err != nil {
		t.Fatal(err)
	}
	now := time.Unix(1_800_000_000, 0)
	current := now.Unix() / totpPeriod

	for _, offset := range []int64{-1, 0, 1} {
		code, _ := totp.GenerateCode(key.Secret(), time.Unix((current+offset)*totpPeriod, 0))
		step, ok := totpStep(key.Secret(), code, now)
		if !ok || step != current+offset {
			t.Errorf("offset %d: step=%d ok=%v, want %d true", offset, step, ok, current+offset)
		}
	}
	// Two steps out is outside the window totp.Validate allows.
	stale, _ := totp.GenerateCode(key.Secret(), time.Unix((current-2)*totpPeriod, 0))
	if _, ok := totpStep(key.Secret(), stale, now); ok {
		t.Error("a code two steps old was accepted")
	}
	for _, bad := range []string{"", "12345", "1234567", "abcdef"} {
		if _, ok := totpStep(key.Secret(), bad, now); ok {
			t.Errorf("%q was accepted", bad)
		}
	}
}

func TestLooksLikeRecoveryCode(t *testing.T) {
	for code, want := range map[string]bool{
		"0a1b2c3d": true,
		"123456":   false, // a TOTP code: never costs a bcrypt
		"0A1B2C3D": false, // generateRecoveryCodes writes lower case only
		"0a1b2c3":  false,
		"0a1b2c3g": false,
		"":         false,
	} {
		if got := looksLikeRecoveryCode(code); got != want {
			t.Errorf("looksLikeRecoveryCode(%q) = %v, want %v", code, got, want)
		}
	}
}

func TestTempPasswordExpired(t *testing.T) {
	now := time.Now()
	past, future := now.Add(-time.Minute), now.Add(time.Minute)
	for _, tc := range []struct {
		name    string
		must    bool
		expires *time.Time
		want    bool
	}{
		{"a password the user chose", false, nil, false},
		{"handed out before expiry existed", true, nil, false},
		{"still in time", true, &future, false},
		{"past its time", true, &past, true},
		{"changed, with a stale deadline", false, &past, false},
	} {
		u := &User{MustChangePassword: tc.must, TempPasswordExpiresAt: tc.expires}
		if got := u.TempPasswordExpired(now); got != tc.want {
			t.Errorf("%s: got %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestPasswordMatches_NoAccountTakesAsLongAsAWrongPassword(t *testing.T) {
	user := &User{PasswordHash: mustHash("right-pass-1")}
	dummyHash() // computed once, up front, as the first real request would

	start := time.Now()
	if passwordMatches(user, "wrong-pass") {
		t.Fatal("a wrong password matched")
	}
	wrong := time.Since(start)

	start = time.Now()
	if passwordMatches(nil, "wrong-pass") {
		t.Fatal("no account matched")
	}
	missing := time.Since(start)

	// Both are one bcrypt comparison at the same cost. Skipping it made the
	// second a hundred times faster; half is far outside that and well
	// inside scheduling noise.
	if missing < wrong/2 {
		t.Errorf("no account took %v, a wrong password %v: the difference tells which addresses exist", missing, wrong)
	}
}

func TestConfirmPassword_IsLimitedPerAccount(t *testing.T) {
	deps := testDeps()
	deps.PasswordCheckLimiter = NewLoginRateLimiter(2, time.Minute)

	deleteWith := func(password string) *httptest.ResponseRecorder {
		req := httptest.NewRequest(http.MethodDelete, "/api/auth/account",
			strings.NewReader(`{"password":"`+password+`"}`))
		req = req.WithContext(userCtx())
		w := httptest.NewRecorder()
		HandleDeleteAccount(deps).ServeHTTP(w, req)
		return w
	}

	for i := 0; i < 2; i++ {
		if w := deleteWith("wrong-pass"); w.Code != http.StatusUnauthorized {
			t.Fatalf("guess %d = %d, want 401", i+1, w.Code)
		}
	}
	// Refused before the password is looked at, the right one included.
	w := deleteWith("user1234")
	if w.Code != http.StatusTooManyRequests {
		t.Fatalf("third try = %d, want 429 (body: %s)", w.Code, w.Body.String())
	}
	if !strings.Contains(w.Body.String(), "AUTH-013") {
		t.Errorf("body %q does not carry AUTH-013", w.Body.String())
	}
}

// --- Administrators and 2FA ---

func TestAdminOnly_AnAdminWithout2FAIsRefused(t *testing.T) {
	list := func(deps *HandlerDeps, totp bool) *httptest.ResponseRecorder {
		admin := &User{ID: 1, Email: "admin@test.com", Role: RoleAdmin, EmailVerified: true, TOTPEnabled: totp}
		req := httptest.NewRequest(http.MethodGet, "/api/auth/lockouts", nil)
		req = req.WithContext(ContextWithUser(context.Background(), admin))
		w := httptest.NewRecorder()
		HandleListLockouts(deps).ServeHTTP(w, req)
		return w
	}

	if w := list(testDepsWithKey(), false); w.Code != http.StatusForbidden || !strings.Contains(w.Body.String(), "AUTH-043") {
		t.Errorf("admin without 2FA = %d %s, want 403 AUTH-043", w.Code, w.Body.String())
	}
	if w := list(testDepsWithKey(), true); w.Code != http.StatusOK {
		t.Errorf("admin with 2FA = %d %s, want 200", w.Code, w.Body.String())
	}
	// Where 2FA cannot be enabled at all, requiring it would lock every
	// admin out of everything.
	if w := list(testDeps(), false); w.Code != http.StatusOK {
		t.Errorf("admin without 2FA, none available = %d, want 200", w.Code)
	}
}

func TestHandleListLockouts_ListsWhoIsKeptOut(t *testing.T) {
	deps := testDeps()
	deps.LoginEmailLimiter = NewLoginRateLimiter(1, time.Hour)
	deps.LoginEmailLimiter.Reserve("anna@example.ch")

	req := httptest.NewRequest(http.MethodGet, "/api/auth/lockouts", nil).WithContext(adminCtx())
	w := httptest.NewRecorder()
	HandleListLockouts(deps).ServeHTTP(w, req)

	var body struct {
		Lockouts []LockoutEntry `json:"lockouts"`
	}
	json.NewDecoder(w.Body).Decode(&body)
	if len(body.Lockouts) != 1 || body.Lockouts[0].Kind != "address" || body.Lockouts[0].Key != "anna@example.ch" {
		t.Errorf("lockouts = %+v, want the one address", body.Lockouts)
	}
}

func TestHandleListLockouts_NotForUsers(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/api/auth/lockouts", nil).WithContext(userCtx())
	w := httptest.NewRecorder()
	HandleListLockouts(testDeps()).ServeHTTP(w, req)
	if w.Code != http.StatusForbidden {
		t.Errorf("a user = %d, want 403", w.Code)
	}
}

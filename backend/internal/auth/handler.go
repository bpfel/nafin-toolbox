package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/email"
	"github.com/go-chi/chi/v5"
	"github.com/pquerna/otp/totp"
)

// HandlerDeps holds shared dependencies for auth handlers.
type HandlerDeps struct {
	Store              *Store
	LoginLimiter       *LoginRateLimiter
	SetupLimiter       *LoginRateLimiter
	VerifyEmailLimiter *LoginRateLimiter
	Verify2FALimiter   *LoginRateLimiter
	EmailSender        email.Sender
	EncryptionKey      []byte // 32-byte AES key, nil if 2FA not available
	AppURL             string
}

func HandleLogin(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.LoginLimiter.Check(r) {
			w.Header().Set("Retry-After", "900")
			http.Error(w, `{"error":"too many login attempts"}`, http.StatusTooManyRequests)
			return
		}

		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Email == "" || req.Password == "" {
			http.Error(w, `{"error":"email and password required"}`, http.StatusBadRequest)
			return
		}

		user, err := deps.Store.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if user == nil || !CheckPassword(user.PasswordHash, req.Password) {
			deps.LoginLimiter.RecordFailure(r)
			uid := userIDPtr(user)
			deps.Store.LogAudit(r.Context(), uid, AuditLoginFailed, r, map[string]any{"email": req.Email})
			http.Error(w, `{"error":"invalid credentials"}`, http.StatusUnauthorized)
			return
		}

		// Reject unverified email users
		if !user.EmailVerified {
			http.Error(w, `{"error":"email not verified"}`, http.StatusForbidden)
			return
		}

		// If TOTP is enabled, issue MFA challenge instead of session
		if user.TOTPEnabled {
			mfaToken, err := deps.Store.CreateMFAChallenge(r.Context(), user.ID)
			if err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{
				"requires_2fa": true,
				"mfa_token":    mfaToken,
			})
			return
		}

		// No 2FA — create session directly
		if err := deps.Store.DeleteUserSessions(r.Context(), user.ID); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		sess, err := deps.Store.CreateSession(r.Context(), user.ID)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditLoginSuccess, r, nil)
		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}

func HandleLogout(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		cookie, err := r.Cookie("session")
		if err == nil {
			deps.Store.DeleteSession(r.Context(), cookie.Value)
		}
		if user != nil {
			deps.Store.LogAudit(r.Context(), &user.ID, AuditLogout, r, nil)
		}

		http.SetCookie(w, &http.Cookie{
			Name:     "session",
			Value:    "",
			Path:     "/",
			HttpOnly: true,
			Secure:   isSecureCookie(),
			SameSite: http.SameSiteLaxMode,
			MaxAge:   -1,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

func HandleMe(w http.ResponseWriter, r *http.Request) {
	user := UserFromContext(r.Context())
	if user == nil {
		http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// HandleInvite creates a new user. Requires admin role.
// With SMTP configured: sends verification email (user sets own password).
// Without SMTP: falls back to admin-set password.
func HandleInvite(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		var req InviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Email == "" {
			http.Error(w, `{"error":"email required"}`, http.StatusBadRequest)
			return
		}

		if err := ValidateEmail(req.Email); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		role := RoleUser
		if req.Role == RoleAdmin {
			role = RoleAdmin
		}

		// Check if email sending is available
		_, isLogSender := deps.EmailSender.(*email.LogSender)
		smtpAvailable := !isLogSender

		// Validate password early in fallback mode (before DB lookup)
		if !smtpAvailable {
			if req.Password == "" {
				http.Error(w, `{"error":"password required (email not configured)"}`, http.StatusBadRequest)
				return
			}
			if err := ValidatePassword(req.Password); err != nil {
				http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
				return
			}
		}

		existing, err := deps.Store.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if existing != nil {
			http.Error(w, `{"error":"user already exists"}`, http.StatusConflict)
			return
		}

		if smtpAvailable {
			// Email-based invite: create user with empty password, unverified
			user, err := deps.Store.CreateUserFull(r.Context(), req.Email, "", role, false, false)
			if err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}

			// Create verification token
			rawToken, err := deps.Store.CreateVerificationToken(r.Context(), user.ID, "email_verify")
			if err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}

			// Send invite email
			htmlBody, textBody, err := email.RenderInviteEmail(deps.AppURL, rawToken)
			if err != nil {
				log.Printf("rendering invite email: %v", err)
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}

			if err := deps.EmailSender.Send(r.Context(), req.Email, "You've been invited to Finance Tracker", htmlBody, textBody); err != nil {
				log.Printf("sending invite email: %v", err)
				http.Error(w, `{"error":"failed to send invite email"}`, http.StatusInternalServerError)
				return
			}

			deps.Store.LogAudit(r.Context(), &caller.ID, AuditUserInvited, r, map[string]any{
				"invited_user_id": user.ID,
				"invited_email":   user.Email,
				"method":          "email",
			})

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(user)
		} else {
			// Fallback: admin sets password (already validated above)
			hash, err := HashPassword(req.Password)
			if err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}

			user, err := deps.Store.CreateUser(r.Context(), req.Email, hash, role, true)
			if err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}

			deps.Store.LogAudit(r.Context(), &caller.ID, AuditUserInvited, r, map[string]any{
				"invited_user_id": user.ID,
				"invited_email":   user.Email,
				"method":          "password",
			})

			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusCreated)
			json.NewEncoder(w).Encode(user)
		}
	}
}

// HandleListUsers returns all users. Requires admin role.
func HandleListUsers(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		users, err := deps.Store.ListUsers(r.Context())
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if users == nil {
			users = []User{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(users)
	}
}

// HandleChangePassword lets the authenticated user change their password.
func HandleChangePassword(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var req ChangePasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.CurrentPassword == "" || req.NewPassword == "" {
			http.Error(w, `{"error":"current and new password required"}`, http.StatusBadRequest)
			return
		}

		if !CheckPassword(user.PasswordHash, req.CurrentPassword) {
			http.Error(w, `{"error":"current password is incorrect"}`, http.StatusUnauthorized)
			return
		}

		if err := ValidatePassword(req.NewPassword); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		newHash, err := HashPassword(req.NewPassword)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.UpdatePassword(r.Context(), user.ID, newHash); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.ClearMustChangePassword(r.Context(), user.ID); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.DeleteUserSessions(r.Context(), user.ID); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditPasswordChanged, r, nil)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// HandleSetup creates the first user as admin. Only works when no users exist.
func HandleSetup(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.SetupLimiter.Allow(r) {
			w.Header().Set("Retry-After", "900")
			http.Error(w, `{"error":"too many attempts"}`, http.StatusTooManyRequests)
			return
		}

		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Email == "" || req.Password == "" {
			http.Error(w, `{"error":"email and password required"}`, http.StatusBadRequest)
			return
		}

		if err := ValidateEmail(req.Email); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}
		if err := ValidatePassword(req.Password); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		hash, err := HashPassword(req.Password)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		user, err := deps.Store.CreateFirstUser(r.Context(), req.Email, hash)
		if err == ErrSetupAlreadyDone {
			http.Error(w, `{"error":"setup already completed"}`, http.StatusForbidden)
			return
		}
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		sess, err := deps.Store.CreateSession(r.Context(), user.ID)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditLoginSuccess, r, map[string]any{"method": "setup"})

		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(user)
	}
}

// HandleNeedsSetup checks if any users exist (public endpoint).
func HandleNeedsSetup(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		count, err := deps.Store.UserCount(r.Context())
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"needs_setup": count == 0})
	}
}

// HandleVerifyEmail accepts a verification token + password, verifies email, sets password, auto-logs in.
func HandleVerifyEmail(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.VerifyEmailLimiter.Check(r) {
			w.Header().Set("Retry-After", "900")
			http.Error(w, `{"error":"too many attempts"}`, http.StatusTooManyRequests)
			return
		}

		var req VerifyEmailRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Token == "" || req.Password == "" {
			http.Error(w, `{"error":"token and password required"}`, http.StatusBadRequest)
			return
		}

		if err := ValidatePassword(req.Password); err != nil {
			http.Error(w, `{"error":"`+err.Error()+`"}`, http.StatusBadRequest)
			return
		}

		userID, err := deps.Store.ValidateVerificationToken(r.Context(), req.Token, "email_verify")
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if userID == 0 {
			deps.VerifyEmailLimiter.RecordFailure(r)
			http.Error(w, `{"error":"invalid or expired token"}`, http.StatusBadRequest)
			return
		}

		hash, err := HashPassword(req.Password)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.UpdatePassword(r.Context(), userID, hash); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.SetEmailVerified(r.Context(), userID); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		// Clean up tokens
		deps.Store.DeleteVerificationTokens(r.Context(), userID, "email_verify")

		// Auto-login
		sess, err := deps.Store.CreateSession(r.Context(), userID)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		user, err := deps.Store.GetUserByID(r.Context(), userID)
		if err != nil || user == nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		deps.Store.LogAudit(r.Context(), &userID, AuditEmailVerified, r, nil)
		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}

// HandleVerify2FA validates a TOTP code or recovery code after password authentication.
func HandleVerify2FA(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.Verify2FALimiter.Check(r) {
			w.Header().Set("Retry-After", "900")
			http.Error(w, `{"error":"too many attempts"}`, http.StatusTooManyRequests)
			return
		}

		var req Verify2FARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.MFAToken == "" || req.Code == "" {
			http.Error(w, `{"error":"mfa_token and code required"}`, http.StatusBadRequest)
			return
		}

		userID, err := deps.Store.ValidateMFAChallenge(r.Context(), req.MFAToken)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if userID == 0 {
			http.Error(w, `{"error":"invalid or expired MFA token"}`, http.StatusUnauthorized)
			return
		}

		// Try TOTP code first
		valid, err := validateTOTPCode(r.Context(), deps, userID, req.Code)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if !valid {
			// Try recovery code
			valid, err = tryRecoveryCode(r.Context(), deps, userID, req.Code)
			if err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}
		}

		if !valid {
			deps.Verify2FALimiter.RecordFailure(r)
			deps.Store.LogAudit(r.Context(), &userID, Audit2FAFailed, r, nil)
			http.Error(w, `{"error":"invalid code"}`, http.StatusUnauthorized)
			return
		}

		// Create session
		if err := deps.Store.DeleteUserSessions(r.Context(), userID); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		sess, err := deps.Store.CreateSession(r.Context(), userID)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		user, err := deps.Store.GetUserByID(r.Context(), userID)
		if err != nil || user == nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		deps.Store.LogAudit(r.Context(), &userID, AuditLoginSuccess, r, map[string]any{"method": "2fa"})
		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}

// HandleSetup2FA generates a TOTP secret and returns the otpauth:// URI.
func HandleSetup2FA(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		if deps.EncryptionKey == nil {
			http.Error(w, `{"error":"2FA not available (encryption key not configured)"}`, http.StatusServiceUnavailable)
			return
		}

		if user.TOTPEnabled {
			http.Error(w, `{"error":"2FA is already enabled"}`, http.StatusConflict)
			return
		}

		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      "Finance Tracker",
			AccountName: user.Email,
		})
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		// Encrypt and store the secret
		encrypted, err := Encrypt([]byte(key.Secret()), deps.EncryptionKey)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.SaveTOTPSecret(r.Context(), user.ID, encrypted); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(Enable2FAResponse{
			Secret: key.Secret(),
			URL:    key.URL(),
		})
	}
}

// HandleConfirm2FA verifies the TOTP code and enables 2FA, returning recovery codes.
func HandleConfirm2FA(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		if user.TOTPEnabled {
			http.Error(w, `{"error":"2FA is already enabled"}`, http.StatusConflict)
			return
		}

		var req Confirm2FARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Code == "" {
			http.Error(w, `{"error":"code required"}`, http.StatusBadRequest)
			return
		}

		// Validate code against stored secret
		valid, err := validateTOTPCode(r.Context(), deps, user.ID, req.Code)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if !valid {
			http.Error(w, `{"error":"invalid code"}`, http.StatusBadRequest)
			return
		}

		// Enable 2FA
		if err := deps.Store.SetTOTPEnabled(r.Context(), user.ID, true); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		// Generate recovery codes
		codes, hashes, err := generateRecoveryCodes(10)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.SaveRecoveryCodes(r.Context(), user.ID, hashes); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, Audit2FAEnabled, r, nil)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(Confirm2FAResponse{RecoveryCodes: codes})
	}
}

// HandleDisable2FA disables 2FA. Requires current password.
func HandleDisable2FA(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var req Disable2FARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Password == "" {
			http.Error(w, `{"error":"password required"}`, http.StatusBadRequest)
			return
		}

		if !CheckPassword(user.PasswordHash, req.Password) {
			http.Error(w, `{"error":"incorrect password"}`, http.StatusUnauthorized)
			return
		}

		if err := deps.Store.SetTOTPEnabled(r.Context(), user.ID, false); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		deps.Store.DeleteTOTPSecret(r.Context(), user.ID)
		deps.Store.DeleteRecoveryCodes(r.Context(), user.ID)

		deps.Store.LogAudit(r.Context(), &user.ID, Audit2FADisabled, r, nil)
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// HandleRegenerateRecoveryCodes generates new recovery codes. Requires password.
func HandleRegenerateRecoveryCodes(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		if !user.TOTPEnabled {
			http.Error(w, `{"error":"2FA is not enabled"}`, http.StatusBadRequest)
			return
		}

		var req RegenerateRecoveryCodesRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Password == "" {
			http.Error(w, `{"error":"password required"}`, http.StatusBadRequest)
			return
		}

		if !CheckPassword(user.PasswordHash, req.Password) {
			http.Error(w, `{"error":"incorrect password"}`, http.StatusUnauthorized)
			return
		}

		codes, hashes, err := generateRecoveryCodes(10)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.SaveRecoveryCodes(r.Context(), user.ID, hashes); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(Confirm2FAResponse{RecoveryCodes: codes})
	}
}

// HandleDeleteAccount lets a user delete their own account. Requires password.
func HandleDeleteAccount(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var req DeleteAccountRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Password == "" {
			http.Error(w, `{"error":"password required"}`, http.StatusBadRequest)
			return
		}

		if !CheckPassword(user.PasswordHash, req.Password) {
			http.Error(w, `{"error":"incorrect password"}`, http.StatusUnauthorized)
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditUserDeleted, r, map[string]any{"self": true})

		if err := deps.Store.DeleteUser(r.Context(), user.ID); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		http.SetCookie(w, &http.Cookie{
			Name: "session", Value: "", Path: "/",
			HttpOnly: true, Secure: isSecureCookie(),
			SameSite: http.SameSiteLaxMode, MaxAge: -1,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// HandleAdminDeleteUser lets an admin delete another user.
func HandleAdminDeleteUser(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		idStr := chi.URLParam(r, "id")
		targetID, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, `{"error":"invalid user ID"}`, http.StatusBadRequest)
			return
		}

		if targetID == caller.ID {
			http.Error(w, `{"error":"cannot delete yourself via admin endpoint"}`, http.StatusBadRequest)
			return
		}

		deps.Store.LogAudit(r.Context(), &caller.ID, AuditUserDeleted, r, map[string]any{
			"deleted_user_id": targetID,
		})

		if err := deps.Store.DeleteUser(r.Context(), targetID); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// HandleAdminResetPassword lets an admin reset another user's password.
// Generates a random temporary password, sets must_change_password = true.
func HandleAdminResetPassword(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		idStr := chi.URLParam(r, "id")
		targetID, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, `{"error":"invalid user ID"}`, http.StatusBadRequest)
			return
		}

		if targetID == caller.ID {
			http.Error(w, `{"error":"cannot reset your own password via admin endpoint"}`, http.StatusBadRequest)
			return
		}

		target, err := deps.Store.GetUserByID(r.Context(), targetID)
		if err != nil || target == nil {
			http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
			return
		}

		// Generate random 16-char temporary password
		tempBytes := make([]byte, 12)
		if _, err := rand.Read(tempBytes); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		tempPassword := hex.EncodeToString(tempBytes)[:16]

		hash, err := HashPassword(tempPassword)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.UpdatePassword(r.Context(), targetID, hash); err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.Store.SetMustChangePassword(r.Context(), targetID); err != nil {
			log.Printf("setting must_change_password: %v", err)
		}

		deps.Store.LogAudit(r.Context(), &caller.ID, AuditPasswordReset, r, map[string]any{
			"target_user_id": targetID,
			"target_email":   target.Email,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":        "ok",
			"temp_password": tempPassword,
		})
	}
}

// HandleResendVerification regenerates and resends invite email for an unverified user.
func HandleResendVerification(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		idStr := chi.URLParam(r, "id")
		targetID, err := strconv.Atoi(idStr)
		if err != nil {
			http.Error(w, `{"error":"invalid user ID"}`, http.StatusBadRequest)
			return
		}

		user, err := deps.Store.GetUserByID(r.Context(), targetID)
		if err != nil || user == nil {
			http.Error(w, `{"error":"user not found"}`, http.StatusNotFound)
			return
		}

		if user.EmailVerified {
			http.Error(w, `{"error":"user already verified"}`, http.StatusBadRequest)
			return
		}

		// Delete old tokens and create new one
		deps.Store.DeleteVerificationTokens(r.Context(), user.ID, "email_verify")
		rawToken, err := deps.Store.CreateVerificationToken(r.Context(), user.ID, "email_verify")
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		htmlBody, textBody, err := email.RenderInviteEmail(deps.AppURL, rawToken)
		if err != nil {
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}

		if err := deps.EmailSender.Send(r.Context(), user.Email, "You've been invited to Finance Tracker", htmlBody, textBody); err != nil {
			log.Printf("resending invite email: %v", err)
			http.Error(w, `{"error":"failed to send email"}`, http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	}
}

// HandleAdminRequire2FA sets or clears the require_2fa app setting.
func HandleAdminRequire2FA(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		var req Require2FARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
			return
		}

		if req.Require {
			if err := deps.Store.SetSetting(r.Context(), "require_2fa", "true"); err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}
		} else {
			if err := deps.Store.DeleteSetting(r.Context(), "require_2fa"); err != nil {
				http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
				return
			}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"require_2fa": req.Require})
	}
}

// HandleGetSettings returns app settings relevant to the authenticated user.
func HandleGetSettings(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		require2fa, _ := deps.Store.GetSetting(r.Context(), "require_2fa")

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"require_2fa": require2fa == "true",
		})
	}
}

// HandleListAuditLogs returns paginated audit log entries. Requires admin role.
func HandleListAuditLogs(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			http.Error(w, `{"error":"admin access required"}`, http.StatusForbidden)
			return
		}

		limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
		offset, _ := strconv.Atoi(r.URL.Query().Get("offset"))
		eventFilter := r.URL.Query().Get("event")

		var userIDFilter *int
		if uidStr := r.URL.Query().Get("user_id"); uidStr != "" {
			if uid, err := strconv.Atoi(uidStr); err == nil {
				userIDFilter = &uid
			}
		}

		entries, total, err := deps.Store.ListAuditLogs(r.Context(), limit, offset, eventFilter, userIDFilter)
		if err != nil {
			log.Printf("audit log query error: %v", err)
			http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
			return
		}
		if entries == nil {
			entries = []AuditLogEntry{}
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{
			"entries": entries,
			"total":   total,
		})
	}
}

// ---- Helpers ----

func sessionCookie(token string, expires time.Time) *http.Cookie {
	return &http.Cookie{
		Name:     "session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
		Expires:  expires,
	}
}

func isSecureCookie() bool {
	return strings.EqualFold(os.Getenv("COOKIE_SECURE"), "true")
}

// ValidatePassword checks minimum password requirements.
func ValidatePassword(pw string) error {
	if len(pw) < 8 {
		return errShortPassword
	}
	return nil
}

// ValidateEmail checks that the email has a basic valid format.
func ValidateEmail(email string) error {
	at := strings.Index(email, "@")
	if at < 1 {
		return errInvalidEmail
	}
	domain := email[at+1:]
	if !strings.Contains(domain, ".") || strings.HasSuffix(domain, ".") {
		return errInvalidEmail
	}
	return nil
}

var (
	errShortPassword = &validationError{"password must be at least 8 characters"}
	errInvalidEmail  = &validationError{"invalid email address"}
)

type validationError struct {
	msg string
}

func (e *validationError) Error() string {
	return e.msg
}

func userIDPtr(u *User) *int {
	if u == nil {
		return nil
	}
	return &u.ID
}

// validateTOTPCode decrypts the stored secret and validates a TOTP code.
func validateTOTPCode(ctx context.Context, deps *HandlerDeps, userID int, code string) (bool, error) {
	if deps.EncryptionKey == nil {
		return false, nil
	}

	encrypted, err := deps.Store.GetTOTPSecret(ctx, userID)
	if err != nil {
		return false, err
	}
	if encrypted == "" {
		return false, nil
	}

	secret, err := Decrypt(encrypted, deps.EncryptionKey)
	if err != nil {
		return false, fmt.Errorf("decrypting TOTP secret: %w", err)
	}

	return totp.Validate(code, string(secret)), nil
}

// tryRecoveryCode checks if the code matches any unused recovery code.
func tryRecoveryCode(ctx context.Context, deps *HandlerDeps, userID int, code string) (bool, error) {
	codes, err := deps.Store.GetRecoveryCodes(ctx, userID)
	if err != nil {
		return false, err
	}

	for _, rc := range codes {
		if rc.Used {
			continue
		}
		if CheckPassword(rc.CodeHash, code) {
			if err := deps.Store.MarkRecoveryCodeUsed(ctx, rc.ID); err != nil {
				return false, err
			}
			deps.Store.LogAudit(ctx, &userID, AuditRecoveryCodeUsed, nil, nil)
			return true, nil
		}
	}

	return false, nil
}

// generateRecoveryCodes generates n recovery codes and their bcrypt hashes.
func generateRecoveryCodes(n int) ([]string, []string, error) {
	codes := make([]string, n)
	hashes := make([]string, n)

	for i := 0; i < n; i++ {
		b := make([]byte, 4)
		if _, err := rand.Read(b); err != nil {
			return nil, nil, err
		}
		code := hex.EncodeToString(b) // 8-char hex codes
		codes[i] = code

		hash, err := HashPassword(code)
		if err != nil {
			return nil, nil, err
		}
		hashes[i] = hash
	}

	return codes, hashes, nil
}

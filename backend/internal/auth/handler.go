package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/email"
	"github.com/go-chi/chi/v5"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/pquerna/otp/totp"
)

// HandlerDeps holds shared dependencies for auth handlers.
type HandlerDeps struct {
	Store *Store
	// Sign-in failures are counted twice: per client, against anyone guessing
	// across many accounts, and per client and account together, which is the
	// one that runs out first. The second is what keeps one person's typos
	// from locking out everyone else at the same address — a household
	// behind one router, the usual case for an app like this.
	LoginLimiter        *LoginRateLimiter
	LoginAccountLimiter *LoginRateLimiter
	SetupLimiter        *LoginRateLimiter
	VerifyEmailLimiter  *LoginRateLimiter
	Verify2FALimiter    *LoginRateLimiter
	EmailSender         email.Sender
	EncryptionKey       []byte // 32-byte AES key, nil if 2FA not available
	AppURL              string
	// Passkeys for the app's address; nil where the address cannot carry them
	// (an IP rather than a name). See NewWebAuthn.
	WebAuthn *webauthn.WebAuthn
}

func HandleLogin(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Email == "" || req.Password == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "email and password required")
			return
		}

		client := deps.LoginLimiter.ClientIP(r)
		account := client + "|" + strings.ToLower(strings.TrimSpace(req.Email))
		if !deps.LoginLimiter.CheckKey(client) || !deps.LoginAccountLimiter.CheckKey(account) {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many login attempts")
			return
		}

		user, err := deps.Store.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if user == nil || !CheckPassword(user.PasswordHash, req.Password) {
			deps.LoginLimiter.RecordFailureKey(client)
			deps.LoginAccountLimiter.RecordFailureKey(account)
			uid := userIDPtr(user)
			deps.Store.LogAudit(r.Context(), uid, AuditLoginFailed, r, map[string]any{"email": req.Email})
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "invalid credentials")
			return
		}

		deps.LoginAccountLimiter.Forget(account)

		// Reject unverified email users
		if !user.EmailVerified {
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "email not verified")
			return
		}

		// If TOTP is enabled, issue MFA challenge instead of session
		if user.TOTPEnabled {
			mfaToken, err := deps.Store.CreateMFAChallenge(r.Context(), user.ID)
			if err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(map[string]any{
				"requires_2fa": true,
				"mfa_token":    mfaToken,
			})
			return
		}

		// No 2FA — create session directly. See startSession.
		sess, err := startSession(r.Context(), deps, user, nil)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditLoginSuccess, r, nil)
		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(user)
	}
}

// startSession signs a user in on this device.
//
// A user's session is added alongside the ones they already have: signing in
// on a phone used to sign the laptop out without a word, so a person with two
// devices could not use both. Ending every session is what a password change,
// an admin reset and "sign out everywhere" are for.
//
// An administrator keeps exactly one. Their sessions manage other people's
// accounts and read the audit log, and a second one left open on some other
// machine is a risk with nothing to show for it — so signing in as an admin
// ends any other admin session first, as every sign-in used to.
//
// passkeyID is the passkey the sign-in used, or nil for a password.
func startSession(ctx context.Context, deps *HandlerDeps, user *User, passkeyID *int) (*Session, error) {
	if user.IsAdmin() {
		if err := deps.Store.DeleteUserSessions(ctx, user.ID); err != nil {
			return nil, err
		}
	}
	return deps.Store.createSession(ctx, user.ID, passkeyID)
}

// HandleLogoutEverywhere ends every session of the signed-in account, this one
// included — for a lost phone, or a computer left signed in somewhere.
func HandleLogoutEverywhere(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if err := deps.Store.DeleteUserSessions(r.Context(), user.ID); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		deps.Store.LogAudit(r.Context(), &user.ID, AuditLogoutEverywhere, r, nil)

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
		apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
		return
	}
	sess := SessionFromContext(r.Context())
	writeJSON(w, meResponse{User: user, PasskeySession: sess != nil && sess.PasskeyID != nil})
}

// HandleInvite creates a new user. Requires admin role.
// With SMTP configured: sends verification email (user sets own password).
// Without SMTP: falls back to admin-set password.
func HandleInvite(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
			return
		}

		var req InviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Email == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "email required")
			return
		}

		if err := ValidateEmail(req.Email); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, err.Error())
			return
		}

		role := RoleUser
		if req.Role == RoleAdmin {
			role = RoleAdmin
		}

		smtpAvailable := emailEnabled(deps)

		// Validate password early in fallback mode (before DB lookup)
		if !smtpAvailable {
			if req.Password == "" {
				apierror.Write(w, apierror.Auth, http.StatusBadRequest, "password required (email not configured)")
				return
			}
			if err := ValidatePassword(req.Password); err != nil {
				apierror.Write(w, apierror.Auth, http.StatusBadRequest, err.Error())
				return
			}
		}

		existing, err := deps.Store.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if existing != nil {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "user already exists")
			return
		}

		if smtpAvailable {
			// Email-based invite: create user with empty password, unverified
			user, err := deps.Store.CreateUserFull(r.Context(), req.Email, "", role, false, false)
			if err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}

			// Create verification token
			rawToken, err := deps.Store.CreateVerificationToken(r.Context(), user.ID, "email_verify")
			if err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}

			// Send invite email
			htmlBody, textBody, err := email.RenderInviteEmail(deps.AppURL, rawToken)
			if err != nil {
				log.Printf("rendering invite email: %v", err)
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}

			if err := deps.EmailSender.Send(r.Context(), req.Email, "You've been invited to Finance Tracker", htmlBody, textBody); err != nil {
				log.Printf("sending invite email: %v", err)
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "failed to send invite email")
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
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}

			user, err := deps.Store.CreateUser(r.Context(), req.Email, hash, role, true)
			if err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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

// emailEnabled reports whether invitations go out by email. Without SMTP
// configured the sender is a LogSender, and an invitation carries a first
// password the admin passes on instead of a verification link.
func emailEnabled(deps *HandlerDeps) bool {
	_, isLogSender := deps.EmailSender.(*email.LogSender)
	return !isLogSender
}

// HandleListUsers returns all users. Requires admin role.
func HandleListUsers(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
			return
		}

		users, err := deps.Store.ListUsers(r.Context())
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req ChangePasswordRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.CurrentPassword == "" || req.NewPassword == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "current and new password required")
			return
		}

		if !CheckPassword(user.PasswordHash, req.CurrentPassword) {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "current password is incorrect")
			return
		}

		if err := ValidatePassword(req.NewPassword); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, err.Error())
			return
		}

		newHash, err := HashPassword(req.NewPassword)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.UpdatePassword(r.Context(), user.ID, newHash); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.ClearMustChangePassword(r.Context(), user.ID); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.DeleteUserSessions(r.Context(), user.ID); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many attempts")
			return
		}

		var req LoginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Email == "" || req.Password == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "email and password required")
			return
		}

		if err := ValidateEmail(req.Email); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, err.Error())
			return
		}
		if err := ValidatePassword(req.Password); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, err.Error())
			return
		}

		hash, err := HashPassword(req.Password)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		user, err := deps.Store.CreateFirstUser(r.Context(), req.Email, hash)
		if err == ErrSetupAlreadyDone {
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "setup already completed")
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		sess, err := deps.Store.CreateSession(r.Context(), user.ID)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{
			"needs_setup": count == 0,
			// The sign-in screen offers a passkey only when this is true.
			"passkeys": count > 0 && passkeysOn(r.Context(), deps),
		})
	}
}

// HandleVerifyEmail accepts a verification token + password, verifies email, sets password, auto-logs in.
func HandleVerifyEmail(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.VerifyEmailLimiter.Check(r) {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many attempts")
			return
		}

		var req VerifyEmailRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Token == "" || req.Password == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "token and password required")
			return
		}

		if err := ValidatePassword(req.Password); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, err.Error())
			return
		}

		userID, err := deps.Store.ValidateVerificationToken(r.Context(), req.Token, "email_verify")
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if userID == 0 {
			deps.VerifyEmailLimiter.RecordFailure(r)
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid or expired token")
			return
		}

		hash, err := HashPassword(req.Password)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.UpdatePassword(r.Context(), userID, hash); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.SetEmailVerified(r.Context(), userID); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		// Clean up tokens
		deps.Store.DeleteVerificationTokens(r.Context(), userID, "email_verify")

		// Auto-login
		sess, err := deps.Store.CreateSession(r.Context(), userID)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		user, err := deps.Store.GetUserByID(r.Context(), userID)
		if err != nil || user == nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many attempts")
			return
		}

		var req Verify2FARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.MFAToken == "" || req.Code == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "mfa_token and code required")
			return
		}

		userID, err := deps.Store.ValidateMFAChallenge(r.Context(), req.MFAToken)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if userID == 0 {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "invalid or expired MFA token")
			return
		}

		// Try TOTP code first
		valid, err := validateTOTPCode(r.Context(), deps, userID, req.Code)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if !valid {
			// Try recovery code
			valid, err = tryRecoveryCode(r.Context(), deps, userID, req.Code)
			if err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}
		}

		if !valid {
			deps.Verify2FALimiter.RecordFailure(r)
			deps.Store.LogAudit(r.Context(), &userID, Audit2FAFailed, r, nil)
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "invalid code")
			return
		}

		// Loaded before the session, which depends on the role. See startSession.
		user, err := deps.Store.GetUserByID(r.Context(), userID)
		if err != nil || user == nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		sess, err := startSession(r.Context(), deps, user, nil)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}

		if deps.EncryptionKey == nil {
			apierror.Write(w, apierror.Auth, http.StatusServiceUnavailable, "2FA not available (encryption key not configured)")
			return
		}

		if user.TOTPEnabled {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "2FA is already enabled")
			return
		}

		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      "Finance Tracker",
			AccountName: user.Email,
		})
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		// Encrypt and store the secret
		encrypted, err := Encrypt([]byte(key.Secret()), deps.EncryptionKey)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.SaveTOTPSecret(r.Context(), user.ID, encrypted); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}

		if user.TOTPEnabled {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "2FA is already enabled")
			return
		}

		var req Confirm2FARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Code == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "code required")
			return
		}

		// Validate code against stored secret
		valid, err := validateTOTPCode(r.Context(), deps, user.ID, req.Code)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if !valid {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid code")
			return
		}

		// Enable 2FA
		if err := deps.Store.SetTOTPEnabled(r.Context(), user.ID, true); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		// Generate recovery codes
		codes, hashes, err := generateRecoveryCodes(10)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.SaveRecoveryCodes(r.Context(), user.ID, hashes); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req Disable2FARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Password == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "password required")
			return
		}

		if !CheckPassword(user.PasswordHash, req.Password) {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "incorrect password")
			return
		}

		if err := deps.Store.SetTOTPEnabled(r.Context(), user.ID, false); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}

		if !user.TOTPEnabled {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "2FA is not enabled")
			return
		}

		var req RegenerateRecoveryCodesRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Password == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "password required")
			return
		}

		if !CheckPassword(user.PasswordHash, req.Password) {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "incorrect password")
			return
		}

		codes, hashes, err := generateRecoveryCodes(10)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.SaveRecoveryCodes(r.Context(), user.ID, hashes); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req DeleteAccountRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Password == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "password required")
			return
		}

		if !CheckPassword(user.PasswordHash, req.Password) {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "incorrect password")
			return
		}

		// Refused for the only remaining admin, password or no password. An app
		// with no administrator cannot invite, administer or promote anybody,
		// and no endpoint can put it right — see DeleteUserGuardingLastAdmin.
		if err := deps.Store.DeleteUserGuardingLastAdmin(r.Context(), user.ID); err != nil {
			if errors.Is(err, ErrLastAdmin) {
				apierror.Write(w, apierror.Auth, http.StatusConflict, "cannot delete the last administrator")
				return
			}
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		// Logged after the fact, and anonymously. The audit row used to be
		// written first and then have its user_id nulled by the foreign key's
		// ON DELETE SET NULL; writing it afterwards with no user reaches the
		// same row without claiming a deletion that had not happened yet. The
		// id is deliberately not preserved in the metadata — nulling it is the
		// anonymisation the column was made nullable for.
		deps.Store.LogAudit(r.Context(), nil, AuditUserDeleted, r, map[string]any{"self": true})

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
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
			return
		}

		idStr := chi.URLParam(r, "id")
		targetID, err := strconv.Atoi(idStr)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid user ID")
			return
		}

		if targetID == caller.ID {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "cannot delete yourself via admin endpoint")
			return
		}

		// The caller cannot be the target here — that is refused above — so this
		// only bites when the target is some *other* account that happens to be
		// the last admin, which is possible whenever the caller is not one.
		if err := deps.Store.DeleteUserGuardingLastAdmin(r.Context(), targetID); err != nil {
			if errors.Is(err, ErrLastAdmin) {
				apierror.Write(w, apierror.Auth, http.StatusConflict, "cannot delete the last administrator")
				return
			}
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		// After the fact: the caller survives their own request, so the audit
		// row keeps them, and it no longer records a deletion that was refused.
		deps.Store.LogAudit(r.Context(), &caller.ID, AuditUserDeleted, r, map[string]any{
			"deleted_user_id": targetID,
		})

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
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
			return
		}

		idStr := chi.URLParam(r, "id")
		targetID, err := strconv.Atoi(idStr)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid user ID")
			return
		}

		if targetID == caller.ID {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "cannot reset your own password via admin endpoint")
			return
		}

		target, err := deps.Store.GetUserByID(r.Context(), targetID)
		if err != nil || target == nil {
			apierror.Write(w, apierror.Auth, http.StatusNotFound, "user not found")
			return
		}

		// Generate random 16-char temporary password
		tempBytes := make([]byte, 12)
		if _, err := rand.Read(tempBytes); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		tempPassword := hex.EncodeToString(tempBytes)[:16]

		hash, err := HashPassword(tempPassword)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.Store.UpdatePassword(r.Context(), targetID, hash); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		// A reset is the answer to "someone else may know this password", so
		// every device signed in with the old one is signed out. With one
		// session per account this hardly mattered; with several it does.
		if err := deps.Store.DeleteUserSessions(r.Context(), targetID); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
			return
		}

		idStr := chi.URLParam(r, "id")
		targetID, err := strconv.Atoi(idStr)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid user ID")
			return
		}

		user, err := deps.Store.GetUserByID(r.Context(), targetID)
		if err != nil || user == nil {
			apierror.Write(w, apierror.Auth, http.StatusNotFound, "user not found")
			return
		}

		if user.EmailVerified {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "user already verified")
			return
		}

		// Delete old tokens and create new one
		deps.Store.DeleteVerificationTokens(r.Context(), user.ID, "email_verify")
		rawToken, err := deps.Store.CreateVerificationToken(r.Context(), user.ID, "email_verify")
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		htmlBody, textBody, err := email.RenderInviteEmail(deps.AppURL, rawToken)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		if err := deps.EmailSender.Send(r.Context(), user.Email, "You've been invited to Finance Tracker", htmlBody, textBody); err != nil {
			log.Printf("resending invite email: %v", err)
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "failed to send email")
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
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
			return
		}

		var req Require2FARequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		if req.Require {
			if err := deps.Store.SetSetting(r.Context(), "require_2fa", "true"); err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}
		} else {
			if err := deps.Store.DeleteSetting(r.Context(), "require_2fa"); err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}
		}

		deps.Store.LogAudit(r.Context(), &caller.ID, AuditSettingChanged, r, map[string]any{
			"setting": "require_2fa", "value": req.Require,
		})
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
			// The invite form asks for a first password when this is false,
			// because HandleInvite then requires one. Until it said so, the
			// form could not invite anybody on an instance without SMTP.
			"email_enabled":  emailEnabled(deps),
			"allow_passkeys": passkeysOn(r.Context(), deps),
			// False when the app's address is an IP rather than a name, where
			// no browser will make a passkey. The admin switch says so.
			"passkeys_possible": deps.WebAuthn != nil,
		})
	}
}

// HandleListAuditLogs returns paginated audit log entries. Requires admin role.
func HandleListAuditLogs(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
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
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
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

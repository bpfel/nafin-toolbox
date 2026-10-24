package auth

import (
	"context"
	"crypto/rand"
	"crypto/subtle"
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
	"sync"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/email"
	"github.com/go-chi/chi/v5"
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
	// Failures per address, from anywhere. The two above are keyed by client,
	// so guesses spread over many addresses never filled either; this one is
	// what they fill instead. Generous, because anybody who knows an address
	// can fill it on purpose: it shuts that address out of signing in for up
	// to its window, and touches no session already open.
	LoginEmailLimiter  *LoginRateLimiter
	SetupLimiter       *LoginRateLimiter
	VerifyEmailLimiter *LoginRateLimiter
	Verify2FALimiter   *LoginRateLimiter
	// Wrong codes per account, wherever they come from. The password has
	// already been given by then, and a correct password is never counted
	// anywhere, so without this one an attacker who has it could fetch a fresh
	// challenge for every guess from a fresh address.
	Verify2FAUserLimiter *LoginRateLimiter
	// Wrong passwords per account behind a session: changing it, turning off
	// 2FA, new recovery codes, deleting the account. Each of those answers
	// "is this the password?", and a stolen session cookie must not be a way
	// to ask it as often as one likes — the password unlocks the vault too.
	PasswordCheckLimiter *LoginRateLimiter
	// Failures from one trusted device, which are counted here instead of
	// against the address and the client. See device.go.
	DeviceLimiter *LoginRateLimiter
	EmailSender   email.Sender
	EncryptionKey []byte // 32-byte AES key, nil if 2FA not available
	AppURL        string
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

		// Looked up first, because which limits apply depends on it: a device
		// this account has signed in on before is counted on its own, and not
		// against the address and the client — see device.go. The lookup is
		// one indexed query; the bcrypt it guards is what the limits protect.
		user, err := deps.Store.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		device := deps.trustedDevice(r, user)

		client := deps.LoginLimiter.ClientIP(r)
		address := strings.ToLower(strings.TrimSpace(req.Email))
		account := client + "|" + address
		slots := []Slot{
			{deps.LoginLimiter, client},
			{deps.LoginAccountLimiter, account},
			{deps.LoginEmailLimiter, address},
		}
		if device != nil {
			slots = []Slot{{deps.DeviceLimiter, device.Nonce}}
		}
		attempt, ok := ReserveAll(slots...)
		if !ok {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many login attempts")
			return
		}

		if !passwordMatches(user, req.Password) {
			uid := userIDPtr(user)
			deps.Store.LogAudit(r.Context(), uid, AuditLoginFailed, r, deviceAudit(device, map[string]any{"email": req.Email}))
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "invalid credentials")
			return
		}

		// The right password is not a failure. The client-and-account run is
		// cleared outright, as a typo before it should not count against the
		// next; the others give back only this attempt, because the failures
		// in them may be somebody else's.
		attempt.Release()
		deps.LoginAccountLimiter.Forget(account)

		// A temporary password an admin handed out works for a while, not for
		// ever. See SetMustChangePassword.
		if user.TempPasswordExpired(time.Now()) {
			deps.Store.LogAudit(r.Context(), &user.ID, AuditLoginFailed, r, map[string]any{"email": req.Email, "reason": "temporary password expired"})
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "temporary password expired")
			return
		}

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
		sess, err := startSession(r.Context(), deps, user)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditLoginSuccess, r, deviceAudit(device, nil))
		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		deps.rememberDevice(w, r, user)
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
func startSession(ctx context.Context, deps *HandlerDeps, user *User) (*Session, error) {
	if user.IsAdmin() {
		if err := deps.Store.DeleteUserSessions(ctx, user.ID); err != nil {
			return nil, err
		}
	}
	return deps.Store.CreateSession(ctx, user.ID)
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
		// A lost phone should not stay a trusted device either.
		if err := deps.Store.ForgetDevices(r.Context(), user.ID); err != nil {
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
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// HandleInvite creates a new user. Requires admin role.
// With SMTP configured: sends verification email (user sets own password).
// Without SMTP: falls back to admin-set password.
func HandleInvite(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !adminOnly(w, deps, caller) {
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
		if !adminOnly(w, deps, caller) {
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

		if !confirmPassword(w, deps, user, req.CurrentPassword, "current password is incorrect") {
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
		json.NewEncoder(w).Encode(map[string]bool{"needs_setup": count == 0})
	}
}

// HandleVerifyEmail accepts a verification token + password, verifies email, sets password, auto-logs in.
func HandleVerifyEmail(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		attempt, ok := deps.VerifyEmailLimiter.Reserve(deps.VerifyEmailLimiter.ClientIP(r))
		if !ok {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many attempts")
			return
		}
		// Only a token that does not exist is a guess. Everything else this
		// handler refuses — a malformed body, a short password — gives the
		// attempt back, as the check that came before the reservation did not
		// count them either.
		guessed := false
		defer func() {
			if !guessed {
				attempt.Release()
			}
		}()

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
			guessed = true
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
		var attempt Reservations
		clientAttempt, ok := deps.Verify2FALimiter.Reserve(deps.Verify2FALimiter.ClientIP(r))
		if !ok {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many attempts")
			return
		}
		attempt = append(attempt, clientAttempt)
		// Only a wrong code is a guess; see HandleVerifyEmail.
		guessed := false
		defer func() {
			if !guessed {
				attempt.Release()
			}
		}()

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

		// A device this account has signed in on before is counted on its own
		// here too: an attacker who has the password could otherwise fill the
		// account's code limit and keep its owner out at the second step.
		user, err := deps.Store.GetUserByID(r.Context(), userID)
		if err != nil || user == nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		device := deps.trustedDevice(r, user)
		codeLimiter, codeKey := deps.Verify2FAUserLimiter, strconv.Itoa(userID)
		if device != nil {
			codeLimiter, codeKey = deps.DeviceLimiter, device.Nonce
		}
		userAttempt, ok := codeLimiter.Reserve(codeKey)
		if !ok {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many attempts")
			return
		}
		attempt = append(attempt, userAttempt)

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
			guessed = true
			deps.Store.LogAudit(r.Context(), &userID, Audit2FAFailed, r, deviceAudit(device, nil))
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "invalid code")
			return
		}

		// The user loaded above decides the session, which depends on the
		// role. See startSession.
		sess, err := startSession(r.Context(), deps, user)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		deps.Store.LogAudit(r.Context(), &userID, AuditLoginSuccess, r, deviceAudit(device, map[string]any{"method": "2fa"}))
		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		// Only now, with both factors given, does this browser become one of
		// the account's devices.
		deps.rememberDevice(w, r, user)
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

		if !confirmPassword(w, deps, user, req.Password, "incorrect password") {
			return
		}

		// While the instance requires a second factor, nobody may drop theirs.
		// The screen that enforces it is the browser's, and the browser is not
		// where a rule can be kept: anyone holding a session and the password
		// could otherwise take the second factor away, and from then on the
		// password alone would let them in.
		require2fa, err := deps.Store.GetSetting(r.Context(), "require_2fa")
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if require2fa == "true" {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "2FA is required on this instance")
			return
		}
		// And an administrator never may. See AdminReady.
		if user.IsAdmin() {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "administrators must keep 2FA")
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

		if !confirmPassword(w, deps, user, req.Password, "incorrect password") {
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

		if !confirmPassword(w, deps, user, req.Password, "incorrect password") {
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
		if !adminOnly(w, deps, caller) {
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

// TempPasswordLifetime is how long a password from an admin reset works. Three
// days covers a weekend between the admin sending it and the person reading
// it; past that, the admin is asked for another rather than the first one
// lying in a chat history for good.
const TempPasswordLifetime = 72 * time.Hour

// HandleAdminResetPassword lets an admin reset another user's password.
// Generates a random temporary password, which the user must change at their
// next sign-in and which stops working after TempPasswordLifetime.
func HandleAdminResetPassword(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !adminOnly(w, deps, caller) {
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

		expiresAt := time.Now().Add(TempPasswordLifetime)
		if err := deps.Store.SetTemporaryPassword(r.Context(), targetID, hash, expiresAt); err != nil {
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

		deps.Store.LogAudit(r.Context(), &caller.ID, AuditPasswordReset, r, map[string]any{
			"target_user_id": targetID,
			"target_email":   target.Email,
		})

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{
			"status":          "ok",
			"temp_password":   tempPassword,
			"temp_expires_at": expiresAt.UTC().Format(time.RFC3339),
		})
	}
}

// HandleResendVerification regenerates and resends invite email for an unverified user.
func HandleResendVerification(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !adminOnly(w, deps, caller) {
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
		if !adminOnly(w, deps, caller) {
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
			"email_enabled": emailEnabled(deps),
			// Whether 2FA can be turned on here at all. Without it the browser
			// would hold an admin at a setup screen that can only fail.
			"twofa_available": deps.EncryptionKey != nil,
		})
	}
}

// HandleListAuditLogs returns paginated audit log entries. Requires admin role.
func HandleListAuditLogs(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !adminOnly(w, deps, caller) {
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

// dummyHash is compared against when nobody has the address that was typed,
// so that answering "no such account" takes as long as "wrong password".
// Skipping bcrypt made the first a quarter of a second faster, which told
// anyone timing the answer which addresses have accounts.
var dummyHash = sync.OnceValue(func() string {
	h, err := HashPassword("no account has this password")
	if err != nil {
		panic(err)
	}
	return h
})

// passwordMatches reports whether user exists and has this password, taking
// the same time either way.
func passwordMatches(user *User, password string) bool {
	if user == nil {
		CheckPassword(dummyHash(), password)
		return false
	}
	return CheckPassword(user.PasswordHash, password)
}

// AdminReady reports whether u may act as an administrator: an admin, with a
// second factor whenever this instance can offer one.
//
// An admin session can reset anybody's password, read the audit log and turn
// the instance's defences on and off, so it is the one account a stolen
// password must not be enough for. Users are held to 2FA only when an admin
// asks for it; admins always are.
//
// Where no ENCRYPTION_KEY is set, 2FA cannot be enabled at all, and requiring
// it would lock every admin out of everything. The server says so at start
// instead; see server.New.
func (d *HandlerDeps) AdminReady(u *User) bool {
	if u == nil || !u.IsAdmin() {
		return false
	}
	return u.TOTPEnabled || d.EncryptionKey == nil
}

// adminOnly lets an administrator through, writing the refusal itself when the
// caller is not one, or is one who has not turned on 2FA yet.
func adminOnly(w http.ResponseWriter, deps *HandlerDeps, caller *User) bool {
	if caller == nil || !caller.IsAdmin() {
		apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
		return false
	}
	if !deps.AdminReady(caller) {
		apierror.Write(w, apierror.Auth, http.StatusForbidden, "administrators must enable 2FA")
		return false
	}
	return true
}

// confirmPassword asks the signed-in user for their password again, before
// something that should not rest on a session alone. It writes the refusal
// itself — failMessage for a wrong password, a 429 when there have been too
// many — and reports whether to go on.
func confirmPassword(w http.ResponseWriter, deps *HandlerDeps, user *User, password, failMessage string) bool {
	attempt, ok := deps.PasswordCheckLimiter.Reserve(strconv.Itoa(user.ID))
	if !ok {
		w.Header().Set("Retry-After", "900")
		apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many attempts")
		return false
	}
	if !CheckPassword(user.PasswordHash, password) {
		apierror.Write(w, apierror.Auth, http.StatusUnauthorized, failMessage)
		return false
	}
	attempt.Release()
	return true
}

// The TOTP parameters every authenticator app assumes, and totp.Validate
// uses: six digits, SHA-1, thirty seconds, one step of drift either way.
const (
	totpPeriod = 30
	totpSkew   = 1
)

// validateTOTPCode decrypts the stored secret, checks a TOTP code against it,
// and spends the code: a code that worked once is refused after.
//
// Without that, a code read over a shoulder or relayed by a phishing page
// went on working for the minute and a half the drift window keeps it valid.
// The step each accepted code belongs to is recorded, and only a later step
// is accepted next — claimed in one statement, so two requests racing with
// the same code cannot both have it.
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

	step, ok := totpStep(string(secret), code, time.Now())
	if !ok {
		return false, nil
	}
	return deps.Store.ClaimTOTPStep(ctx, userID, step)
}

// totpStep finds the time step, inside the drift window around now, whose
// code is code — what totp.Validate checks, with the step it matched.
func totpStep(secret, code string, now time.Time) (int64, bool) {
	if len(code) != 6 {
		return 0, false
	}
	current := now.Unix() / totpPeriod
	for step := current - totpSkew; step <= current+totpSkew; step++ {
		want, err := totp.GenerateCode(secret, time.Unix(step*totpPeriod, 0))
		if err != nil {
			return 0, false
		}
		if subtle.ConstantTimeCompare([]byte(want), []byte(code)) == 1 {
			return step, true
		}
	}
	return 0, false
}

// looksLikeRecoveryCode is the shape generateRecoveryCodes makes: eight
// lower-case hex digits. Anything else cannot match one, and is turned away
// before ten bcrypt comparisons — two and a half seconds of CPU a wrong
// six-digit code used to cost on every attempt.
func looksLikeRecoveryCode(code string) bool {
	if len(code) != 8 {
		return false
	}
	for _, c := range code {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') {
			return false
		}
	}
	return true
}

// tryRecoveryCode checks if the code matches any unused recovery code.
func tryRecoveryCode(ctx context.Context, deps *HandlerDeps, userID int, code string) (bool, error) {
	if !looksLikeRecoveryCode(code) {
		return false, nil
	}

	codes, err := deps.Store.GetRecoveryCodes(ctx, userID)
	if err != nil {
		return false, err
	}

	for _, rc := range codes {
		if rc.Used {
			continue
		}
		if CheckPassword(rc.CodeHash, code) {
			// Claimed, not just marked: two requests with the same code both
			// found it unused above, and only one of them may sign in.
			claimed, err := deps.Store.ClaimRecoveryCode(ctx, rc.ID)
			if err != nil || !claimed {
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

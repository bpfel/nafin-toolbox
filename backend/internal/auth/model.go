package auth

import "time"

const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

type User struct {
	ID                 int       `json:"id"`
	Email              string    `json:"email"`
	Role               string    `json:"role"`
	PasswordHash       string    `json:"-"`
	MustChangePassword bool      `json:"must_change_password"`
	EmailVerified      bool      `json:"email_verified"`
	TOTPEnabled        bool      `json:"totp_enabled"`
	CreatedAt          time.Time `json:"created_at"`
	// Set while the password is one an admin handed out. See
	// SetTemporaryPassword.
	TempPasswordExpiresAt *time.Time `json:"-"`
	// The generation of trusted-device cookies this account accepts. See
	// device.go.
	DeviceEpoch int `json:"-"`
	// What PasswordHash is a hash of: the password (1) or an auth key (2).
	// Sent, so that a browser holding a version 1 session knows to migrate.
	// See kdf.go.
	AuthVersion int `json:"auth_version"`
	// The PBKDF2 rounds the browser derives this account's keys with.
	KDFIterations int `json:"-"`
}

func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

// TempPasswordExpired reports whether the user's password is a temporary one
// whose time is up.
func (u *User) TempPasswordExpired(now time.Time) bool {
	return u.MustChangePassword && u.TempPasswordExpiresAt != nil && !now.Before(*u.TempPasswordExpiresAt)
}

type Session struct {
	Token     string // raw token (only in memory / cookie, never stored)
	TokenHash string // SHA-256 hex hash (stored in DB)
	UserID    int
	ExpiresAt time.Time
	CreatedAt time.Time
}

// Secret is how a request proves the password. A version 2 account sends the
// auth key its browser derived, and the server never sees the password. A
// version 1 account sends the password itself, as it always did, until it
// migrates. See secretMatches.
type Secret struct {
	Password string `json:"password,omitempty"`
	AuthKey  string `json:"auth_key,omitempty"`
}

// Empty reports whether neither form was sent.
func (s Secret) Empty() bool { return s.Password == "" && s.AuthKey == "" }

type LoginRequest struct {
	Email string `json:"email"`
	Secret
}

// SetupRequest makes the first administrator, who is version 2 from the start.
type SetupRequest struct {
	Email   string `json:"email"`
	AuthKey string `json:"auth_key"`
}

type PreloginRequest struct {
	Email string `json:"email"`
}

// PreloginResponse is how the browser derives an account's keys before signing
// in. An address with no account gets the defaults, so it reads like any other.
type PreloginResponse struct {
	AuthVersion int    `json:"auth_version"`
	KDF         string `json:"kdf"`
	Iterations  int    `json:"iterations"`
}

// UpgradeRequest moves an account to version 2, proven by its current secret.
// Which of the new values are required depends on what the account still
// lacks; see HandleUpgrade.
type UpgradeRequest struct {
	Secret
	NewAuthKey           string `json:"new_auth_key,omitempty"`
	EncryptedMEK         string `json:"encrypted_mek,omitempty"`
	RecoveryAuth         string `json:"recovery_auth,omitempty"`
	EncryptedMEKRecovery string `json:"encrypted_mek_recovery,omitempty"`
}

// InviteRequest — when SMTP is configured, only email+role needed.
// Password field is optional (fallback for no-SMTP mode).
type InviteRequest struct {
	Email string `json:"email"`
	// The invitee's first password, as an auth key the admin's browser
	// derived for the invitee's address. Only without email.
	AuthKey string `json:"auth_key,omitempty"`
	Role    string `json:"role"`
}

type ChangePasswordRequest struct {
	// The current secret, in the account's own form (see Secret).
	CurrentPassword string `json:"current_password,omitempty"`
	CurrentAuthKey  string `json:"current_auth_key,omitempty"`
	// Always an auth key: a changed password makes the account version 2.
	NewAuthKey string `json:"new_auth_key"`
	// The vault key wrapped under the new password, when the account has a
	// vault open to re-wrap. Stored together with the password, and only after
	// the current one is proven; see Store.ChangePassword.
	EncryptedMEK string `json:"encrypted_mek,omitempty"`
}

func (r ChangePasswordRequest) Current() Secret {
	return Secret{Password: r.CurrentPassword, AuthKey: r.CurrentAuthKey}
}

type VerifyEmailRequest struct {
	Token   string `json:"token"`
	AuthKey string `json:"auth_key"`
}

type Verify2FARequest struct {
	MFAToken string `json:"mfa_token"`
	Code     string `json:"code"`
}

type Enable2FAResponse struct {
	Secret string `json:"secret"`
	URL    string `json:"url"`
}

// Setup2FARequest proves the password before a second factor is set up: who
// enrols one decides who can sign in from then on, which is no decision for a
// session alone.
type Setup2FARequest struct {
	Secret
}

type Confirm2FARequest struct {
	Code string `json:"code"`
}

type Confirm2FAResponse struct {
	RecoveryCodes []string `json:"recovery_codes"`
}

type Disable2FARequest struct {
	Secret
}

type RegenerateRecoveryCodesRequest struct {
	Secret
}

type DeleteAccountRequest struct {
	Secret
}

type Require2FARequest struct {
	Require bool `json:"require"`
}

type VerificationToken struct {
	ID        int
	UserID    int
	TokenHash string
	Purpose   string
	ExpiresAt time.Time
	CreatedAt time.Time
}

type RecoveryCode struct {
	ID       int
	UserID   int
	CodeHash string
	Used     bool
}

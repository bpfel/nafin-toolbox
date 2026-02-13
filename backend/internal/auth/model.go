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
}

func (u *User) IsAdmin() bool {
	return u.Role == RoleAdmin
}

type Session struct {
	Token     string // raw token (only in memory / cookie, never stored)
	TokenHash string // SHA-256 hex hash (stored in DB)
	UserID    int
	ExpiresAt time.Time
	CreatedAt time.Time
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// InviteRequest — when SMTP is configured, only email+role needed.
// Password field is optional (fallback for no-SMTP mode).
type InviteRequest struct {
	Email    string `json:"email"`
	Password string `json:"password,omitempty"`
	Role     string `json:"role"`
}

type ChangePasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

type VerifyEmailRequest struct {
	Token    string `json:"token"`
	Password string `json:"password"`
}

type Verify2FARequest struct {
	MFAToken string `json:"mfa_token"`
	Code     string `json:"code"`
}

type Enable2FAResponse struct {
	Secret string `json:"secret"`
	URL    string `json:"url"`
}

type Confirm2FARequest struct {
	Code string `json:"code"`
}

type Confirm2FAResponse struct {
	RecoveryCodes []string `json:"recovery_codes"`
}

type Disable2FARequest struct {
	Password string `json:"password"`
}

type RegenerateRecoveryCodesRequest struct {
	Password string `json:"password"`
}

type DeleteAccountRequest struct {
	Password string `json:"password"`
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

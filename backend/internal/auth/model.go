package auth

import "time"

const (
	RoleAdmin = "admin"
	RoleUser  = "user"
)

type User struct {
	ID           int       `json:"id"`
	Email        string    `json:"email"`
	Role         string    `json:"role"`
	PasswordHash string    `json:"-"`
	CreatedAt    time.Time `json:"created_at"`
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

type InviteRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Role     string `json:"role"`
}

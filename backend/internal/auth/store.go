package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"time"
)

const sessionDuration = 30 * 24 * time.Hour // 30 days

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) CreateUser(ctx context.Context, email, passwordHash, role string, mustChangePassword bool) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO users (email, password_hash, role, must_change_password) VALUES ($1, $2, $3, $4)
		 RETURNING id, email, role, password_hash, must_change_password, created_at`,
		email, passwordHash, role, mustChangePassword,
	).Scan(&u.ID, &u.Email, &u.Role, &u.PasswordHash, &u.MustChangePassword, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}
	return &u, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx,
		`SELECT id, email, role, password_hash, must_change_password, created_at FROM users WHERE email = $1`,
		email,
	).Scan(&u.ID, &u.Email, &u.Role, &u.PasswordHash, &u.MustChangePassword, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting user by email: %w", err)
	}
	return &u, nil
}

func (s *Store) GetUserByID(ctx context.Context, id int) (*User, error) {
	var u User
	err := s.db.QueryRowContext(ctx,
		`SELECT id, email, role, password_hash, must_change_password, created_at FROM users WHERE id = $1`,
		id,
	).Scan(&u.ID, &u.Email, &u.Role, &u.PasswordHash, &u.MustChangePassword, &u.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting user by id: %w", err)
	}
	return &u, nil
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, email, role, must_change_password, created_at FROM users ORDER BY id`,
	)
	if err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.MustChangePassword, &u.CreatedAt); err != nil {
			return nil, fmt.Errorf("scanning user: %w", err)
		}
		users = append(users, u)
	}
	return users, rows.Err()
}

func (s *Store) UpdatePassword(ctx context.Context, userID int, newHash string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET password_hash = $1 WHERE id = $2`,
		newHash, userID,
	)
	return err
}

func (s *Store) ClearMustChangePassword(ctx context.Context, userID int) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET must_change_password = FALSE WHERE id = $1`,
		userID,
	)
	return err
}

func (s *Store) UserCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

// CreateFirstUser atomically creates the first user as admin, using an advisory lock
// to prevent race conditions. Returns an error if any users already exist.
func (s *Store) CreateFirstUser(ctx context.Context, email, passwordHash string) (*User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Advisory lock prevents concurrent setup attempts
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(2)`); err != nil {
		return nil, fmt.Errorf("advisory lock: %w", err)
	}

	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count); err != nil {
		return nil, fmt.Errorf("counting users: %w", err)
	}
	if count > 0 {
		return nil, ErrSetupAlreadyDone
	}

	var u User
	err = tx.QueryRowContext(ctx,
		`INSERT INTO users (email, password_hash, role, must_change_password) VALUES ($1, $2, $3, FALSE)
		 RETURNING id, email, role, password_hash, must_change_password, created_at`,
		email, passwordHash, RoleAdmin,
	).Scan(&u.ID, &u.Email, &u.Role, &u.PasswordHash, &u.MustChangePassword, &u.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("creating first user: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return &u, nil
}

var ErrSetupAlreadyDone = fmt.Errorf("setup already completed")

// hashToken returns the hex-encoded SHA-256 hash of a raw session token.
func hashToken(raw string) string {
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

func (s *Store) CreateSession(ctx context.Context, userID int) (*Session, error) {
	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("generating session token: %w", err)
	}

	sess := &Session{
		Token:     token,
		TokenHash: hashToken(token),
		UserID:    userID,
		ExpiresAt: time.Now().Add(sessionDuration),
	}

	err = s.db.QueryRowContext(ctx,
		`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)
		 RETURNING created_at`,
		sess.TokenHash, sess.UserID, sess.ExpiresAt,
	).Scan(&sess.CreatedAt)
	if err != nil {
		return nil, fmt.Errorf("creating session: %w", err)
	}
	return sess, nil
}

func (s *Store) GetSession(ctx context.Context, token string) (*Session, error) {
	var sess Session
	h := hashToken(token)
	err := s.db.QueryRowContext(ctx,
		`SELECT token_hash, user_id, expires_at, created_at FROM sessions
		 WHERE token_hash = $1 AND expires_at > NOW()`,
		h,
	).Scan(&sess.TokenHash, &sess.UserID, &sess.ExpiresAt, &sess.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting session: %w", err)
	}
	return &sess, nil
}

func (s *Store) DeleteSession(ctx context.Context, token string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE token_hash = $1`, hashToken(token))
	return err
}

func (s *Store) DeleteUserSessions(ctx context.Context, userID int) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE user_id = $1`, userID)
	return err
}

func (s *Store) DeleteExpiredSessions(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at <= NOW()`)
	return err
}

func generateToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.URLEncoding.EncodeToString(b), nil
}

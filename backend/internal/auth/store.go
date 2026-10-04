package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"time"
)

const sessionDuration = 30 * 24 * time.Hour // 30 days
const mfaChallengeDuration = 5 * time.Minute
const verificationTokenDuration = 48 * time.Hour

type Store struct {
	db *sql.DB
	// For the audit log's IP column, read the way the rate limiters read it.
	trustedProxies []*net.IPNet
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// SetTrustedProxies configures the proxies whose forwarding headers the audit
// log believes. See clientIP.
func (s *Store) SetTrustedProxies(cidrs []string) {
	s.trustedProxies = parseCIDRs(cidrs)
}

// ---- User CRUD ----

const userColumns = `id, email, role, password_hash, must_change_password, email_verified, totp_enabled, created_at`

func scanUser(row interface{ Scan(...any) error }) (*User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Email, &u.Role, &u.PasswordHash, &u.MustChangePassword, &u.EmailVerified, &u.TOTPEnabled, &u.CreatedAt)
	return &u, err
}

func (s *Store) CreateUser(ctx context.Context, email, passwordHash, role string, mustChangePassword bool) (*User, error) {
	return s.CreateUserFull(ctx, email, passwordHash, role, mustChangePassword, true)
}

func (s *Store) CreateUserFull(ctx context.Context, email, passwordHash, role string, mustChangePassword, emailVerified bool) (*User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx,
		`INSERT INTO users (email, password_hash, role, must_change_password, email_verified) VALUES (lower($1), $2, $3, $4, $5)
		 RETURNING `+userColumns,
		email, passwordHash, role, mustChangePassword, emailVerified,
	))
	if err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}
	return u, nil
}

func (s *Store) GetUserByEmail(ctx context.Context, email string) (*User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx,
		// Case-insensitive, matching idx_users_email_ci. An exact comparison
		// here would let somebody sign in only with the capitalisation they
		// happened to register with.
		`SELECT `+userColumns+` FROM users WHERE lower(email) = lower($1)`, email,
	))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting user by email: %w", err)
	}
	return u, nil
}

func (s *Store) GetUserByID(ctx context.Context, id int) (*User, error) {
	u, err := scanUser(s.db.QueryRowContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE id = $1`, id,
	))
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("getting user by id: %w", err)
	}
	return u, nil
}

func (s *Store) ListUsers(ctx context.Context) ([]User, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, email, role, must_change_password, email_verified, totp_enabled, created_at FROM users ORDER BY id`,
	)
	if err != nil {
		return nil, fmt.Errorf("listing users: %w", err)
	}
	defer rows.Close()

	var users []User
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Role, &u.MustChangePassword, &u.EmailVerified, &u.TOTPEnabled, &u.CreatedAt); err != nil {
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

func (s *Store) SetMustChangePassword(ctx context.Context, userID int) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET must_change_password = TRUE WHERE id = $1`,
		userID,
	)
	return err
}

func (s *Store) SetEmailVerified(ctx context.Context, userID int) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET email_verified = TRUE WHERE id = $1`,
		userID,
	)
	return err
}

func (s *Store) SetTOTPEnabled(ctx context.Context, userID int, enabled bool) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET totp_enabled = $1 WHERE id = $2`,
		enabled, userID,
	)
	return err
}

// DeleteUser removes a user with no checks at all.
//
// Nothing that serves a request may call this: it will happily delete the only
// account able to administer the app. Handlers use
// DeleteUserGuardingLastAdmin. This stays for test fixtures, which create and
// tear down admins deliberately.
func (s *Store) DeleteUser(ctx context.Context, userID int) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, userID)
	return err
}

// ErrLastAdmin says the deletion was refused because it would leave the app
// with nobody able to administer it.
var ErrLastAdmin = fmt.Errorf("cannot delete the last administrator")

// DeleteUserGuardingLastAdmin removes a user unless that would leave no admin.
//
// **There is no way back from a zero-admin app.** A role is fixed when the
// account is created and no endpoint changes one, so an app whose last admin is
// gone has no invitations, no user administration, no audit log and no way to
// promote anybody — it can only be repaired by editing the database by hand.
//
// Counted and deleted under one advisory lock, the way CreateFirstUser guards
// the first account. Row locks cannot do this job: two admins deleting each
// other touch different rows, so nothing makes them wait for one another, and
// both would read two admins, both proceed, and both succeed. The count and the
// delete have to be a single decision.
//
// Deleting a user that is already gone is not an error, matching DeleteUser.
func (s *Store) DeleteUserGuardingLastAdmin(ctx context.Context, userID int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// A different key from CreateFirstUser's: this serialises changes to the
	// admin roster, which is a different question from whether setup has run.
	if _, err := tx.ExecContext(ctx, `SELECT pg_advisory_xact_lock(3)`); err != nil {
		return fmt.Errorf("advisory lock: %w", err)
	}

	var role string
	err = tx.QueryRowContext(ctx, `SELECT role FROM users WHERE id = $1`, userID).Scan(&role)
	if err == sql.ErrNoRows {
		return nil
	}
	if err != nil {
		return fmt.Errorf("reading role: %w", err)
	}

	if role == RoleAdmin {
		var admins int
		if err := tx.QueryRowContext(ctx,
			`SELECT COUNT(*) FROM users WHERE role = $1`, RoleAdmin,
		).Scan(&admins); err != nil {
			return fmt.Errorf("counting admins: %w", err)
		}
		if admins <= 1 {
			return ErrLastAdmin
		}
	}

	if _, err := tx.ExecContext(ctx, `DELETE FROM users WHERE id = $1`, userID); err != nil {
		return fmt.Errorf("deleting user: %w", err)
	}
	return tx.Commit()
}

func (s *Store) UserCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM users`).Scan(&count)
	return count, err
}

func (s *Store) CreateFirstUser(ctx context.Context, email, passwordHash string) (*User, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

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

	u, err := scanUser(tx.QueryRowContext(ctx,
		`INSERT INTO users (email, password_hash, role, must_change_password, email_verified) VALUES (lower($1), $2, $3, FALSE, TRUE)
		 RETURNING `+userColumns,
		email, passwordHash, RoleAdmin,
	))
	if err != nil {
		return nil, fmt.Errorf("creating first user: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return nil, fmt.Errorf("commit: %w", err)
	}
	return u, nil
}

var ErrSetupAlreadyDone = fmt.Errorf("setup already completed")

// ---- Sessions ----

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

// ---- Verification Tokens ----

// CreateVerificationToken creates a token for email verification or password reset.
// Returns the raw token (to include in the email link). The hash is stored in DB.
func (s *Store) CreateVerificationToken(ctx context.Context, userID int, purpose string) (string, error) {
	raw, err := generateToken()
	if err != nil {
		return "", fmt.Errorf("generating verification token: %w", err)
	}

	h := hashToken(raw)
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO verification_tokens (user_id, token_hash, purpose, expires_at)
		 VALUES ($1, $2, $3, $4)`,
		userID, h, purpose, time.Now().Add(verificationTokenDuration),
	)
	if err != nil {
		return "", fmt.Errorf("storing verification token: %w", err)
	}

	return raw, nil
}

// ValidateVerificationToken looks up a token by its raw value and purpose.
// Returns the user_id if valid, or 0 if not found / expired.
func (s *Store) ValidateVerificationToken(ctx context.Context, rawToken, purpose string) (int, error) {
	h := hashToken(rawToken)
	var userID int
	err := s.db.QueryRowContext(ctx,
		`SELECT user_id FROM verification_tokens
		 WHERE token_hash = $1 AND purpose = $2 AND expires_at > NOW()`,
		h, purpose,
	).Scan(&userID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("validating verification token: %w", err)
	}
	return userID, nil
}

// DeleteVerificationTokens removes all tokens for a user+purpose.
func (s *Store) DeleteVerificationTokens(ctx context.Context, userID int, purpose string) error {
	_, err := s.db.ExecContext(ctx,
		`DELETE FROM verification_tokens WHERE user_id = $1 AND purpose = $2`,
		userID, purpose,
	)
	return err
}

func (s *Store) DeleteExpiredVerificationTokens(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM verification_tokens WHERE expires_at <= NOW()`)
	return err
}

// ---- TOTP Secrets ----

func (s *Store) SaveTOTPSecret(ctx context.Context, userID int, encryptedSecret string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO totp_secrets (user_id, encrypted_secret) VALUES ($1, $2)
		 ON CONFLICT (user_id) DO UPDATE SET encrypted_secret = $2`,
		userID, encryptedSecret,
	)
	return err
}

func (s *Store) GetTOTPSecret(ctx context.Context, userID int) (string, error) {
	var encrypted string
	err := s.db.QueryRowContext(ctx,
		`SELECT encrypted_secret FROM totp_secrets WHERE user_id = $1`,
		userID,
	).Scan(&encrypted)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("getting TOTP secret: %w", err)
	}
	return encrypted, nil
}

func (s *Store) DeleteTOTPSecret(ctx context.Context, userID int) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM totp_secrets WHERE user_id = $1`, userID)
	return err
}

// ---- Recovery Codes ----

func (s *Store) SaveRecoveryCodes(ctx context.Context, userID int, codeHashes []string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	// Delete existing codes
	if _, err := tx.ExecContext(ctx, `DELETE FROM recovery_codes WHERE user_id = $1`, userID); err != nil {
		return fmt.Errorf("deleting old codes: %w", err)
	}

	for _, h := range codeHashes {
		if _, err := tx.ExecContext(ctx,
			`INSERT INTO recovery_codes (user_id, code_hash) VALUES ($1, $2)`,
			userID, h,
		); err != nil {
			return fmt.Errorf("inserting recovery code: %w", err)
		}
	}

	return tx.Commit()
}

func (s *Store) GetRecoveryCodes(ctx context.Context, userID int) ([]RecoveryCode, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, user_id, code_hash, used FROM recovery_codes WHERE user_id = $1`,
		userID,
	)
	if err != nil {
		return nil, fmt.Errorf("getting recovery codes: %w", err)
	}
	defer rows.Close()

	var codes []RecoveryCode
	for rows.Next() {
		var c RecoveryCode
		if err := rows.Scan(&c.ID, &c.UserID, &c.CodeHash, &c.Used); err != nil {
			return nil, fmt.Errorf("scanning recovery code: %w", err)
		}
		codes = append(codes, c)
	}
	return codes, rows.Err()
}

func (s *Store) MarkRecoveryCodeUsed(ctx context.Context, codeID int) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE recovery_codes SET used = TRUE WHERE id = $1`,
		codeID,
	)
	return err
}

func (s *Store) DeleteRecoveryCodes(ctx context.Context, userID int) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM recovery_codes WHERE user_id = $1`, userID)
	return err
}

// ---- MFA Challenges ----

// CreateMFAChallenge creates a short-lived token that bridges the password step and TOTP step.
// Returns the raw token.
func (s *Store) CreateMFAChallenge(ctx context.Context, userID int) (string, error) {
	raw, err := generateToken()
	if err != nil {
		return "", fmt.Errorf("generating MFA challenge: %w", err)
	}

	h := hashToken(raw)
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO mfa_challenges (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`,
		h, userID, time.Now().Add(mfaChallengeDuration),
	)
	if err != nil {
		return "", fmt.Errorf("storing MFA challenge: %w", err)
	}

	return raw, nil
}

// ValidateMFAChallenge validates and consumes a MFA challenge.
// Returns the user_id if valid, 0 if not found/expired.
func (s *Store) ValidateMFAChallenge(ctx context.Context, rawToken string) (int, error) {
	h := hashToken(rawToken)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback()

	var userID int
	err = tx.QueryRowContext(ctx,
		`SELECT user_id FROM mfa_challenges WHERE token_hash = $1 AND expires_at > NOW()`,
		h,
	).Scan(&userID)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	if err != nil {
		return 0, fmt.Errorf("validating MFA challenge: %w", err)
	}

	// Delete the challenge (single-use)
	if _, err := tx.ExecContext(ctx, `DELETE FROM mfa_challenges WHERE token_hash = $1`, h); err != nil {
		return 0, fmt.Errorf("deleting MFA challenge: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit: %w", err)
	}

	return userID, nil
}

func (s *Store) DeleteExpiredMFAChallenges(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM mfa_challenges WHERE expires_at <= NOW()`)
	return err
}

// ---- App Settings ----

func (s *Store) GetSetting(ctx context.Context, key string) (string, error) {
	var value string
	err := s.db.QueryRowContext(ctx,
		`SELECT value FROM app_settings WHERE key = $1`, key,
	).Scan(&value)
	if err == sql.ErrNoRows {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("getting setting %s: %w", key, err)
	}
	return value, nil
}

func (s *Store) SetSetting(ctx context.Context, key, value string) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO app_settings (key, value) VALUES ($1, $2)
		 ON CONFLICT (key) DO UPDATE SET value = $2`,
		key, value,
	)
	return err
}

func (s *Store) DeleteSetting(ctx context.Context, key string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM app_settings WHERE key = $1`, key)
	return err
}

// ---- Audit Log ----

type AuditLogEntry struct {
	ID        int64           `json:"id"`
	UserID    *int            `json:"user_id"`
	UserEmail *string         `json:"user_email"`
	Event     string          `json:"event"`
	IPAddress string          `json:"ip_address"`
	UserAgent string          `json:"user_agent"`
	Metadata  json.RawMessage `json:"metadata"`
	CreatedAt time.Time       `json:"created_at"`
}

func (s *Store) ListAuditLogs(ctx context.Context, limit, offset int, eventFilter string, userIDFilter *int) ([]AuditLogEntry, int, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	if offset < 0 {
		offset = 0
	}

	// Build WHERE clauses
	where := ""
	args := []any{}
	argIdx := 1

	if eventFilter != "" {
		where += fmt.Sprintf(" AND a.event = $%d", argIdx)
		args = append(args, eventFilter)
		argIdx++
	}
	if userIDFilter != nil {
		where += fmt.Sprintf(" AND a.user_id = $%d", argIdx)
		args = append(args, *userIDFilter)
		argIdx++
	}

	// Count total
	countQuery := `SELECT COUNT(*) FROM audit_log a WHERE TRUE` + where
	var total int
	if err := s.db.QueryRowContext(ctx, countQuery, args...).Scan(&total); err != nil {
		return nil, 0, fmt.Errorf("counting audit logs: %w", err)
	}

	// Fetch entries
	query := fmt.Sprintf(
		`SELECT a.id, a.user_id, u.email, a.event, COALESCE(a.ip_address,''), COALESCE(a.user_agent,''), COALESCE(a.metadata, 'null'::jsonb), a.created_at
		 FROM audit_log a
		 LEFT JOIN users u ON u.id = a.user_id
		 WHERE TRUE%s
		 ORDER BY a.id DESC
		 LIMIT $%d OFFSET $%d`,
		where, argIdx, argIdx+1,
	)
	args = append(args, limit, offset)

	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, 0, fmt.Errorf("listing audit logs: %w", err)
	}
	defer rows.Close()

	var entries []AuditLogEntry
	for rows.Next() {
		var e AuditLogEntry
		if err := rows.Scan(&e.ID, &e.UserID, &e.UserEmail, &e.Event, &e.IPAddress, &e.UserAgent, &e.Metadata, &e.CreatedAt); err != nil {
			return nil, 0, fmt.Errorf("scanning audit log: %w", err)
		}
		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, 0, fmt.Errorf("iterating audit logs: %w", err)
	}

	return entries, total, nil
}

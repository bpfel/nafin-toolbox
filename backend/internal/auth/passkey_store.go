package auth

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"

	"github.com/go-webauthn/webauthn/webauthn"
)

const passkeyChallengeDuration = 5 * time.Minute

// Passkey is one passkey as the account's owner sees it. The credential
// record itself stays on the server; nothing in it is any use to the browser.
type Passkey struct {
	ID         int        `json:"id"`
	Name       string     `json:"name"`
	CreatedAt  time.Time  `json:"created_at"`
	LastUsedAt *time.Time `json:"last_used_at"`
	// Whether this passkey can open the vault, not only sign in.
	Unlocks bool `json:"unlocks"`
}

// storedPasskey is a passkey with what the ceremonies need.
type storedPasskey struct {
	Passkey
	UserID          int
	Credential      webauthn.Credential
	EncryptedMEKPRF *string
}

// passkeyUser is an account as go-webauthn sees it.
type passkeyUser struct {
	user     *User
	handle   []byte
	passkeys []storedPasskey
}

func (u *passkeyUser) WebAuthnID() []byte          { return u.handle }
func (u *passkeyUser) WebAuthnName() string        { return u.user.Email }
func (u *passkeyUser) WebAuthnDisplayName() string { return u.user.Email }
func (u *passkeyUser) WebAuthnCredentials() []webauthn.Credential {
	creds := make([]webauthn.Credential, len(u.passkeys))
	for i, p := range u.passkeys {
		creds[i] = p.Credential
	}
	return creds
}

// passkeyFor finds the stored passkey a ceremony used.
func (u *passkeyUser) passkeyFor(credentialID []byte) *storedPasskey {
	for i := range u.passkeys {
		if string(u.passkeys[i].Credential.ID) == string(credentialID) {
			return &u.passkeys[i]
		}
	}
	return nil
}

// WebAuthnHandle returns the account's user handle, making one on first use.
// See migration 014 for why it is random.
func (s *Store) WebAuthnHandle(ctx context.Context, userID int) ([]byte, error) {
	var handle []byte
	err := s.db.QueryRowContext(ctx, `SELECT webauthn_id FROM users WHERE id = $1`, userID).Scan(&handle)
	if err != nil {
		return nil, fmt.Errorf("reading webauthn id: %w", err)
	}
	if handle != nil {
		return handle, nil
	}
	fresh := make([]byte, 32)
	if _, err := rand.Read(fresh); err != nil {
		return nil, err
	}
	// Set only if still unset, then read back: two enrolments started at once
	// must agree on one handle, or the loser's passkey would name nobody.
	if _, err := s.db.ExecContext(ctx,
		`UPDATE users SET webauthn_id = $1 WHERE id = $2 AND webauthn_id IS NULL`, fresh, userID,
	); err != nil {
		return nil, fmt.Errorf("setting webauthn id: %w", err)
	}
	if err := s.db.QueryRowContext(ctx, `SELECT webauthn_id FROM users WHERE id = $1`, userID).Scan(&handle); err != nil {
		return nil, fmt.Errorf("reading webauthn id: %w", err)
	}
	return handle, nil
}

// UserIDByWebAuthnHandle finds the account a passkey was made for. 0 if none.
func (s *Store) UserIDByWebAuthnHandle(ctx context.Context, handle []byte) (int, error) {
	var id int
	err := s.db.QueryRowContext(ctx, `SELECT id FROM users WHERE webauthn_id = $1`, handle).Scan(&id)
	if err == sql.ErrNoRows {
		return 0, nil
	}
	return id, err
}

const passkeyColumns = `id, user_id, name, created_at, last_used_at, credential, encrypted_mek_prf`

func scanPasskey(row interface{ Scan(...any) error }) (*storedPasskey, error) {
	var p storedPasskey
	var raw []byte
	if err := row.Scan(&p.ID, &p.UserID, &p.Name, &p.CreatedAt, &p.LastUsedAt, &raw, &p.EncryptedMEKPRF); err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &p.Credential); err != nil {
		return nil, fmt.Errorf("decoding credential %d: %w", p.ID, err)
	}
	p.Unlocks = p.EncryptedMEKPRF != nil
	return &p, nil
}

func (s *Store) listStoredPasskeys(ctx context.Context, userID int) ([]storedPasskey, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+passkeyColumns+` FROM passkeys WHERE user_id = $1 ORDER BY created_at, id`, userID)
	if err != nil {
		return nil, fmt.Errorf("listing passkeys: %w", err)
	}
	defer rows.Close()
	var out []storedPasskey
	for rows.Next() {
		p, err := scanPasskey(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *p)
	}
	return out, rows.Err()
}

// ListPasskeys returns an account's passkeys, oldest first.
func (s *Store) ListPasskeys(ctx context.Context, userID int) ([]Passkey, error) {
	stored, err := s.listStoredPasskeys(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]Passkey, len(stored))
	for i, p := range stored {
		out[i] = p.Passkey
	}
	return out, nil
}

// passkeyUser loads an account with its passkeys, as the ceremonies need it.
// The handle is made if the account has none yet.
func (s *Store) passkeyUser(ctx context.Context, user *User) (*passkeyUser, error) {
	handle, err := s.WebAuthnHandle(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	passkeys, err := s.listStoredPasskeys(ctx, user.ID)
	if err != nil {
		return nil, err
	}
	return &passkeyUser{user: user, handle: handle, passkeys: passkeys}, nil
}

// AddPasskey stores a newly created passkey.
func (s *Store) AddPasskey(ctx context.Context, userID int, name string, cred *webauthn.Credential) (*Passkey, error) {
	raw, err := json.Marshal(cred)
	if err != nil {
		return nil, fmt.Errorf("encoding credential: %w", err)
	}
	p, err := scanPasskey(s.db.QueryRowContext(ctx,
		`INSERT INTO passkeys (user_id, credential_id, credential, name) VALUES ($1, $2, $3, $4)
		 RETURNING `+passkeyColumns,
		userID, cred.ID, raw, name,
	))
	if err != nil {
		return nil, fmt.Errorf("adding passkey: %w", err)
	}
	return &p.Passkey, nil
}

// PasskeyUsed records a sign-in or unlock: the updated credential (its sign
// count and flags move on each use) and when.
func (s *Store) PasskeyUsed(ctx context.Context, passkeyID int, cred *webauthn.Credential) error {
	raw, err := json.Marshal(cred)
	if err != nil {
		return fmt.Errorf("encoding credential: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`UPDATE passkeys SET credential = $1, last_used_at = NOW() WHERE id = $2`, raw, passkeyID)
	return err
}

// SetPasskeyVaultKey stores the vault key wrapped under one passkey's PRF
// secret. Only the account's own passkey; false if there is no such passkey.
func (s *Store) SetPasskeyVaultKey(ctx context.Context, userID, passkeyID int, wrapped string) (bool, error) {
	res, err := s.db.ExecContext(ctx,
		`UPDATE passkeys SET encrypted_mek_prf = $1 WHERE id = $2 AND user_id = $3`, wrapped, passkeyID, userID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// DeletePasskey removes one of the account's passkeys, and with it — by the
// cascade in migration 014 — the sessions it started. False if there was none.
func (s *Store) DeletePasskey(ctx context.Context, userID, passkeyID int) (bool, error) {
	res, err := s.db.ExecContext(ctx, `DELETE FROM passkeys WHERE id = $1 AND user_id = $2`, passkeyID, userID)
	if err != nil {
		return false, err
	}
	n, err := res.RowsAffected()
	return n == 1, err
}

// CreatePasskeyChallenge keeps a ceremony's session data until its finish.
// Returns the raw token the browser hands back.
func (s *Store) CreatePasskeyChallenge(ctx context.Context, userID *int, purpose string, data *webauthn.SessionData) (string, error) {
	raw, err := generateToken()
	if err != nil {
		return "", fmt.Errorf("generating passkey challenge: %w", err)
	}
	encoded, err := json.Marshal(data)
	if err != nil {
		return "", fmt.Errorf("encoding passkey challenge: %w", err)
	}
	_, err = s.db.ExecContext(ctx,
		`INSERT INTO passkey_challenges (token_hash, user_id, purpose, session_data, expires_at)
		 VALUES ($1, $2, $3, $4, $5)`,
		hashToken(raw), userID, purpose, encoded, time.Now().Add(passkeyChallengeDuration),
	)
	if err != nil {
		return "", fmt.Errorf("storing passkey challenge: %w", err)
	}
	return raw, nil
}

// TakePasskeyChallenge consumes a ceremony's session data. It is single-use
// whether or not the ceremony then succeeds, so a response cannot be replayed
// against it. nil if the token is unknown, expired, for another purpose or for
// another account (userID nil for a sign-in, which has nobody yet).
func (s *Store) TakePasskeyChallenge(ctx context.Context, rawToken string, userID *int, purpose string) (*webauthn.SessionData, error) {
	var encoded []byte
	var owner sql.NullInt64
	var stored string
	err := s.db.QueryRowContext(ctx,
		`DELETE FROM passkey_challenges WHERE token_hash = $1 AND expires_at > NOW()
		 RETURNING session_data, user_id, purpose`,
		hashToken(rawToken),
	).Scan(&encoded, &owner, &stored)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("taking passkey challenge: %w", err)
	}
	if stored != purpose || owner.Valid != (userID != nil) || (userID != nil && int(owner.Int64) != *userID) {
		return nil, nil
	}
	var data webauthn.SessionData
	if err := json.Unmarshal(encoded, &data); err != nil {
		return nil, fmt.Errorf("decoding passkey challenge: %w", err)
	}
	return &data, nil
}

func (s *Store) DeleteExpiredPasskeyChallenges(ctx context.Context) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM passkey_challenges WHERE expires_at <= NOW()`)
	return err
}

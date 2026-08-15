package vault

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// ErrVaultConflict means the stored vault changed since the client last read it,
// so the write was refused rather than silently overwriting the newer copy.
var ErrVaultConflict = errors.New("vault was modified by another client")

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

func (s *Store) GetVault(ctx context.Context, userID int) (*Vault, error) {
	v := &Vault{UserID: userID}
	err := s.db.QueryRowContext(ctx,
		`SELECT ciphertext, nonce, version, updated_at FROM user_vaults WHERE user_id = $1`,
		userID,
	).Scan(&v.Ciphertext, &v.Nonce, &v.Version, &v.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return v, nil
}

// PutVault writes the encrypted vault and returns the new updated_at, which the
// client keeps as the token for its next write.
//
// When expectedUpdatedAt is non-nil the write is conditional: it lands only if
// the stored row still carries that timestamp. Without this a stale client — a
// tab left open across a deploy, or a second device — silently overwrites the
// whole vault with whatever it held in memory, and the newer copy is gone. The
// vault is one opaque blob, so there is no partial merge to fall back on;
// refusing the write is the only way not to lose data.
//
// A nil expectedUpdatedAt writes unconditionally, which is what the first save
// after key setup and the recovery flow need — there is nothing to conflict with.
func (s *Store) PutVault(
	ctx context.Context,
	userID int,
	ciphertext, nonce []byte,
	version int,
	expectedUpdatedAt *time.Time,
) (time.Time, error) {
	const unconditional = `
		INSERT INTO user_vaults (user_id, ciphertext, nonce, version, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET ciphertext = EXCLUDED.ciphertext, nonce = EXCLUDED.nonce,
		    version = EXCLUDED.version, updated_at = NOW()
		RETURNING updated_at`

	// The WHERE guards the DO UPDATE branch only. With no existing row the INSERT
	// still runs, which is right — there is nothing to clobber. With a row that
	// has moved on, nothing is returned and we report the conflict.
	const conditional = `
		INSERT INTO user_vaults (user_id, ciphertext, nonce, version, updated_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (user_id) DO UPDATE
		SET ciphertext = EXCLUDED.ciphertext, nonce = EXCLUDED.nonce,
		    version = EXCLUDED.version, updated_at = NOW()
		WHERE user_vaults.updated_at = $5
		RETURNING updated_at`

	var updatedAt time.Time
	var err error

	if expectedUpdatedAt == nil {
		err = s.db.QueryRowContext(ctx, unconditional, userID, ciphertext, nonce, version).Scan(&updatedAt)
	} else {
		err = s.db.QueryRowContext(ctx, conditional, userID, ciphertext, nonce, version, *expectedUpdatedAt).Scan(&updatedAt)
		if errors.Is(err, sql.ErrNoRows) {
			return time.Time{}, ErrVaultConflict
		}
	}

	return updatedAt, err
}

func (s *Store) GetEncryptedMEK(ctx context.Context, userID int) (encryptedMEK string, iterations int, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT encrypted_mek, kek_iterations FROM users WHERE id = $1`,
		userID,
	).Scan(&encryptedMEK, &iterations)
	return
}

func (s *Store) SetEncryptedMEK(ctx context.Context, userID int, encryptedMEK, recoveryKeyHash, encryptedMEKRecovery string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET encrypted_mek = $2, recovery_key_hash = $3, encrypted_mek_recovery = $4 WHERE id = $1`,
		userID, encryptedMEK, recoveryKeyHash, encryptedMEKRecovery,
	)
	return err
}

func (s *Store) UpdateEncryptedMEK(ctx context.Context, userID int, encryptedMEK string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE users SET encrypted_mek = $2 WHERE id = $1`,
		userID, encryptedMEK,
	)
	return err
}

func (s *Store) GetRecoveryData(ctx context.Context, userID int) (recoveryKeyHash, encryptedMEKRecovery string, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT recovery_key_hash, encrypted_mek_recovery FROM users WHERE id = $1`,
		userID,
	).Scan(&recoveryKeyHash, &encryptedMEKRecovery)
	return
}

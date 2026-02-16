package vault

import (
	"context"
	"database/sql"
)

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

func (s *Store) PutVault(ctx context.Context, userID int, ciphertext, nonce []byte, version int) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO user_vaults (user_id, ciphertext, nonce, version, updated_at)
		 VALUES ($1, $2, $3, $4, NOW())
		 ON CONFLICT (user_id) DO UPDATE
		 SET ciphertext = EXCLUDED.ciphertext, nonce = EXCLUDED.nonce,
		     version = EXCLUDED.version, updated_at = NOW()`,
		userID, ciphertext, nonce, version,
	)
	return err
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

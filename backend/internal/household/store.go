package household

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

// ErrConflict means the stored vault changed since the client last read it, so
// the write was refused rather than silently replacing the newer copy.
var ErrConflict = errors.New("household vault was modified by another member")

// ErrNotMember means the user is not in the household, or it does not exist.
//
// One error for both, on purpose. Distinguishing them would let anyone with an
// account learn which household ids exist by watching 403 and 404 diverge.
var ErrNotMember = errors.New("not a member of this household")

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Create writes a household and its first member in one transaction.
//
// The two halves are useless apart: a vault nobody holds a key to can never be
// opened, and a membership row pointing at nothing is a household that appears
// in a list and fails when touched. Neither is a state worth being able to
// reach.
func (s *Store) Create(ctx context.Context, userID int, req CreateRequest, ciphertext, nonce []byte) (int, time.Time, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, time.Time{}, err
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed

	var id int
	var updatedAt time.Time
	err = tx.QueryRowContext(ctx,
		`INSERT INTO shared_vaults (encrypted_name, ciphertext, nonce, version)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, updated_at`,
		req.EncryptedName, ciphertext, nonce, req.Version,
	).Scan(&id, &updatedAt)
	if err != nil {
		return 0, time.Time{}, err
	}

	// The creator owns it, and holds their copy sealed under their own MEK —
	// symmetric, because they are both sender and recipient here.
	_, err = tx.ExecContext(ctx,
		`INSERT INTO shared_vault_members (vault_id, user_id, wrapped_key, wrap_kind, is_owner)
		 VALUES ($1, $2, $3, $4, TRUE)`,
		id, userID, req.WrappedKey, WrapSelf,
	)
	if err != nil {
		return 0, time.Time{}, err
	}

	if err := tx.Commit(); err != nil {
		return 0, time.Time{}, err
	}
	return id, updatedAt, nil
}

// ListForUser returns every household the user belongs to, newest first.
//
// Without the payloads: this is what draws the switch, and a menu should not
// cost one decryption per entry.
func (s *Store) ListForUser(ctx context.Context, userID int) ([]Household, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT v.id, v.encrypted_name, m.wrapped_key, m.wrap_kind, m.is_owner, v.version, v.updated_at
		 FROM shared_vaults v
		 JOIN shared_vault_members m ON m.vault_id = v.id
		 WHERE m.user_id = $1
		 ORDER BY v.created_at DESC, v.id DESC`,
		userID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	// Non-nil so an empty list marshals as [] rather than null, which spares
	// every caller a null check for the ordinary case of belonging to none.
	households := []Household{}
	for rows.Next() {
		var h Household
		if err := rows.Scan(&h.ID, &h.EncryptedName, &h.WrappedKey, &h.WrapKind, &h.IsOwner, &h.Version, &h.UpdatedAt); err != nil {
			return nil, err
		}
		households = append(households, h)
	}
	return households, rows.Err()
}

// Membership reports whether the user belongs to the household, and whether
// they own it.
//
// Every other method takes the user id and checks membership itself rather than
// trusting a caller to have checked: authorisation that lives in the handler is
// authorisation somebody can forget to write.
func (s *Store) Membership(ctx context.Context, vaultID, userID int) (isOwner bool, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT is_owner FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`,
		vaultID, userID,
	).Scan(&isOwner)
	if errors.Is(err, sql.ErrNoRows) {
		return false, ErrNotMember
	}
	return isOwner, err
}

// GetVault returns the payload, if the user is a member.
func (s *Store) GetVault(ctx context.Context, vaultID, userID int) (*Vault, error) {
	var v Vault
	err := s.db.QueryRowContext(ctx,
		`SELECT v.ciphertext, v.nonce, v.version, v.updated_at
		 FROM shared_vaults v
		 JOIN shared_vault_members m ON m.vault_id = v.id
		 WHERE v.id = $1 AND m.user_id = $2`,
		vaultID, userID,
	).Scan(&v.Ciphertext, &v.Nonce, &v.Version, &v.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, ErrNotMember
	}
	if err != nil {
		return nil, err
	}
	return &v, nil
}

// PutVault replaces the payload, if the user is a member.
//
// The membership test is part of the UPDATE rather than a query before it, so
// there is no window between deciding someone may write and their write landing.
func (s *Store) PutVault(
	ctx context.Context,
	vaultID, userID int,
	ciphertext, nonce []byte,
	version int,
	expectedUpdatedAt *time.Time,
) (time.Time, error) {
	// Unlike a personal vault there is no INSERT branch: a household row is
	// created with its payload, so by the time anyone writes, the row exists.
	const base = `
		UPDATE shared_vaults
		SET ciphertext = $3, nonce = $4, version = $5, updated_at = NOW()
		WHERE id = $1
		  AND EXISTS (SELECT 1 FROM shared_vault_members
		              WHERE vault_id = $1 AND user_id = $2)`

	query := base + ` RETURNING updated_at`
	args := []any{vaultID, userID, ciphertext, nonce, version}

	if expectedUpdatedAt != nil {
		query = base + ` AND updated_at = $6 RETURNING updated_at`
		args = append(args, *expectedUpdatedAt)
	}

	var updatedAt time.Time
	err := s.db.QueryRowContext(ctx, query, args...).Scan(&updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		// Nothing came back, and the two reasons are not the same. Ask whether
		// they are a member at all: if they are, the row moved on and this is a
		// conflict they can recover from by reloading; if they are not, saying
		// "conflict" would confirm the household exists.
		if _, memberErr := s.Membership(ctx, vaultID, userID); memberErr != nil {
			return time.Time{}, memberErr
		}
		if expectedUpdatedAt != nil {
			return time.Time{}, ErrConflict
		}
		// A member, no precondition, and still no row: the household is gone.
		return time.Time{}, ErrNotMember
	}
	return updatedAt, err
}

// Rename replaces the encrypted name, if the user is a member.
//
// Any member may, not only the owner. A household's name is what everybody in
// it reads on every screen, and the owner is not a different kind of person.
func (s *Store) Rename(ctx context.Context, vaultID, userID int, encryptedName string) error {
	res, err := s.db.ExecContext(ctx,
		`UPDATE shared_vaults SET encrypted_name = $3
		 WHERE id = $1
		   AND EXISTS (SELECT 1 FROM shared_vault_members
		               WHERE vault_id = $1 AND user_id = $2)`,
		vaultID, userID, encryptedName,
	)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotMember
	}
	return nil
}

// Delete removes a household and, by cascade, its membership rows. Owner only.
func (s *Store) Delete(ctx context.Context, vaultID, userID int) error {
	isOwner, err := s.Membership(ctx, vaultID, userID)
	if err != nil {
		return err
	}
	if !isOwner {
		return ErrNotMember
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM shared_vaults WHERE id = $1`, vaultID)
	return err
}

package household

import (
	"context"
	"database/sql"
	"errors"
	"strconv"
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
		`INSERT INTO shared_vault_members (vault_id, user_id, wrapped_key, wrap_kind, role)
		 VALUES ($1, $2, $3, $4, $5)`,
		id, userID, req.WrappedKey, WrapSelf, RoleOwner,
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
		`SELECT v.id, v.encrypted_name, m.wrapped_key, m.wrap_kind, m.role, v.version, v.key_epoch, v.updated_at
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
		if err := rows.Scan(&h.ID, &h.EncryptedName, &h.WrappedKey, &h.WrapKind, &h.Role, &h.Version, &h.KeyEpoch, &h.UpdatedAt); err != nil {
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
func (s *Store) Membership(ctx context.Context, vaultID, userID int) (role string, err error) {
	err = s.db.QueryRowContext(ctx,
		`SELECT role FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`,
		vaultID, userID,
	).Scan(&role)
	if errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotMember
	}
	return role, err
}

// ErrReadOnly means the user belongs to the household but may only look at it.
//
// Distinct from ErrNotMember for the same reason ErrNotOwner is: a reader
// learning they cannot write discovers nothing they did not already know.
var ErrReadOnly = errors.New("this household is read-only for you")

// requireWriter admits an owner or a writer, and refuses a reader.
func (s *Store) requireWriter(ctx context.Context, vaultID, userID int) error {
	role, err := s.Membership(ctx, vaultID, userID)
	if err != nil {
		return err
	}
	if !mayWrite(role) {
		return ErrReadOnly
	}
	return nil
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
	// The role test is part of the UPDATE rather than a query before it, so there
	// is no window between deciding somebody may write and their write landing.
	const base = `
		UPDATE shared_vaults
		SET ciphertext = $3, nonce = $4, version = $5, updated_at = NOW()
		WHERE id = $1
		  AND EXISTS (SELECT 1 FROM shared_vault_members
		              WHERE vault_id = $1 AND user_id = $2
		                AND role IN ('owner', 'writer'))`

	query := base + ` RETURNING updated_at`
	args := []any{vaultID, userID, ciphertext, nonce, version}

	if expectedUpdatedAt != nil {
		query = base + ` AND updated_at = $6 RETURNING updated_at`
		args = append(args, *expectedUpdatedAt)
	}

	var updatedAt time.Time
	err := s.db.QueryRowContext(ctx, query, args...).Scan(&updatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		// Nothing came back, and the reasons are not the same. Not a member at
		// all, a reader, a stale precondition, or a household that has gone —
		// and only one of those is something reloading fixes.
		//
		// Asked in that order deliberately: a reader told "conflict" would
		// reload, try again, and be told the same thing forever.
		if err := s.requireWriter(ctx, vaultID, userID); err != nil {
			return time.Time{}, err
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
	// Asked before the write rather than inferred from it, so a reader is told
	// they may not rather than told the household does not exist.
	if err := s.requireWriter(ctx, vaultID, userID); err != nil {
		return err
	}

	res, err := s.db.ExecContext(ctx,
		`UPDATE shared_vaults SET encrypted_name = $3
		 WHERE id = $1
		   AND EXISTS (SELECT 1 FROM shared_vault_members
		               WHERE vault_id = $1 AND user_id = $2
		                 AND role IN ('owner', 'writer'))`,
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
	role, err := s.Membership(ctx, vaultID, userID)
	if err != nil {
		return err
	}
	if role != RoleOwner {
		return ErrNotMember
	}
	_, err = s.db.ExecContext(ctx, `DELETE FROM shared_vaults WHERE id = $1`, vaultID)
	return err
}

// ErrNotOwner means the user belongs to the household but does not own it.
//
// Distinct from ErrNotMember on purpose: a member learning they are not the
// owner discovers nothing they did not already know, whereas a stranger
// learning a household exists does.
var ErrNotOwner = errors.New("only the owner may do this")

// ErrInviteInvalid covers an invitation that is missing, expired, already used,
// or addressed to somebody else. One error for all of them, so a leaked link
// cannot be used to probe which of those it is.
var ErrInviteInvalid = errors.New("invitation is not valid")

func (s *Store) requireOwner(ctx context.Context, vaultID, userID int) error {
	role, err := s.Membership(ctx, vaultID, userID)
	if err != nil {
		return err
	}
	if role != RoleOwner {
		return ErrNotOwner
	}
	return nil
}

// CreateInvite records that somebody was asked to join. Owner only.
func (s *Store) CreateInvite(ctx context.Context, vaultID, userID int, req CreateInviteRequest, expiresAt time.Time) (int, error) {
	if err := s.requireOwner(ctx, vaultID, userID); err != nil {
		return 0, err
	}
	// Checked here as well as in the handler, so the rule lives with the data
	// rather than with one of its callers. A column constraint would catch it
	// too, but as a database error nobody can act on rather than as an answer.
	if !validGrantableRole(req.Role) {
		return 0, ErrInvalidRole
	}
	var id int
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO shared_vault_invites (vault_id, token_hash, invited_email, secret_sealed, token_sealed, expires_at, role)
		 VALUES ($1, $2, $3, $4, $5, $6, $7)
		 ON CONFLICT (vault_id, lower(invited_email)) DO UPDATE
		 SET token_hash = EXCLUDED.token_hash, secret_sealed = EXCLUDED.secret_sealed,
		     token_sealed = EXCLUDED.token_sealed,
		     expires_at = EXCLUDED.expires_at, created_at = NOW(), role = EXCLUDED.role,
		     accepted_user_id = NULL, public_key_mac = NULL, accepted_at = NULL
		 RETURNING id`,
		vaultID, req.TokenHash, req.InvitedEmail, req.SecretSealed, req.TokenSealed, expiresAt, req.Role,
	).Scan(&id)
	return id, err
}

// ListInvites returns the household's pending invitations, with the accepting
// user's public halves once there is one.
//
// Any member may see them, not only the owner: an invitation is a fact about
// the household, and somebody about to be handed a key is not a secret from the
// people they are joining.
func (s *Store) ListInvites(ctx context.Context, vaultID, userID int) ([]Invite, error) {
	role, err := s.Membership(ctx, vaultID, userID)
	if err != nil {
		return nil, err
	}
	// Everyone sees who has been asked — somebody about to join is not a secret
	// from the people they are joining. Only the owner gets the means to
	// re-deliver the invitation, because only the owner can do anything with it.
	owner := role == RoleOwner

	rows, err := s.db.QueryContext(ctx,
		`SELECT i.id, i.invited_email, i.secret_sealed, i.token_sealed, i.role, i.expires_at, i.created_at,
		        i.accepted_user_id, i.accepted_at, i.public_key_mac,
		        COALESCE(u.public_key, ''), COALESCE(u.verifying_key, '')
		 FROM shared_vault_invites i
		 LEFT JOIN users u ON u.id = i.accepted_user_id
		 WHERE i.vault_id = $1 AND i.expires_at > NOW()
		 ORDER BY i.created_at DESC`,
		vaultID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	invites := []Invite{}
	for rows.Next() {
		var in Invite
		var mac sql.NullString
		var acceptedAt sql.NullTime
		var acceptedBy sql.NullInt64
		if err := rows.Scan(&in.ID, &in.InvitedEmail, &in.SecretSealed, &in.TokenSealed, &in.Role, &in.ExpiresAt, &in.CreatedAt,
			&acceptedBy, &acceptedAt, &mac, &in.PublicKey, &in.VerifyingKey); err != nil {
			return nil, err
		}
		if acceptedBy.Valid {
			id := int(acceptedBy.Int64)
			in.AcceptedUserID = &id
		}
		if acceptedAt.Valid {
			t := acceptedAt.Time
			in.AcceptedAt = &t
		}
		in.PublicKeyMAC = mac.String
		if !owner {
			in.SecretSealed = ""
			in.TokenSealed = ""
		}
		invites = append(invites, in)
	}
	return invites, rows.Err()
}

// DeleteInvite withdraws an invitation. Owner only.
func (s *Store) DeleteInvite(ctx context.Context, vaultID, userID, inviteID int) error {
	if err := s.requireOwner(ctx, vaultID, userID); err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx,
		`DELETE FROM shared_vault_invites WHERE id = $1 AND vault_id = $2`, inviteID, vaultID)
	if err != nil {
		return err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrInviteInvalid
	}
	return nil
}

// AcceptInvite binds an account to an invitation and records the MAC it posted.
//
// Nothing is granted here. The invitee still holds no key and can read nothing;
// all that has happened is that "somebody at this address" became "this account,
// with this public key, vouched for by a MAC only the link-holder could compute".
func (s *Store) AcceptInvite(ctx context.Context, tokenHash string, userID int, email, mac string) (int, error) {
	var vaultID int
	err := s.db.QueryRowContext(ctx,
		`UPDATE shared_vault_invites
		 SET accepted_user_id = $2, public_key_mac = $3, accepted_at = NOW()
		 WHERE token_hash = $1
		   AND expires_at > NOW()
		   AND lower(invited_email) = lower($4)
		   AND accepted_user_id IS NULL
		 RETURNING vault_id`,
		tokenHash, userID, mac, email,
	).Scan(&vaultID)
	if errors.Is(err, sql.ErrNoRows) {
		return 0, ErrInviteInvalid
	}
	return vaultID, err
}

// ConfirmInvite writes the membership and consumes the invitation. Owner only.
//
// One transaction, because an invitation consumed without a membership written
// is somebody who accepted and can never be let in, and a membership written
// without the invitation consumed is a second grant waiting to happen.
func (s *Store) ConfirmInvite(ctx context.Context, vaultID, userID, inviteID int, wrappedKey string) error {
	if err := s.requireOwner(ctx, vaultID, userID); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed

	var invitee int
	var role string
	err = tx.QueryRowContext(ctx,
		`SELECT accepted_user_id, role FROM shared_vault_invites
		 WHERE id = $1 AND vault_id = $2 AND expires_at > NOW() AND accepted_user_id IS NOT NULL`,
		inviteID, vaultID,
	).Scan(&invitee, &role)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrInviteInvalid
	}
	if err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		`INSERT INTO shared_vault_members (vault_id, user_id, wrapped_key, wrap_kind, role)
		 VALUES ($1, $2, $3, $4, $5)
		 ON CONFLICT (vault_id, user_id) DO UPDATE
		 SET wrapped_key = EXCLUDED.wrapped_key, wrap_kind = EXCLUDED.wrap_kind`,
		vaultID, invitee, wrappedKey, WrapGranted, role,
	); err != nil {
		return err
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM shared_vault_invites WHERE id = $1`, inviteID); err != nil {
		return err
	}
	return tx.Commit()
}

// ListMembers returns everybody in the household, with their public halves.
func (s *Store) ListMembers(ctx context.Context, vaultID, userID int) ([]Member, error) {
	if _, err := s.Membership(ctx, vaultID, userID); err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT m.user_id, u.email, m.role, m.wrap_kind,
		        COALESCE(u.public_key, ''), COALESCE(u.verifying_key, ''), m.joined_at
		 FROM shared_vault_members m
		 JOIN users u ON u.id = m.user_id
		 WHERE m.vault_id = $1
		 ORDER BY (m.role = 'owner') DESC, m.joined_at`,
		vaultID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	members := []Member{}
	for rows.Next() {
		var m Member
		if err := rows.Scan(&m.UserID, &m.Email, &m.Role, &m.WrapKind,
			&m.PublicKey, &m.VerifyingKey, &m.JoinedAt); err != nil {
			return nil, err
		}
		members = append(members, m)
	}
	return members, rows.Err()
}

// RemoveMember takes somebody out of a household.
//
// Leaving is always unilateral: anybody may remove themselves, at any time,
// without the others' cooperation. Removing somebody *else* is the owner's
// alone — the one asymmetry in the model.
//
// Note what this does not do. It stops the server serving that person new
// ciphertext; it does not take back the key they already hold. Only a rekey
// does that, and only for what is written afterwards.
func (s *Store) RemoveMember(ctx context.Context, vaultID, userID, targetID int) error {
	if userID != targetID {
		if err := s.requireOwner(ctx, vaultID, userID); err != nil {
			return err
		}
	} else if _, err := s.Membership(ctx, vaultID, userID); err != nil {
		return err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed

	var leavingRole string
	err = tx.QueryRowContext(ctx,
		`DELETE FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2 RETURNING role`,
		vaultID, targetID,
	).Scan(&leavingRole)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotMember
	}
	if err != nil {
		return err
	}

	// Ownership passes rather than evaporating.
	//
	// Without this an owner who left a household that still had people in it
	// stranded it: everybody could read and write, and nobody could ever invite,
	// remove or delete again, because every one of those asks for an owner and
	// there was none. The household could only end by each remaining member
	// leaving one at a time.
	//
	// To the longest-standing, which is the least surprising rule available and
	// needs nobody to choose in the moment they are walking away. If nobody is
	// left the trigger from 007 takes the household with them, and there is
	// nothing to pass on.
	if leavingRole == RoleOwner {
		if _, err := tx.ExecContext(ctx,
			`UPDATE shared_vault_members SET role = 'owner'
			 WHERE vault_id = $1 AND user_id = (
			     SELECT user_id FROM shared_vault_members
			     WHERE vault_id = $1
			     ORDER BY joined_at, user_id
			     LIMIT 1
			 )`,
			vaultID,
		); err != nil {
			return err
		}
	}

	return tx.Commit()
}

// Rekey replaces the household key, everything encrypted under it, and every
// member's copy of it, in one statement's worth of atomicity.
//
// Owner only, and deliberately all-or-nothing: a half-applied rekey leaves
// members holding keys to different versions of the same household, which is
// not a state any of them could recover from without help.
func (s *Store) Rekey(ctx context.Context, vaultID, userID int, req RekeyRequest, ciphertext, nonce []byte) (time.Time, error) {
	if err := s.requireOwner(ctx, vaultID, userID); err != nil {
		return time.Time{}, err
	}
	// Whoever is doing this has to end up still holding it. Rekeying yourself
	// out of your own household is not a thing to let somebody do by accident.
	keeps := false
	for _, m := range req.Members {
		if m.UserID == userID {
			keeps = true
		}
	}
	if !keeps {
		return time.Time{}, ErrNotMember
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return time.Time{}, err
	}
	defer tx.Rollback() //nolint:errcheck // no-op once committed

	var updatedAt time.Time
	if err := tx.QueryRowContext(ctx,
		`UPDATE shared_vaults
		 SET encrypted_name = $2, ciphertext = $3, nonce = $4, version = $5,
		     key_epoch = key_epoch + 1, updated_at = NOW()
		 WHERE id = $1
		 RETURNING updated_at`,
		vaultID, req.EncryptedName, ciphertext, nonce, req.Version,
	).Scan(&updatedAt); err != nil {
		return time.Time{}, err
	}

	// Everyone not in the list goes. Done before the upserts so a member being
	// kept is never briefly absent.
	ids := make([]int, 0, len(req.Members))
	for _, m := range req.Members {
		ids = append(ids, m.UserID)
	}
	if _, err := tx.ExecContext(ctx,
		`DELETE FROM shared_vault_members
		 WHERE vault_id = $1 AND user_id <> ALL($2::int[])`,
		vaultID, pqIntArray(ids),
	); err != nil {
		return time.Time{}, err
	}

	for _, m := range req.Members {
		if _, err := tx.ExecContext(ctx,
			`UPDATE shared_vault_members SET wrapped_key = $3, wrap_kind = $4
			 WHERE vault_id = $1 AND user_id = $2`,
			vaultID, m.UserID, m.WrappedKey, m.WrapKind,
		); err != nil {
			return time.Time{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return time.Time{}, err
	}
	return updatedAt, nil
}

// pqIntArray renders ints as a PostgreSQL array literal.
//
// Hand-written rather than pulling in lib/pq for one call: this driver is pgx,
// the values are ints the server produced, and the alternative is a second
// Postgres library in go.mod to format a list of numbers.
func pqIntArray(ids []int) string {
	if len(ids) == 0 {
		return "{}"
	}
	out := make([]byte, 0, len(ids)*4+2)
	out = append(out, '{')
	for i, id := range ids {
		if i > 0 {
			out = append(out, ',')
		}
		out = strconv.AppendInt(out, int64(id), 10)
	}
	return string(append(out, '}'))
}

// ChangeRole moves somebody between writer and reader. Owner only.
//
// Ownership is not among the roles this can set. Passing it is a different act
// with a different consequence — the person doing it stops being the owner —
// and folding it in here would let it happen by the same gesture as a
// demotion, from a menu, on a row that looks like every other row.
func (s *Store) ChangeRole(ctx context.Context, vaultID, userID, targetID int, role string) error {
	if err := s.requireOwner(ctx, vaultID, userID); err != nil {
		return err
	}
	if !validGrantableRole(role) {
		return ErrInvalidRole
	}
	// An owner demoting themselves would leave the household unable to invite,
	// remove or promote anybody ever again — the stranding that succession
	// exists to prevent, reached by a different door.
	if userID == targetID {
		return ErrNotOwner
	}

	res, err := s.db.ExecContext(ctx,
		`UPDATE shared_vault_members SET role = $3
		 WHERE vault_id = $1 AND user_id = $2 AND role <> 'owner'`,
		vaultID, targetID, role,
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

// ErrInvalidRole means a role was asked for that cannot be granted.
var ErrInvalidRole = errors.New("that is not a role somebody can be given")

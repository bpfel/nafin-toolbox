package auth

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"sort"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
)

// Renewing an account's keys: a new password, a new vault key (MEK), and a new
// recovery key, all at once. See plans/key-separation-plan.md, phase 2.
//
// Migration stops the server receiving anything that opens a vault. It cannot
// undo what a server may have recorded before: the MEK never changed, and a
// recorded password, or a recorded recovery key, still unwraps it. Renewal is
// the answer for whoever does not trust that past. Everything sealed under the
// old MEK is sealed again under the new one, in the browser, and arrives here
// together:
//
//   - the MEK, wrapped under the new password's vault key and the new recovery
//     key's;
//   - the identity's two private keys;
//   - the personal vault, re-encrypted;
//   - this account's own copy of each household key it holds as 'self'.
//
// It is stored in one transaction, or not at all. A vault saved from another
// device in between, or a household joined, would leave something sealed under
// a key that no longer exists; both are checked and refused, and the browser
// starts again. Every other session of the account is ended: those devices hold
// the old MEK in memory and would save the vault under it.
//
// Household keys themselves are not renewed. They are shared with the other
// members; renewing one is the household's rekey.

type RenewKeysRequest struct {
	// The current password's auth key. Renewal is for version 2 accounts; a
	// version 1 account migrates first, which its next unlock does by itself.
	Secret
	NewAuthKey           string             `json:"new_auth_key"`
	EncryptedMEK         string             `json:"encrypted_mek"`
	RecoveryAuth         string             `json:"recovery_auth"`
	EncryptedMEKRecovery string             `json:"encrypted_mek_recovery"`
	EncryptedPrivateKey  string             `json:"encrypted_private_key,omitempty"`
	EncryptedSigningKey  string             `json:"encrypted_signing_key,omitempty"`
	Vault                *RenewedVault      `json:"vault,omitempty"`
	Households           []RenewedHousehold `json:"households"`
}

// RenewedVault is the personal vault under the new MEK, with the updated_at
// it was read at.
type RenewedVault struct {
	Ciphertext        string    `json:"ciphertext"`
	Nonce             string    `json:"nonce"`
	Version           int       `json:"version"`
	ExpectedUpdatedAt time.Time `json:"expected_updated_at"`
}

// RenewedHousehold is this account's own copy of a household key, sealed under
// the new MEK.
type RenewedHousehold struct {
	ID         int    `json:"id"`
	WrappedKey string `json:"wrapped_key"`
}

// Why a renewal was refused although nothing was wrong with it: the account
// moved under it. The browser reads the vault again and repeats.
var (
	errRenewVaultMoved      = errors.New("vault changed meanwhile")
	errRenewHouseholdsMoved = errors.New("households changed meanwhile")
	errRenewIdentityShape   = errors.New("identity does not match")
)

type renewal struct {
	authHash, encryptedMEK, recoveryHash, encryptedMEKRecovery string
	privateKey, signingKey                                     string
	ciphertext, nonce                                          []byte
	vaultVersion                                               int
	expectedUpdatedAt                                          *time.Time
	households                                                 []RenewedHousehold
}

// renewKeys stores a renewal in one transaction and returns the vault's new
// updated_at, if it has a vault.
func (s *Store) renewKeys(ctx context.Context, userID int, keepSession string, r renewal) (*time.Time, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	// The account row first, locked, so two renewals cannot interleave.
	var hasIdentity bool
	if err := tx.QueryRowContext(ctx,
		`SELECT public_key IS NOT NULL FROM users WHERE id = $1 FOR UPDATE`, userID,
	).Scan(&hasIdentity); err != nil {
		return nil, err
	}
	if hasIdentity != (r.privateKey != "" && r.signingKey != "") {
		return nil, errRenewIdentityShape
	}

	// Every household key held as 'self' must be among the renewed ones, and
	// nothing else: one left out would stay sealed under the old MEK, and
	// that household would no longer open.
	rows, err := tx.QueryContext(ctx,
		`SELECT vault_id FROM shared_vault_members WHERE user_id = $1 AND wrap_kind = 'self' ORDER BY vault_id`, userID)
	if err != nil {
		return nil, err
	}
	var held []int
	for rows.Next() {
		var id int
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		held = append(held, id)
	}
	rows.Close()
	sent := make([]int, len(r.households))
	for i, h := range r.households {
		sent[i] = h.ID
	}
	sort.Ints(sent)
	if fmt.Sprint(held) != fmt.Sprint(sent) {
		return nil, errRenewHouseholdsMoved
	}

	var updatedAt *time.Time
	var exists bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (SELECT 1 FROM user_vaults WHERE user_id = $1)`, userID).Scan(&exists); err != nil {
		return nil, err
	}
	if exists != (r.ciphertext != nil) {
		return nil, errRenewVaultMoved
	}
	if exists {
		var at time.Time
		err := tx.QueryRowContext(ctx,
			`UPDATE user_vaults SET ciphertext = $2, nonce = $3, version = $4, updated_at = NOW()
			  WHERE user_id = $1 AND updated_at = $5 RETURNING updated_at`,
			userID, r.ciphertext, r.nonce, r.vaultVersion, *r.expectedUpdatedAt,
		).Scan(&at)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, errRenewVaultMoved
		}
		if err != nil {
			return nil, err
		}
		updatedAt = &at
	}

	for _, h := range r.households {
		if _, err := tx.ExecContext(ctx,
			`UPDATE shared_vault_members SET wrapped_key = $3 WHERE vault_id = $1 AND user_id = $2 AND wrap_kind = 'self'`,
			h.ID, userID, h.WrappedKey); err != nil {
			return nil, err
		}
	}

	// The new password retires every trusted device, as a reset does: renewal
	// answers "somebody may have had this".
	if _, err := tx.ExecContext(ctx,
		`UPDATE users SET password_hash = $2, auth_version = 2,
		        encrypted_mek = $3, recovery_key_hash = $4, encrypted_mek_recovery = $5, recovery_version = 2,
		        encrypted_private_key = COALESCE(NULLIF($6, ''), encrypted_private_key),
		        encrypted_signing_key = COALESCE(NULLIF($7, ''), encrypted_signing_key),
		        must_change_password = FALSE, temp_password_expires_at = NULL,
		        device_epoch = device_epoch + 1
		  WHERE id = $1`,
		userID, r.authHash, r.encryptedMEK, r.recoveryHash, r.encryptedMEKRecovery, r.privateKey, r.signingKey,
	); err != nil {
		return nil, err
	}

	if _, err := tx.ExecContext(ctx,
		`DELETE FROM sessions WHERE user_id = $1 AND token_hash <> $2`, userID, hashToken(keepSession)); err != nil {
		return nil, err
	}

	return updatedAt, tx.Commit()
}

// HandleRenewKeys is POST /auth/renew-keys.
func HandleRenewKeys(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}
		cookie, err := r.Cookie("session")
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req RenewKeysRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}
		if user.AuthVersion < AuthVersionKey {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "upgrade before renewing")
			return
		}
		if req.Secret.Empty() {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "password required")
			return
		}
		if !confirmPassword(w, deps, user, req.Secret, "incorrect password") {
			return
		}
		if !ValidAuthKey(req.NewAuthKey) || !ValidAuthKey(req.RecoveryAuth) {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid auth key")
			return
		}
		// The same password would derive the same vault key a server might
		// have recorded, and renewing would protect nothing.
		if req.NewAuthKey == req.AuthKey {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "the new password must differ from the current one")
			return
		}
		if req.EncryptedMEK == "" || req.EncryptedMEKRecovery == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "rewrapped vault key required")
			return
		}

		var ren renewal
		ren.encryptedMEK, ren.encryptedMEKRecovery = req.EncryptedMEK, req.EncryptedMEKRecovery
		ren.privateKey, ren.signingKey = req.EncryptedPrivateKey, req.EncryptedSigningKey
		ren.households = req.Households
		if req.Vault != nil {
			ct, err1 := base64.StdEncoding.DecodeString(req.Vault.Ciphertext)
			nonce, err2 := base64.StdEncoding.DecodeString(req.Vault.Nonce)
			if err1 != nil || err2 != nil || len(ct) == 0 || len(nonce) == 0 {
				apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
				return
			}
			ren.ciphertext, ren.nonce, ren.vaultVersion = ct, nonce, req.Vault.Version
			at := req.Vault.ExpectedUpdatedAt
			ren.expectedUpdatedAt = &at
		}
		for _, h := range ren.households {
			if h.WrappedKey == "" {
				apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
				return
			}
		}
		if ren.authHash, err = HashPassword(req.NewAuthKey); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if ren.recoveryHash, err = HashPassword(req.RecoveryAuth); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		updatedAt, err := deps.Store.renewKeys(r.Context(), user.ID, cookie.Value, ren)
		switch {
		case errors.Is(err, errRenewVaultMoved), errors.Is(err, errRenewHouseholdsMoved), errors.Is(err, errRenewIdentityShape):
			apierror.Write(w, apierror.Auth, http.StatusConflict, "changed while renewing")
			return
		case err != nil:
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditKeysRenewed, r, map[string]any{"households": len(ren.households)})
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"status": "ok", "vault_updated_at": updatedAt})
	}
}

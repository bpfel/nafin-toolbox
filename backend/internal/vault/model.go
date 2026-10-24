package vault

import "time"

// Vault represents the encrypted vault stored per user.
type Vault struct {
	UserID     int    `json:"-"`
	Ciphertext []byte `json:"ciphertext"`
	Nonce      []byte `json:"nonce"`
	// Version is reported by the client and never verified — the payload is
	// encrypted and the real version lives inside it. Useful only for seeing how
	// far a schema migration has rolled out; it says what the client claimed, not
	// what the ciphertext holds.
	Version   int       `json:"version"`
	UpdatedAt time.Time `json:"updated_at"`
}

// VaultPayload is what the client sends/receives (base64-encoded).
type VaultPayload struct {
	Ciphertext string `json:"ciphertext"`
	Nonce      string `json:"nonce"`
	// Advisory, as on Vault: the server stores it without being able to check it.
	Version int `json:"version"`

	// ExpectedUpdatedAt is the updated_at the client last saw. When set, the
	// write is refused with 409 if the stored vault has moved on since — which
	// is how a stale tab is stopped from overwriting a newer vault wholesale.
	// Omitted for the first save after key setup and for recovery, where there
	// is nothing to conflict with.
	ExpectedUpdatedAt *time.Time `json:"expected_updated_at,omitempty"`
}

// GetVaultResponse is the stored vault as the client loads it. UpdatedAt is
// the precondition for the client's first write: without it that write goes
// unconditionally and overwrites whatever another device saved in between.
type GetVaultResponse struct {
	Ciphertext string    `json:"ciphertext"`
	Nonce      string    `json:"nonce"`
	Version    int       `json:"version"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// PutVaultResponse hands back the new updated_at, which becomes the client's
// precondition for its next write.
type PutVaultResponse struct {
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updated_at"`
}

// Identity is the pair of keypairs that lets one user hand a key to another.
//
// Everything else in the vault is symmetric, which works only because one
// person opens it. Wrapping a shared vault's key for a partner cannot be done
// that way — it would mean knowing their password — so each user carries a
// public half others can wrap to, and a signing half that says who did the
// wrapping.
//
// The server stores all four fields and understands none of them: two are
// public by design, and two are ciphertext under a key it never sees.
type Identity struct {
	// RSA-2048-OAEP-SHA256 public key, SPKI, base64.
	PublicKey string `json:"public_key"`
	// The matching private key, wrapped under the MEK.
	EncryptedPrivateKey string `json:"encrypted_private_key"`
	// Ed25519 public key, raw 32 bytes, base64.
	VerifyingKey string `json:"verifying_key"`
	// The matching Ed25519 private key, wrapped under the MEK.
	EncryptedSigningKey string `json:"encrypted_signing_key"`
}

// Complete reports whether all four halves are present.
//
// Either an identity is whole or the user has none: a public key without its
// private half would invite others to wrap keys this user can never unwrap.
func (i Identity) Complete() bool {
	return i.PublicKey != "" && i.EncryptedPrivateKey != "" &&
		i.VerifyingKey != "" && i.EncryptedSigningKey != ""
}

// Empty reports whether none of the four halves is present, which is what every
// user created before identities existed looks like.
func (i Identity) Empty() bool {
	return i.PublicKey == "" && i.EncryptedPrivateKey == "" &&
		i.VerifyingKey == "" && i.EncryptedSigningKey == ""
}

// KeysResponse is returned by GET /vault/keys.
type KeysResponse struct {
	EncryptedMEK string `json:"encrypted_mek"`
	Iterations   int    `json:"iterations"`
	// How encrypted_mek_recovery is wrapped: 1, under PBKDF2 of the recovery
	// key itself; 2, under a recovery KEK the server never receives. See
	// plans/key-separation-plan.md.
	RecoveryVersion int `json:"recovery_version"`
	// Inline rather than nested, so a client reads one flat object. Every field
	// is empty for a user who set their vault up before identities existed.
	Identity
}

// KeySetupRequest is sent by POST /vault/keys (initial setup).
type KeySetupRequest struct {
	EncryptedMEK string `json:"encrypted_mek"`
	// Derived from the recovery key in the browser; the recovery key itself
	// never reaches the server (it used to, as recovery_key_hash, unhashed).
	RecoveryAuth         string `json:"recovery_auth"`
	EncryptedMEKRecovery string `json:"encrypted_mek_recovery"`
	Identity
}

// KeyUpdateRequest is sent by PUT /vault/keys (password change re-wrap).
type KeyUpdateRequest struct {
	EncryptedMEK string `json:"encrypted_mek"`
}

// RecoveryRequest is sent by POST /vault/recovery.
// RecoveryRequest is sent by POST /vault/recovery: the recovery key itself for
// a version 1 recovery, its auth key for version 2. The browser learns which
// from recovery_version on GET /keys.
type RecoveryRequest struct {
	RecoveryKey  string `json:"recovery_key,omitempty"`
	RecoveryAuth string `json:"recovery_auth,omitempty"`
}

// RecoveryResponse is returned after successful recovery verification.
type RecoveryResponse struct {
	EncryptedMEKRecovery string `json:"encrypted_mek_recovery"`
	RecoveryVersion      int    `json:"recovery_version"`
	// Carried here as well as on KeysResponse, because recovery is the one path
	// that reaches an unlocked vault without going through GET /keys. The
	// identity is sealed under the MEK rather than the password, so it survives
	// a password reset untouched — and a user who lost it would lose their place
	// in every household that had wrapped a key to them.
	Identity
}

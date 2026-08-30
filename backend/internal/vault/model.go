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

// PutVaultResponse hands back the new updated_at, which becomes the client's
// precondition for its next write.
type PutVaultResponse struct {
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updated_at"`
}

// KeysResponse is returned by GET /vault/keys.
type KeysResponse struct {
	EncryptedMEK string `json:"encrypted_mek"`
	Iterations   int    `json:"iterations"`
}

// KeySetupRequest is sent by POST /vault/keys (initial setup).
type KeySetupRequest struct {
	EncryptedMEK         string `json:"encrypted_mek"`
	RecoveryKeyHash      string `json:"recovery_key_hash"`
	EncryptedMEKRecovery string `json:"encrypted_mek_recovery"`
}

// KeyUpdateRequest is sent by PUT /vault/keys (password change re-wrap).
type KeyUpdateRequest struct {
	EncryptedMEK string `json:"encrypted_mek"`
}

// RecoveryRequest is sent by POST /vault/recovery.
type RecoveryRequest struct {
	RecoveryKey string `json:"recovery_key"`
}

// RecoveryResponse is returned after successful recovery verification.
type RecoveryResponse struct {
	EncryptedMEKRecovery string `json:"encrypted_mek_recovery"`
}

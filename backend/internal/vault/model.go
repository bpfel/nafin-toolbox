package vault

import "time"

// Vault represents the encrypted vault stored per user.
type Vault struct {
	UserID     int       `json:"-"`
	Ciphertext []byte    `json:"ciphertext"`
	Nonce      []byte    `json:"nonce"`
	Version    int       `json:"version"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// VaultPayload is what the client sends/receives (base64-encoded).
type VaultPayload struct {
	Ciphertext string `json:"ciphertext"`
	Nonce      string `json:"nonce"`
	Version    int    `json:"version"`
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

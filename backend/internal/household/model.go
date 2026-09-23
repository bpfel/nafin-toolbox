package household

import "time"

// Household is one shared vault, as its member sees it in a list.
//
// Deliberately without the blob: the switch has to name every household a user
// belongs to, and fetching each one's contents to draw a menu is exactly the
// work the encrypted-name column exists to avoid.
type Household struct {
	ID int `json:"id"`
	// Sealed under the shared vault key. The server has never read it.
	EncryptedName string `json:"encrypted_name"`
	// This member's copy of that key, and how it is wrapped.
	WrappedKey string    `json:"wrapped_key"`
	WrapKind   string    `json:"wrap_kind"`
	IsOwner    bool      `json:"is_owner"`
	Version    int       `json:"version"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Vault is the encrypted payload of one household.
type Vault struct {
	Ciphertext []byte    `json:"ciphertext"`
	Nonce      []byte    `json:"nonce"`
	Version    int       `json:"version"`
	UpdatedAt  time.Time `json:"updated_at"`
}

// Wrap kinds. See the column comment in 006_households.sql for why the
// distinction has to be recorded rather than inferred.
const (
	// Sealed under the member's own MEK — how a creator holds their own copy.
	WrapSelf = "self"
	// Signcrypted by another member to this member's public key.
	WrapGranted = "granted"
)

// CreateRequest is sent by POST /households.
//
// Everything in it was produced on the client: the key was generated there, the
// name and the payload were encrypted there, and the wrapped key was sealed
// there under a key the server will never hold. The server's whole part is to
// write four opaque strings down and remember who they belong to.
type CreateRequest struct {
	EncryptedName string `json:"encrypted_name"`
	WrappedKey    string `json:"wrapped_key"`
	Ciphertext    string `json:"ciphertext"`
	Nonce         string `json:"nonce"`
	Version       int    `json:"version"`
}

// CreateResponse hands back what the client needs to address the new household.
type CreateResponse struct {
	ID        int       `json:"id"`
	UpdatedAt time.Time `json:"updated_at"`
}

// VaultPayload is the body of PUT /households/{id}/vault.
type VaultPayload struct {
	Ciphertext string `json:"ciphertext"`
	Nonce      string `json:"nonce"`
	Version    int    `json:"version"`
	// The updated_at the client last saw. When set, the write is refused with
	// 409 if the stored vault has moved on — which is how one member's stale tab
	// is stopped from overwriting what the other just wrote.
	//
	// It matters more here than on a personal vault. There, a conflict needs two
	// tabs belonging to the same person; here it needs only two people, which is
	// the ordinary case rather than the unlucky one.
	ExpectedUpdatedAt *time.Time `json:"expected_updated_at,omitempty"`
}

// PutResponse hands back the new updated_at, which becomes the client's
// precondition for its next write.
type PutResponse struct {
	Status    string    `json:"status"`
	UpdatedAt time.Time `json:"updated_at"`
}

// RenameRequest is sent by PUT /households/{id}/name.
//
// A rename is its own endpoint rather than part of a vault write, because the
// name is its own ciphertext under the same key: bundling them would mean
// rewriting the whole payload to change three words.
type RenameRequest struct {
	EncryptedName string `json:"encrypted_name"`
}

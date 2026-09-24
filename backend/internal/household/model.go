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
	WrappedKey string `json:"wrapped_key"`
	WrapKind   string `json:"wrap_kind"`
	Role       string `json:"role"`
	Version    int    `json:"version"`
	// Which generation of the key `wrapped_key` is. A client refuses anything
	// below the highest it has already accepted.
	KeyEpoch  int       `json:"key_epoch"`
	UpdatedAt time.Time `json:"updated_at"`
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

// --- membership, and asking somebody to join ---

// Member is one person in a household, as the others see them.
//
// Carries their public halves so a member can wrap the household key for them
// without a general public-key directory existing: keys are served only inside
// a household somebody already belongs to, or an invitation they created.
type Member struct {
	UserID       int       `json:"user_id"`
	Email        string    `json:"email"`
	Role         string    `json:"role"`
	WrapKind     string    `json:"wrap_kind"`
	PublicKey    string    `json:"public_key"`
	VerifyingKey string    `json:"verifying_key"`
	JoinedAt     time.Time `json:"joined_at"`
}

// Invite is a pending invitation, as its household sees it.
type Invite struct {
	ID           int    `json:"id"`
	InvitedEmail string `json:"invited_email"`
	// The invite secret, sealed under the household key. Opaque to the server.
	SecretSealed string `json:"secret_sealed"`
	// What the invitee becomes on confirmation. Never owner: there is exactly
	// one, and handing it over is its own act rather than a side effect.
	Role       string     `json:"role"`
	ExpiresAt  time.Time  `json:"expires_at"`
	CreatedAt  time.Time  `json:"created_at"`
	AcceptedAt *time.Time `json:"accepted_at,omitempty"`

	// Present once accepted: who accepted, the MAC they posted over their own
	// public key, and the keys themselves. The inviter checks the MAC against
	// the secret before wrapping anything for them.
	AcceptedUserID *int   `json:"accepted_user_id,omitempty"`
	PublicKeyMAC   string `json:"public_key_mac,omitempty"`
	PublicKey      string `json:"public_key,omitempty"`
	VerifyingKey   string `json:"verifying_key,omitempty"`
}

// CreateInviteRequest is sent by POST /households/{id}/invites.
//
// The token is hashed on the client and the secret is sealed there, so neither
// reaches the server in a usable form. The server's part is to remember that
// somebody was asked, and to recognise them when they turn up.
type CreateInviteRequest struct {
	TokenHash    string `json:"token_hash"`
	InvitedEmail string `json:"invited_email"`
	SecretSealed string `json:"secret_sealed"`
	// Decided when the invitation is sent rather than after somebody is already
	// in, so nobody is briefly able to do more than was meant.
	Role string `json:"role"`
}

// AcceptInviteRequest is sent by POST /households/invites/accept.
//
// The raw token comes from the link; the server hashes it to find the row. The
// MAC proves the account posting it is the one that received the link, which is
// what the inviter checks before wrapping a key for them.
type AcceptInviteRequest struct {
	Token        string `json:"token"`
	PublicKeyMAC string `json:"public_key_mac"`
}

// AcceptInviteResponse tells the invitee which household they have joined the
// queue for, so the app can say so while they wait to be confirmed.
type AcceptInviteResponse struct {
	HouseholdID int `json:"household_id"`
}

// ConfirmInviteRequest is sent by POST /households/{id}/members.
//
// The wrapped key was signcrypted on a member's client to the invitee's public
// key. The server writes it down without being able to read or verify it — the
// verification that matters happened before this call, against a MAC the server
// never had the secret for.
type ConfirmInviteRequest struct {
	InviteID   int    `json:"invite_id"`
	WrappedKey string `json:"wrapped_key"`
}

// RekeyRequest is sent by PUT /households/{id}/rekey, after a member leaves.
//
// Removing somebody revokes the server's willingness to serve them new
// ciphertext; it does not take back the key they already hold. So the remaining
// members generate a new one, re-encrypt everything under it, and hand the
// server all of it at once — which has to be atomic, because a half-applied
// rekey is a household whose members hold keys to different versions of it.
type RekeyRequest struct {
	EncryptedName string `json:"encrypted_name"`
	Ciphertext    string `json:"ciphertext"`
	Nonce         string `json:"nonce"`
	Version       int    `json:"version"`
	// Every remaining member, with their copy of the new key. Anybody missing
	// from this list is removed by the same statement.
	Members []RekeyMember `json:"members"`
}

type RekeyMember struct {
	UserID     int    `json:"user_id"`
	WrappedKey string `json:"wrapped_key"`
	WrapKind   string `json:"wrap_kind"`
}

// ChangeRoleRequest is sent by PUT /households/{id}/members/{userId}/role.
//
// Owner is not among the values it accepts. Passing ownership is a different
// act with a different consequence — the person doing it stops being the owner
// — and folding it into "change somebody's role" would let it happen by the
// same gesture as a demotion.
type ChangeRoleRequest struct {
	Role string `json:"role"`
}

// The roles a household knows.
const (
	RoleOwner  = "owner"
	RoleWriter = "writer"
	RoleReader = "reader"
)

// validGrantableRole reports whether a role may be handed out.
//
// Owner is excluded deliberately; see ChangeRoleRequest.
func validGrantableRole(role string) bool {
	return role == RoleWriter || role == RoleReader
}

// mayWrite reports whether a role may change what a household holds.
func mayWrite(role string) bool {
	return role == RoleOwner || role == RoleWriter
}

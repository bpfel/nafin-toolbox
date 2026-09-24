package household

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
	"github.com/bpfel/nafin-toolbox/internal/auth"
)

// Same ceiling as a personal vault: a household holds the same kind of thing.
const maxVaultSize = 5 * 1024 * 1024

// Storer is the storage this package's handlers need.
//
// Every method takes the user id, because membership is checked in the query
// rather than in the handler. Authorisation a handler performs is authorisation
// a later handler can forget to perform.
type Storer interface {
	Create(ctx context.Context, userID int, req CreateRequest, ciphertext, nonce []byte) (int, time.Time, error)
	ListForUser(ctx context.Context, userID int) ([]Household, error)
	GetVault(ctx context.Context, vaultID, userID int) (*Vault, error)
	PutVault(ctx context.Context, vaultID, userID int, ciphertext, nonce []byte, version int, expectedUpdatedAt *time.Time) (time.Time, error)
	Rename(ctx context.Context, vaultID, userID int, encryptedName string) error
	Delete(ctx context.Context, vaultID, userID int) error
}

func Routes(db *sql.DB) func(r chi.Router) {
	store := NewStore(db)
	return RoutesWith(store)
}

// validWrapKind guards what a client may claim about a key it is handing over.
func validWrapKind(kind string) bool {
	return kind == WrapSelf || kind == WrapGranted
}

// RoutesWith is Routes against any Storer, so the handlers can be tested
// without a database.
func RoutesWith(store InviteStorer) func(r chi.Router) {
	return func(r chi.Router) {
		r.Get("/", handleList(store))
		r.Post("/", handleCreate(store))

		// Before "/{id}/...", because chi would otherwise read "invites" as an
		// id and answer 400 to every acceptance.
		r.Post("/invites/accept", handleAcceptInvite(store))

		r.Get("/{id}/vault", handleGetVault(store))
		r.Put("/{id}/vault", handlePutVault(store))
		r.Put("/{id}/name", handleRename(store))
		r.Delete("/{id}", handleDelete(store))

		r.Get("/{id}/invites", handleListInvites(store))
		r.Post("/{id}/invites", handleCreateInvite(store))
		r.Delete("/{id}/invites/{inviteId}", handleDeleteInvite(store))

		r.Get("/{id}/members", handleListMembers(store))
		r.Post("/{id}/members", handleConfirmInvite(store))
		r.Delete("/{id}/members/{userId}", handleRemoveMember(store))
		r.Put("/{id}/members/{userId}/role", handleChangeRole(store))

		r.Put("/{id}/rekey", handleRekey(store))
	}
}

// requester returns the signed-in user and the household id in the path.
//
// Both failures write their own response, so a handler that gets `false` is
// done. Bundling them keeps the six handlers below from opening with the same
// twelve lines.
func requester(w http.ResponseWriter, r *http.Request) (userID, vaultID int, ok bool) {
	user := auth.UserFromContext(r.Context())
	if user == nil {
		apierror.Write(w, apierror.Vault, http.StatusUnauthorized, "unauthorized")
		return 0, 0, false
	}

	raw := chi.URLParam(r, "id")
	if raw == "" {
		return user.ID, 0, true
	}

	id, err := strconv.Atoi(raw)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid household id"})
		return 0, 0, false
	}
	return user.ID, id, true
}

// writeAccessError answers a storage error that is about who is asking.
//
// ErrNotMember covers both "no such household" and "not yours", and both answer
// 404. Telling them apart would let anyone with an account discover which
// household ids exist by watching 403 and 404 diverge.
func writeAccessError(w http.ResponseWriter, err error) bool {
	if errors.Is(err, ErrNotMember) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such household"})
		return true
	}
	return false
}

func handleList(store Storer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, ok := requester(w, r)
		if !ok {
			return
		}

		households, err := store.ListForUser(r.Context(), userID)
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to list households")
			return
		}
		writeJSON(w, http.StatusOK, households)
	}
}

func handleCreate(store Storer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _, ok := requester(w, r)
		if !ok {
			return
		}

		var req CreateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		// A household with no name could not be told apart from another in the
		// switch, and one with no wrapped key could never be opened by the
		// person who just made it.
		if req.EncryptedName == "" || req.WrappedKey == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "encrypted_name and wrapped_key are required"})
			return
		}

		ciphertext, nonce, bad := decodePayload(w, req.Ciphertext, req.Nonce)
		if bad {
			return
		}

		id, updatedAt, err := store.Create(r.Context(), userID, req, ciphertext, nonce)
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to create household")
			return
		}
		writeJSON(w, http.StatusCreated, CreateResponse{ID: id, UpdatedAt: updatedAt})
	}
}

func handleGetVault(store Storer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		v, err := store.GetVault(r.Context(), vaultID, userID)
		if writeAccessError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to read household")
			return
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"ciphertext": base64.StdEncoding.EncodeToString(v.Ciphertext),
			"nonce":      base64.StdEncoding.EncodeToString(v.Nonce),
			"version":    v.Version,
			"updated_at": v.UpdatedAt,
		})
	}
}

func handlePutVault(store Storer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		var payload VaultPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		ciphertext, nonce, bad := decodePayload(w, payload.Ciphertext, payload.Nonce)
		if bad {
			return
		}

		updatedAt, err := store.PutVault(r.Context(), vaultID, userID, ciphertext, nonce, payload.Version, payload.ExpectedUpdatedAt)
		if errors.Is(err, ErrConflict) {
			// Another member wrote while this client was editing. Refusing is
			// the only safe answer — the payload is one opaque blob, so the
			// server cannot merge, and overwriting would discard their work.
			writeJSON(w, http.StatusConflict, map[string]string{
				"error": "household was changed by another member — reload before saving again",
			})
			return
		}
		if writeAccessError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to save household")
			return
		}

		writeJSON(w, http.StatusOK, PutResponse{Status: "ok", UpdatedAt: updatedAt})
	}
}

func handleRename(store Storer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		var req RenameRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.EncryptedName == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "encrypted_name is required"})
			return
		}

		err := store.Rename(r.Context(), vaultID, userID, req.EncryptedName)
		if writeAccessError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to rename household")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func handleDelete(store Storer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		err := store.Delete(r.Context(), vaultID, userID)
		if writeAccessError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to delete household")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// decodePayload turns the two base64 fields into bytes, answering the request
// itself if either is malformed or the result is too large.
func decodePayload(w http.ResponseWriter, ciphertextB64, nonceB64 string) (ciphertext, nonce []byte, bad bool) {
	ciphertext, err := base64.StdEncoding.DecodeString(ciphertextB64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid ciphertext encoding"})
		return nil, nil, true
	}
	nonce, err = base64.StdEncoding.DecodeString(nonceB64)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid nonce encoding"})
		return nil, nil, true
	}
	if len(ciphertext) > maxVaultSize {
		writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "household vault too large"})
		return nil, nil, true
	}
	return ciphertext, nonce, false
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// --- membership, and asking somebody to join ---

/*
An invitation is two steps because nobody can do both halves.

At invite time the inviter knows an e-mail address, which is not a public key,
and the person may not have an account at all. At confirm time only an existing
member holds the plaintext household key, so only they can wrap it for somebody
new — the server structurally cannot. The gap between the two is where the check
goes.
*/

// How long a link is good for.
//
// Bitwarden allows five days. That is too long for something handed over in
// person or scanned off a screen, and the shorter it is the smaller the window
// in which a leaked link is worth anything.
const inviteLifetime = 24 * time.Hour

// InviteStorer is the storage the membership handlers need.
type InviteStorer interface {
	Storer
	CreateInvite(ctx context.Context, vaultID, userID int, req CreateInviteRequest, expiresAt time.Time) (int, error)
	ListInvites(ctx context.Context, vaultID, userID int) ([]Invite, error)
	DeleteInvite(ctx context.Context, vaultID, userID, inviteID int) error
	AcceptInvite(ctx context.Context, tokenHash string, userID int, email, mac string) (int, error)
	ConfirmInvite(ctx context.Context, vaultID, userID, inviteID int, wrappedKey string) error
	ListMembers(ctx context.Context, vaultID, userID int) ([]Member, error)
	RemoveMember(ctx context.Context, vaultID, userID, targetID int) error
	ChangeRole(ctx context.Context, vaultID, userID, targetID int, role string) error
	Rekey(ctx context.Context, vaultID, userID int, req RekeyRequest, ciphertext, nonce []byte) (time.Time, error)
}

// hashToken is how a link's token becomes the thing the database holds.
//
// SHA-256 rather than bcrypt, and deliberately: the token is 32 random bytes
// from a CSPRNG, not a password, so there is nothing to slow an attacker down
// *for* — no dictionary, no reuse, no human-chosen pattern. What matters is
// that the stored form is useless, which a hash gives either way.
func hashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

func writeMembershipError(w http.ResponseWriter, err error) bool {
	switch {
	case errors.Is(err, ErrNotMember):
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such household"})
	case errors.Is(err, ErrNotOwner):
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only the owner may do this"})
	case errors.Is(err, ErrReadOnly):
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "this household is read-only for you"})
	case errors.Is(err, ErrInvalidRole):
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "that is not a role somebody can be given"})
	case errors.Is(err, ErrInviteInvalid):
		// Missing, expired, used, or addressed to somebody else — all one
		// answer, so a leaked link cannot be used to work out which.
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invitation is not valid"})
	default:
		return false
	}
	return true
}

func handleCreateInvite(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		var req CreateInviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.TokenHash == "" || req.InvitedEmail == "" || req.SecretSealed == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token_hash, invited_email and secret_sealed are required"})
			return
		}
		// An invitation cannot make another owner, and an unstated role is the
		// ordinary one rather than the most powerful one.
		if req.Role == "" {
			req.Role = RoleWriter
		}
		if !validGrantableRole(req.Role) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "that is not a role somebody can be given"})
			return
		}

		id, err := store.CreateInvite(r.Context(), vaultID, userID, req, time.Now().Add(inviteLifetime))
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to create invitation")
			return
		}
		writeJSON(w, http.StatusCreated, map[string]int{"id": id})
	}
}

func handleListInvites(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		invites, err := store.ListInvites(r.Context(), vaultID, userID)
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to list invitations")
			return
		}
		writeJSON(w, http.StatusOK, invites)
	}
}

func handleDeleteInvite(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}
		inviteID, err := strconv.Atoi(chi.URLParam(r, "inviteId"))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid invitation id"})
			return
		}

		err = store.DeleteInvite(r.Context(), vaultID, userID, inviteID)
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to withdraw invitation")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// handleAcceptInvite binds an account to an invitation. Grants nothing.
//
// The invitee still holds no key and can read nothing afterwards. All that has
// happened is that "somebody at this address" became "this account, with this
// public key, vouched for by a MAC only whoever held the link could compute".
func handleAcceptInvite(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			apierror.Write(w, apierror.Vault, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req AcceptInviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.Token == "" || req.PublicKeyMAC == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token and public_key_mac are required"})
			return
		}

		vaultID, err := store.AcceptInvite(r.Context(), hashToken(req.Token), user.ID, user.Email, req.PublicKeyMAC)
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to accept invitation")
			return
		}
		writeJSON(w, http.StatusOK, AcceptInviteResponse{HouseholdID: vaultID})
	}
}

// handleConfirmInvite writes the membership, with the key a member wrapped.
//
// The server stores that key without being able to read or check it. The
// verification that matters already happened on the inviter's client, against a
// MAC the server never held the secret for.
func handleConfirmInvite(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		var req ConfirmInviteRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.WrappedKey == "" || req.InviteID == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invite_id and wrapped_key are required"})
			return
		}

		err := store.ConfirmInvite(r.Context(), vaultID, userID, req.InviteID, req.WrappedKey)
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to confirm invitation")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func handleListMembers(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		members, err := store.ListMembers(r.Context(), vaultID, userID)
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to list members")
			return
		}
		writeJSON(w, http.StatusOK, members)
	}
}

func handleRemoveMember(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}
		targetID, err := strconv.Atoi(chi.URLParam(r, "userId"))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid user id"})
			return
		}

		err = store.RemoveMember(r.Context(), vaultID, userID, targetID)
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to remove member")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

// handleRekey replaces the key, the payload and every member's copy at once.
//
// Removing somebody stops the server serving them new ciphertext; it does not
// take back the key they already hold. This is what does — for everything
// written afterwards. It cannot un-leak what they already synced, and nothing
// can.
func handleRekey(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}

		var req RekeyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}
		if req.EncryptedName == "" || len(req.Members) == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "encrypted_name and at least one member are required"})
			return
		}
		for _, m := range req.Members {
			if m.WrappedKey == "" || !validWrapKind(m.WrapKind) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "every member needs a wrapped_key and a valid wrap_kind"})
				return
			}
		}

		ciphertext, nonce, bad := decodePayload(w, req.Ciphertext, req.Nonce)
		if bad {
			return
		}

		updatedAt, err := store.Rekey(r.Context(), vaultID, userID, req, ciphertext, nonce)
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to rekey household")
			return
		}
		writeJSON(w, http.StatusOK, PutResponse{Status: "ok", UpdatedAt: updatedAt})
	}
}

func handleChangeRole(store InviteStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, vaultID, ok := requester(w, r)
		if !ok {
			return
		}
		targetID, err := strconv.Atoi(chi.URLParam(r, "userId"))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid user id"})
			return
		}

		var req ChangeRoleRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		err = store.ChangeRole(r.Context(), vaultID, userID, targetID, req.Role)
		if writeMembershipError(w, err) {
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Vault, http.StatusInternalServerError, "failed to change role")
			return
		}
		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

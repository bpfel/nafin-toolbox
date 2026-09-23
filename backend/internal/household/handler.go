package household

import (
	"context"
	"database/sql"
	"encoding/base64"
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

// RoutesWith is Routes against any Storer, so the handlers can be tested
// without a database.
func RoutesWith(store Storer) func(r chi.Router) {
	return func(r chi.Router) {
		r.Get("/", handleList(store))
		r.Post("/", handleCreate(store))
		r.Get("/{id}/vault", handleGetVault(store))
		r.Put("/{id}/vault", handlePutVault(store))
		r.Put("/{id}/name", handleRename(store))
		r.Delete("/{id}", handleDelete(store))
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

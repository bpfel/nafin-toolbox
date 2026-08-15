package vault

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/auth"
	"github.com/go-chi/chi/v5"
	"golang.org/x/crypto/bcrypt"
)

const maxVaultSize = 512 * 1024 // 512KB

// VaultStorer defines the storage operations needed by vault handlers.
type VaultStorer interface {
	GetVault(ctx context.Context, userID int) (*Vault, error)
	PutVault(ctx context.Context, userID int, ciphertext, nonce []byte, version int, expectedUpdatedAt *time.Time) (time.Time, error)
	GetEncryptedMEK(ctx context.Context, userID int) (string, int, error)
	SetEncryptedMEK(ctx context.Context, userID int, encryptedMEK, recoveryKeyHash, encryptedMEKRecovery string) error
	UpdateEncryptedMEK(ctx context.Context, userID int, encryptedMEK string) error
	GetRecoveryData(ctx context.Context, userID int) (string, string, error)
}

func Routes(db *sql.DB) func(r chi.Router) {
	store := NewStore(db)
	return func(r chi.Router) {
		r.Get("/", handleGetVault(store))
		r.Put("/", handlePutVault(store))
		r.Get("/keys", handleGetKeys(store))
		r.Post("/keys", handleSetupKeys(store))
		r.Put("/keys", handleUpdateKeys(store))
		r.Post("/recovery", handleRecovery(store))
	}
}

func handleGetVault(store VaultStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		v, err := store.GetVault(r.Context(), user.ID)
		if err != nil {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no vault found"})
			return
		}

		writeJSON(w, http.StatusOK, VaultPayload{
			Ciphertext: base64.StdEncoding.EncodeToString(v.Ciphertext),
			Nonce:      base64.StdEncoding.EncodeToString(v.Nonce),
			Version:    v.Version,
		})
	}
}

func handlePutVault(store VaultStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var payload VaultPayload
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		ciphertext, err := base64.StdEncoding.DecodeString(payload.Ciphertext)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid ciphertext encoding"})
			return
		}
		nonce, err := base64.StdEncoding.DecodeString(payload.Nonce)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid nonce encoding"})
			return
		}

		if len(ciphertext) > maxVaultSize {
			writeJSON(w, http.StatusRequestEntityTooLarge, map[string]string{"error": "vault too large"})
			return
		}

		updatedAt, err := store.PutVault(r.Context(), user.ID, ciphertext, nonce, payload.Version, payload.ExpectedUpdatedAt)
		if errors.Is(err, ErrVaultConflict) {
			// The client is working from a vault that has since been replaced.
			// Refusing is the only safe answer: the vault is one opaque blob, so
			// the server cannot merge, and overwriting would discard the newer copy.
			writeJSON(w, http.StatusConflict, map[string]string{
				"error": "vault was modified elsewhere — reload before saving again",
			})
			return
		}
		if err != nil {
			http.Error(w, `{"error":"failed to save vault"}`, http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, PutVaultResponse{Status: "ok", UpdatedAt: updatedAt})
	}
}

func handleGetKeys(store VaultStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		encMEK, iterations, err := store.GetEncryptedMEK(r.Context(), user.ID)
		if err != nil || encMEK == "" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no keys found"})
			return
		}

		writeJSON(w, http.StatusOK, KeysResponse{
			EncryptedMEK: encMEK,
			Iterations:   iterations,
		})
	}
}

func handleSetupKeys(store VaultStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		// Check if keys already exist
		existingMEK, _, err := store.GetEncryptedMEK(r.Context(), user.ID)
		if err == nil && existingMEK != "" {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "keys already set up"})
			return
		}

		var req KeySetupRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		if req.EncryptedMEK == "" || req.RecoveryKeyHash == "" || req.EncryptedMEKRecovery == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "encrypted_mek, recovery_key_hash, and encrypted_mek_recovery are required"})
			return
		}

		// The client sends the raw recovery key; we bcrypt-hash it for storage
		hashedRecoveryKey, err := bcrypt.GenerateFromPassword([]byte(req.RecoveryKeyHash), bcrypt.DefaultCost)
		if err != nil {
			http.Error(w, `{"error":"failed to hash recovery key"}`, http.StatusInternalServerError)
			return
		}

		if err := store.SetEncryptedMEK(r.Context(), user.ID, req.EncryptedMEK, string(hashedRecoveryKey), req.EncryptedMEKRecovery); err != nil {
			http.Error(w, `{"error":"failed to save keys"}`, http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusCreated, map[string]string{"status": "ok"})
	}
}

func handleUpdateKeys(store VaultStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var req KeyUpdateRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		if req.EncryptedMEK == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "encrypted_mek is required"})
			return
		}

		if err := store.UpdateEncryptedMEK(r.Context(), user.ID, req.EncryptedMEK); err != nil {
			http.Error(w, `{"error":"failed to update keys"}`, http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func handleRecovery(store VaultStorer) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := auth.UserFromContext(r.Context())
		if user == nil {
			http.Error(w, `{"error":"unauthorized"}`, http.StatusUnauthorized)
			return
		}

		var req RecoveryRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid JSON"})
			return
		}

		if req.RecoveryKey == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "recovery_key is required"})
			return
		}

		hash, encMEKRecovery, err := store.GetRecoveryData(r.Context(), user.ID)
		if err != nil || hash == "" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "no recovery key configured"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.RecoveryKey)); err != nil {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid recovery key"})
			return
		}

		writeJSON(w, http.StatusOK, RecoveryResponse{
			EncryptedMEKRecovery: encMEKRecovery,
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

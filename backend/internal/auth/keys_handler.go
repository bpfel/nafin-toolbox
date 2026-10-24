package auth

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
)

// DefaultKDFIterations are the PBKDF2 rounds of a new account (the column's
// default), and what prelogin answers for an address with no account.
const DefaultKDFIterations = 600000

// HandlePrelogin tells the browser how to derive an account's keys before it
// signs in: which version the account is, and the KDF's parameters. See
// kdf.go and plans/key-separation-plan.md.
//
// An address with no account gets the defaults, and so reads like a version 2
// account with the default rounds — which every new account is. What it does
// tell is which accounts have not migrated yet; that lasts only until they
// next sign in.
func HandlePrelogin(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !deps.PreloginLimiter.Allow(r) {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many attempts")
			return
		}

		var req PreloginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Email == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "email required")
			return
		}

		user, err := deps.Store.GetUserByEmail(r.Context(), req.Email)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		resp := PreloginResponse{AuthVersion: AuthVersionKey, KDF: "pbkdf2-sha256", Iterations: DefaultKDFIterations}
		if user != nil {
			resp.AuthVersion = user.AuthVersion
			resp.Iterations = user.KDFIterations
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}

// HandleUpgrade moves the signed-in account to version 2: the auth key in
// place of the password, the vault key rewrapped under the new vault KEK, and
// a new recovery key — whichever of those the account still lacks, all in one
// statement (Store.Upgrade).
//
// The browser calls it right after signing in or unlocking with the password,
// the one moment it holds it. It asks for the password again here, as proof:
// a session alone, which a stolen cookie is, must not be enough to replace an
// account's credentials with ones somebody else chose.
//
// The new recovery key is shown and typed back before this is called, so an
// account never ends up with a recovery key nobody wrote down.
func HandleUpgrade(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		if user == nil {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "unauthorized")
			return
		}

		var req UpgradeRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		state, err := deps.Store.GetCredentialState(r.Context(), user.ID)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if !state.NeedsAuth() && !state.NeedsRecovery() {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "nothing to upgrade")
			return
		}

		if req.Secret.Empty() {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "password required")
			return
		}
		if !confirmPassword(w, deps, user, req.Secret, "incorrect password") {
			return
		}

		var authHash, encryptedMEK, recoveryHash, encryptedMEKRecovery string
		if state.NeedsAuth() {
			if !ValidAuthKey(req.NewAuthKey) {
				apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid auth key")
				return
			}
			// A vault key left wrapped under the password-derived KEK would
			// open with what the server used to receive; it has to move with
			// the password.
			if state.HasVault && req.EncryptedMEK == "" {
				apierror.Write(w, apierror.Auth, http.StatusBadRequest, "rewrapped vault key required")
				return
			}
			if authHash, err = HashPassword(req.NewAuthKey); err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}
			if state.HasVault {
				encryptedMEK = req.EncryptedMEK
			}
		} else if req.NewAuthKey != "" || req.EncryptedMEK != "" {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "nothing to upgrade")
			return
		}

		if state.NeedsRecovery() {
			if !ValidAuthKey(req.RecoveryAuth) || req.EncryptedMEKRecovery == "" {
				apierror.Write(w, apierror.Auth, http.StatusBadRequest, "new recovery key required")
				return
			}
			if recoveryHash, err = HashPassword(req.RecoveryAuth); err != nil {
				apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
				return
			}
			encryptedMEKRecovery = req.EncryptedMEKRecovery
		}

		err = deps.Store.Upgrade(r.Context(), user.ID, state.AuthVersion, authHash, encryptedMEK, recoveryHash, encryptedMEKRecovery)
		if errors.Is(err, ErrUpgradeRaced) {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "account was upgraded meanwhile")
			return
		}
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditCredentialsUpgraded, r, map[string]any{
			"auth":     state.NeedsAuth(),
			"recovery": state.NeedsRecovery(),
		})

		updated, err := deps.Store.GetUserByID(r.Context(), user.ID)
		if err != nil || updated == nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(updated)
	}
}

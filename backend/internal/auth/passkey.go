package auth

import (
	"context"
	"crypto/sha256"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
	"github.com/go-chi/chi/v5"
	"github.com/go-webauthn/webauthn/protocol"
	"github.com/go-webauthn/webauthn/webauthn"
)

// Passkeys: signing in with a fingerprint, face or device PIN, and — where the
// passkey supports the PRF extension — opening the vault in the same prompt.
//
// Opt-in twice. An administrator turns them on for the instance with
// allow_passkeys; until then every endpoint here answers 404 and the app shows
// nothing of them. Then each person adds their own in Profile. A passkey is
// always in addition to the password, never instead of it.
//
// The server never sees a PRF secret. The browser derives a key from it, wraps
// the vault key with that, and stores only the wrap here, beside the password
// wrap and the recovery wrap. See plans/fingerprint-login-plan.md.

const (
	settingAllowPasskeys = "allow_passkeys"
	maxPasskeysPerUser   = 10
	maxPasskeyNameLength = 60
)

// passkeyPRFSalt is the PRF input for every passkey on every instance.
//
// One salt, not one per passkey: the secret still differs per passkey, because
// each authenticator mixes in a key of its own. What a single salt buys is a
// sign-in where nobody is known yet — the browser has to be told what to
// evaluate before it says which passkey it used, and a per-passkey salt would
// need a second prompt to fetch.
var passkeyPRFSalt = func() []byte {
	h := sha256.Sum256([]byte("nafin-toolbox: open the vault"))
	return h[:]
}()

// NewWebAuthn configures passkeys for the address the app is served at.
//
// A passkey is bound to a domain (the "relying party ID"), so this is the one
// place the app's address becomes something a person's device remembers. An
// address that is an IP rather than a name cannot carry passkeys at all; nil
// then, and the admin switch says why.
func NewWebAuthn(appURL string) (*webauthn.WebAuthn, error) {
	u, err := url.Parse(appURL)
	if err != nil {
		return nil, err
	}
	return webauthn.New(&webauthn.Config{
		RPID:          u.Hostname(),
		RPDisplayName: "nafin",
		RPOrigins:     []string{u.Scheme + "://" + u.Host},
		AuthenticatorSelection: protocol.AuthenticatorSelection{
			ResidentKey:      protocol.ResidentKeyRequirementRequired,
			UserVerification: protocol.VerificationRequired,
		},
	})
}

// passkeysOn reports whether passkeys can be used right now.
func passkeysOn(ctx context.Context, deps *HandlerDeps) bool {
	if deps.WebAuthn == nil {
		return false
	}
	v, err := deps.Store.GetSetting(ctx, settingAllowPasskeys)
	return err == nil && v == "true"
}

// RequirePasskeys answers 404 for every passkey endpoint while they are off,
// so an instance that has not chosen them shows no trace of them.
func RequirePasskeys(deps *HandlerDeps) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !passkeysOn(r.Context(), deps) {
				apierror.Write(w, apierror.Auth, http.StatusNotFound, "passkeys are not enabled")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// meResponse is the signed-in user as /auth/me and a passkey sign-in report it.
type meResponse struct {
	*User
	// The session was started with a passkey. That is two factors already —
	// the device and the fingerprint or PIN — so an instance that requires 2FA
	// does not ask this session to set up an authenticator app.
	PasskeySession bool `json:"passkey_session"`
}

type passkeyCeremony struct {
	Token   string `json:"token"`
	Options any    `json:"options"`
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(v)
}

// ---- Adding a passkey ----

type passkeyRegisterBeginRequest struct {
	Password string `json:"password"`
}

// HandlePasskeyRegisterBegin starts adding a passkey to the signed-in account.
// It asks for the password, as turning off 2FA does: a session left open on a
// shared computer must not be enough to plant a passkey that outlives it.
func HandlePasskeyRegisterBegin(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())

		var req passkeyRegisterBeginRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Password == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "password required")
			return
		}
		if !CheckPassword(user.PasswordHash, req.Password) {
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "incorrect password")
			return
		}

		pu, err := deps.Store.passkeyUser(r.Context(), user)
		if err != nil {
			log.Printf("passkey register: %v", err)
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if len(pu.passkeys) >= maxPasskeysPerUser {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "too many passkeys")
			return
		}

		creation, session, err := deps.WebAuthn.BeginRegistration(pu,
			webauthn.WithExclusions(webauthn.Credentials(pu.WebAuthnCredentials()).CredentialDescriptors()),
			webauthn.WithExtensions(
				webauthn.WithExtensionCredProps(),
				webauthn.WithExtensionPRF(protocol.PRFValues{First: passkeyPRFSalt}),
			),
		)
		if err != nil {
			log.Printf("passkey register: %v", err)
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		token, err := deps.Store.CreatePasskeyChallenge(r.Context(), &user.ID, "register", session)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, passkeyCeremony{Token: token, Options: creation})
	}
}

type passkeyFinishRequest struct {
	Token      string          `json:"token"`
	Name       string          `json:"name"`
	Credential json.RawMessage `json:"credential"`
}

// HandlePasskeyRegisterFinish verifies the new passkey and keeps it.
//
// It does not yet open the vault: whether this passkey can is only known once
// the browser has a PRF secret from it, which it may get at creation or only
// at the first use. The browser sends the wrap separately, to
// HandlePasskeyVaultKey, when it has one.
func HandlePasskeyRegisterFinish(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())

		var req passkeyFinishRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" || len(req.Credential) == 0 {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		session, err := deps.Store.TakePasskeyChallenge(r.Context(), req.Token, &user.ID, "register")
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if session == nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid or expired passkey challenge")
			return
		}

		parsed, err := protocol.ParseCredentialCreationResponseBytes(req.Credential)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "passkey not recognised")
			return
		}
		pu, err := deps.Store.passkeyUser(r.Context(), user)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		cred, err := deps.WebAuthn.CreateCredential(pu, *session, parsed)
		if err != nil {
			log.Printf("passkey register finish: %v", describe(err))
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "passkey not recognised")
			return
		}

		passkey, err := deps.Store.AddPasskey(r.Context(), user.ID, passkeyName(req.Name), cred)
		if err != nil {
			log.Printf("passkey register finish: %v", err)
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditPasskeyAdded, r, map[string]any{"passkey_id": passkey.ID})
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, passkey)
	}
}

// passkeyName tidies a name the person typed. Blank becomes "Passkey"; the
// browser suggests the device's name, so a blank one is rare.
func passkeyName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		return "Passkey"
	}
	if utf8.RuneCountInString(name) > maxPasskeyNameLength {
		name = string([]rune(name)[:maxPasskeyNameLength])
	}
	return name
}

// describe unwraps a go-webauthn error into its details, for the server log.
// The person only ever sees "passkey not recognised": the details say which
// check failed, which helps whoever runs the server and nobody trying to get in.
func describe(err error) string {
	var perr *protocol.Error
	if errors.As(err, &perr) {
		return perr.Type + ": " + perr.Details + " " + perr.DevInfo
	}
	return err.Error()
}

// ---- Signing in ----

// HandlePasskeyLoginBegin starts a sign-in where nobody is known yet: the
// passkey says whose account it is. No email to type.
func HandlePasskeyLoginBegin(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		client := deps.LoginLimiter.ClientIP(r)
		if !deps.LoginLimiter.CheckKey(client) {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many login attempts")
			return
		}

		assertion, session, err := deps.WebAuthn.BeginDiscoverableLogin(
			webauthn.WithUserVerification(protocol.VerificationRequired),
			webauthn.WithAssertionExtensions(webauthn.WithExtensionPRF(protocol.PRFValues{First: passkeyPRFSalt})),
		)
		if err != nil {
			log.Printf("passkey login: %v", err)
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		token, err := deps.Store.CreatePasskeyChallenge(r.Context(), nil, "login", session)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, passkeyCeremony{Token: token, Options: assertion})
	}
}

type passkeyLoginResponse struct {
	User meResponse `json:"user"`
	// The vault key wrapped under this passkey's PRF secret, if it has one.
	// The browser holds the secret from the same prompt and opens the vault
	// with it; the server cannot.
	EncryptedMEKPRF *string `json:"encrypted_mek_prf"`
}

// HandlePasskeyLoginFinish verifies the passkey and signs its owner in.
//
// No TOTP step follows: with user verification required, a passkey is already
// two factors. The session records the passkey, so removing it signs out
// wherever it was used.
func HandlePasskeyLoginFinish(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		client := deps.LoginLimiter.ClientIP(r)
		if !deps.LoginLimiter.CheckKey(client) {
			w.Header().Set("Retry-After", "900")
			apierror.Write(w, apierror.Auth, http.StatusTooManyRequests, "too many login attempts")
			return
		}

		var req passkeyFinishRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" || len(req.Credential) == 0 {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}

		session, err := deps.Store.TakePasskeyChallenge(r.Context(), req.Token, nil, "login")
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if session == nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid or expired passkey challenge")
			return
		}

		fail := func(uid *int, why string) {
			deps.LoginLimiter.RecordFailureKey(client)
			log.Printf("passkey login finish: %s", why)
			deps.Store.LogAudit(r.Context(), uid, AuditLoginFailed, r, map[string]any{"method": "passkey"})
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "passkey not recognised")
		}

		parsed, err := protocol.ParseCredentialRequestResponseBytes(req.Credential)
		if err != nil {
			fail(nil, describe(err))
			return
		}

		var owner *passkeyUser
		lookup := func(rawID, userHandle []byte) (webauthn.User, error) {
			id, err := deps.Store.UserIDByWebAuthnHandle(r.Context(), userHandle)
			if err != nil {
				return nil, err
			}
			if id == 0 {
				return nil, errors.New("no account for this passkey")
			}
			user, err := deps.Store.GetUserByID(r.Context(), id)
			if err != nil || user == nil {
				return nil, errors.New("no account for this passkey")
			}
			owner, err = deps.Store.passkeyUser(r.Context(), user)
			if err != nil {
				return nil, err
			}
			return owner, nil
		}

		_, cred, err := deps.WebAuthn.ValidatePasskeyLogin(lookup, *session, parsed)
		if err != nil {
			var uid *int
			if owner != nil {
				uid = &owner.user.ID
			}
			fail(uid, describe(err))
			return
		}
		// A counter that went backwards means two copies of one hardware key.
		// Synced passkeys report no counter at all, so this only ever speaks
		// for a hardware key, and there it is worth refusing.
		if cred.Authenticator.CloneWarning {
			fail(&owner.user.ID, "sign counter went backwards")
			return
		}
		passkey := owner.passkeyFor(cred.ID)
		if passkey == nil {
			fail(&owner.user.ID, "credential vanished during sign-in")
			return
		}

		user := owner.user
		if !user.EmailVerified {
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "email not verified")
			return
		}

		if err := deps.Store.PasskeyUsed(r.Context(), passkey.ID, cred); err != nil {
			log.Printf("passkey login finish: %v", err)
		}
		sess, err := startSession(r.Context(), deps, user, &passkey.ID)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}

		deps.Store.LogAudit(r.Context(), &user.ID, AuditLoginSuccess, r, map[string]any{"method": "passkey", "passkey_id": passkey.ID})
		http.SetCookie(w, sessionCookie(sess.Token, sess.ExpiresAt))
		writeJSON(w, passkeyLoginResponse{
			User:            meResponse{User: user, PasskeySession: true},
			EncryptedMEKPRF: passkey.EncryptedMEKPRF,
		})
	}
}

// ---- Opening the vault with a passkey ----

type passkeyUnlockBeginRequest struct {
	// Ask this one passkey only. Used right after adding one whose PRF secret
	// did not come back at creation; otherwise every passkey that can open
	// the vault is offered.
	PasskeyID int `json:"passkey_id,omitempty"`
}

// HandlePasskeyUnlockBegin starts a fingerprint prompt for someone already
// signed in: to open a locked vault after a reload, or to fetch the PRF secret
// of a passkey just added.
func HandlePasskeyUnlockBegin(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())

		var req passkeyUnlockBeginRequest
		if r.ContentLength != 0 {
			if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
				apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
				return
			}
		}

		pu, err := deps.Store.passkeyUser(r.Context(), user)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		var allowed []protocol.CredentialDescriptor
		for _, p := range pu.passkeys {
			if (req.PasskeyID != 0 && p.ID == req.PasskeyID) || (req.PasskeyID == 0 && p.Unlocks) {
				allowed = append(allowed, p.Credential.Descriptor())
			}
		}
		if len(allowed) == 0 {
			apierror.Write(w, apierror.Auth, http.StatusNotFound, "passkey not found")
			return
		}

		assertion, session, err := deps.WebAuthn.BeginLogin(pu,
			webauthn.WithAllowedCredentials(allowed),
			webauthn.WithUserVerification(protocol.VerificationRequired),
			webauthn.WithAssertionExtensions(webauthn.WithExtensionPRF(protocol.PRFValues{First: passkeyPRFSalt})),
		)
		if err != nil {
			log.Printf("passkey unlock: %v", err)
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		token, err := deps.Store.CreatePasskeyChallenge(r.Context(), &user.ID, "unlock", session)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		writeJSON(w, passkeyCeremony{Token: token, Options: assertion})
	}
}

type passkeyUnlockResponse struct {
	PasskeyID       int     `json:"passkey_id"`
	EncryptedMEKPRF *string `json:"encrypted_mek_prf"`
}

// HandlePasskeyUnlockFinish verifies the prompt and hands back that passkey's
// wrap of the vault key, if it has one. The wrap is only released after the
// passkey has answered, though only the browser holding its PRF secret could
// open it anyway.
func HandlePasskeyUnlockFinish(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())

		var req passkeyFinishRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Token == "" || len(req.Credential) == 0 {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}
		session, err := deps.Store.TakePasskeyChallenge(r.Context(), req.Token, &user.ID, "unlock")
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if session == nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid or expired passkey challenge")
			return
		}

		parsed, err := protocol.ParseCredentialRequestResponseBytes(req.Credential)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "passkey not recognised")
			return
		}
		pu, err := deps.Store.passkeyUser(r.Context(), user)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		cred, err := deps.WebAuthn.ValidateLogin(pu, *session, parsed)
		if err != nil || cred.Authenticator.CloneWarning {
			if err != nil {
				log.Printf("passkey unlock finish: %v", describe(err))
			}
			apierror.Write(w, apierror.Auth, http.StatusUnauthorized, "passkey not recognised")
			return
		}
		passkey := pu.passkeyFor(cred.ID)
		if passkey == nil {
			apierror.Write(w, apierror.Auth, http.StatusNotFound, "passkey not found")
			return
		}
		if err := deps.Store.PasskeyUsed(r.Context(), passkey.ID, cred); err != nil {
			log.Printf("passkey unlock finish: %v", err)
		}
		writeJSON(w, passkeyUnlockResponse{PasskeyID: passkey.ID, EncryptedMEKPRF: passkey.EncryptedMEKPRF})
	}
}

type passkeyVaultKeyRequest struct {
	EncryptedMEKPRF string `json:"encrypted_mek_prf"`
}

// HandlePasskeyVaultKey stores the vault key wrapped under one of the
// account's passkeys. The browser sends it once it has had a PRF secret from
// that passkey; from then on the passkey opens the vault.
func HandlePasskeyVaultKey(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		id, err := strconv.Atoi(chi.URLParam(r, "id"))
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusNotFound, "passkey not found")
			return
		}
		var req passkeyVaultKeyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.EncryptedMEKPRF == "" {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "vault key required")
			return
		}
		ok, err := deps.Store.SetPasskeyVaultKey(r.Context(), user.ID, id, req.EncryptedMEKPRF)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if !ok {
			apierror.Write(w, apierror.Auth, http.StatusNotFound, "passkey not found")
			return
		}
		writeJSON(w, map[string]string{"status": "ok"})
	}
}

// ---- Listing and removing ----

// HandleListPasskeys lists the signed-in account's passkeys.
func HandleListPasskeys(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		passkeys, err := deps.Store.ListPasskeys(r.Context(), user.ID)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if passkeys == nil {
			passkeys = []Passkey{}
		}
		writeJSON(w, passkeys)
	}
}

// HandleDeletePasskey removes one of the signed-in account's passkeys. The
// sessions it started end with it, this one included if it was one of them.
//
// Not behind RequirePasskeys: someone whose administrator has turned passkeys
// off must still be able to remove theirs.
func HandleDeletePasskey(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		user := UserFromContext(r.Context())
		id, err := strconv.Atoi(chi.URLParam(r, "id"))
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusNotFound, "passkey not found")
			return
		}
		ok, err := deps.Store.DeletePasskey(r.Context(), user.ID, id)
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		if !ok {
			apierror.Write(w, apierror.Auth, http.StatusNotFound, "passkey not found")
			return
		}
		deps.Store.LogAudit(r.Context(), &user.ID, AuditPasskeyRemoved, r, map[string]any{"passkey_id": id})
		writeJSON(w, map[string]string{"status": "ok"})
	}
}

// ---- The instance switch ----

type allowPasskeysRequest struct {
	Allow bool `json:"allow"`
}

// HandleAdminAllowPasskeys turns passkeys on or off for the instance.
//
// Off keeps every passkey people added, and stops them signing in or opening
// the vault; on again brings them back. Nobody is locked out either way: the
// password opens everything it always did.
func HandleAdminAllowPasskeys(deps *HandlerDeps) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := UserFromContext(r.Context())
		if !caller.IsAdmin() {
			apierror.Write(w, apierror.Auth, http.StatusForbidden, "admin access required")
			return
		}
		var req allowPasskeysRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Auth, http.StatusBadRequest, "invalid request body")
			return
		}
		if req.Allow && deps.WebAuthn == nil {
			apierror.Write(w, apierror.Auth, http.StatusConflict, "passkeys are not enabled")
			return
		}

		var err error
		if req.Allow {
			err = deps.Store.SetSetting(r.Context(), settingAllowPasskeys, "true")
		} else {
			err = deps.Store.DeleteSetting(r.Context(), settingAllowPasskeys)
		}
		if err != nil {
			apierror.Write(w, apierror.Auth, http.StatusInternalServerError, "internal error")
			return
		}
		deps.Store.LogAudit(r.Context(), &caller.ID, AuditSettingChanged, r, map[string]any{
			"setting": settingAllowPasskeys, "value": req.Allow,
		})
		writeJSON(w, map[string]any{"allow_passkeys": req.Allow})
	}
}

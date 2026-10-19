//go:build integration

package auth

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/fxamacker/cbor/v2"
	"github.com/go-chi/chi/v5"

	"github.com/bpfel/nafin-toolbox/internal/email"
)

// softKey is a passkey held in memory: enough of an authenticator to make and
// use one, so the ceremonies can be tested end to end without a browser.
type softKey struct {
	t      *testing.T
	priv   *ecdsa.PrivateKey
	id     []byte
	handle []byte // the user handle the passkey was made for
	rpID   string
	origin string
	count  uint32
}

var b64 = base64.RawURLEncoding

func newSoftKey(t *testing.T) *softKey {
	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	id := make([]byte, 16)
	rand.Read(id)
	return &softKey{t: t, priv: priv, id: id, rpID: "localhost", origin: "http://localhost:3000"}
}

// authData builds authenticator data: user present, user verified, and the
// new credential when creating one.
func (k *softKey) authData(create bool) []byte {
	rp := sha256.Sum256([]byte(k.rpID))
	flags := byte(0x01 | 0x04)
	if create {
		flags |= 0x40
	}
	var buf bytes.Buffer
	buf.Write(rp[:])
	buf.WriteByte(flags)
	binary.Write(&buf, binary.BigEndian, k.count)
	if create {
		buf.Write(make([]byte, 16)) // AAGUID
		binary.Write(&buf, binary.BigEndian, uint16(len(k.id)))
		buf.Write(k.id)
		pub, err := cbor.Marshal(map[int]any{
			1: 2, 3: -7, -1: 1,
			-2: k.priv.PublicKey.X.FillBytes(make([]byte, 32)),
			-3: k.priv.PublicKey.Y.FillBytes(make([]byte, 32)),
		})
		if err != nil {
			k.t.Fatal(err)
		}
		buf.Write(pub)
	}
	return buf.Bytes()
}

func (k *softKey) clientData(kind, challenge string) []byte {
	b, _ := json.Marshal(map[string]any{"type": kind, "challenge": challenge, "origin": k.origin})
	return b
}

// options pulls the challenge and user handle out of a ceremony's options.
func options(t *testing.T, body []byte) (token, challenge string, userHandle []byte) {
	t.Helper()
	var c struct {
		Token   string `json:"token"`
		Options struct {
			PublicKey struct {
				Challenge string `json:"challenge"`
				User      struct {
					ID string `json:"id"`
				} `json:"user"`
			} `json:"publicKey"`
		} `json:"options"`
	}
	if err := json.Unmarshal(body, &c); err != nil {
		t.Fatalf("ceremony options: %v (%s)", err, body)
	}
	if c.Options.PublicKey.User.ID != "" {
		userHandle, _ = b64.DecodeString(c.Options.PublicKey.User.ID)
	}
	return c.Token, c.Options.PublicKey.Challenge, userHandle
}

// create answers a registration ceremony.
func (k *softKey) create(challenge string, handle []byte) json.RawMessage {
	k.handle = handle
	att, err := cbor.Marshal(map[string]any{"fmt": "none", "attStmt": map[string]any{}, "authData": k.authData(true)})
	if err != nil {
		k.t.Fatal(err)
	}
	b, _ := json.Marshal(map[string]any{
		"id": b64.EncodeToString(k.id), "rawId": b64.EncodeToString(k.id), "type": "public-key",
		"response": map[string]any{
			"clientDataJSON":    b64.EncodeToString(k.clientData("webauthn.create", challenge)),
			"attestationObject": b64.EncodeToString(att),
			"transports":        []string{"internal"},
		},
		"clientExtensionResults": map[string]any{"prf": map[string]any{"enabled": true}},
	})
	return b
}

// get answers a sign-in or unlock ceremony. tamper spoils the signature.
func (k *softKey) get(challenge string, tamper bool) json.RawMessage {
	k.count++
	ad := k.authData(false)
	cd := k.clientData("webauthn.get", challenge)
	h := sha256.Sum256(cd)
	digest := sha256.Sum256(append(append([]byte{}, ad...), h[:]...))
	sig, err := ecdsa.SignASN1(rand.Reader, k.priv, digest[:])
	if err != nil {
		k.t.Fatal(err)
	}
	if tamper {
		sig[len(sig)-1] ^= 0xff
	}
	b, _ := json.Marshal(map[string]any{
		"id": b64.EncodeToString(k.id), "rawId": b64.EncodeToString(k.id), "type": "public-key",
		"response": map[string]any{
			"clientDataJSON":    b64.EncodeToString(cd),
			"authenticatorData": b64.EncodeToString(ad),
			"signature":         b64.EncodeToString(sig),
			"userHandle":        b64.EncodeToString(k.handle),
		},
		"clientExtensionResults": map[string]any{"prf": map[string]any{}},
	})
	return b
}

// passkeyApp is the auth routes the passkey flows touch, wired as server.go
// wires them.
type passkeyApp struct {
	t     *testing.T
	srv   *httptest.Server
	store *Store
}

func newPasskeyApp(t *testing.T) *passkeyApp {
	truncateTables(t)
	store := NewStore(testDB)
	limiter := NewLoginRateLimiter(1000, time.Minute)
	wa, err := NewWebAuthn("http://localhost:3000")
	if err != nil {
		t.Fatal(err)
	}
	deps := &HandlerDeps{
		Store: store, LoginLimiter: limiter, LoginAccountLimiter: limiter, SetupLimiter: limiter,
		VerifyEmailLimiter: limiter, Verify2FALimiter: limiter, EmailSender: &email.LogSender{},
		AppURL: "http://localhost:3000", WebAuthn: wa,
	}
	r := chi.NewRouter()
	r.Get("/auth/needs-setup", HandleNeedsSetup(deps))
	r.With(RequirePasskeys(deps)).Post("/auth/passkeys/login/begin", HandlePasskeyLoginBegin(deps))
	r.With(RequirePasskeys(deps)).Post("/auth/passkeys/login/finish", HandlePasskeyLoginFinish(deps))
	r.Group(func(r chi.Router) {
		r.Use(RequireAuth(store))
		r.Get("/auth/me", HandleMe)
		r.Post("/auth/settings/allow-passkeys", HandleAdminAllowPasskeys(deps))
		r.Delete("/auth/passkeys/{id}", HandleDeletePasskey(deps))
		r.Group(func(r chi.Router) {
			r.Use(RequirePasskeys(deps))
			r.Get("/auth/passkeys", HandleListPasskeys(deps))
			r.Post("/auth/passkeys/register/begin", HandlePasskeyRegisterBegin(deps))
			r.Post("/auth/passkeys/register/finish", HandlePasskeyRegisterFinish(deps))
			r.Post("/auth/passkeys/unlock/begin", HandlePasskeyUnlockBegin(deps))
			r.Post("/auth/passkeys/unlock/finish", HandlePasskeyUnlockFinish(deps))
			r.Put("/auth/passkeys/{id}/vault-key", HandlePasskeyVaultKey(deps))
		})
	})
	srv := httptest.NewServer(r)
	t.Cleanup(srv.Close)
	return &passkeyApp{t: t, srv: srv, store: store}
}

// signedIn makes an account and a password session for it.
func (a *passkeyApp) signedIn(email, role string) (*User, string) {
	a.t.Helper()
	ctx := context.Background()
	u, err := a.store.CreateUser(ctx, email, mustHash("password1"), role, false)
	if err != nil {
		a.t.Fatal(err)
	}
	sess, err := a.store.CreateSession(ctx, u.ID)
	if err != nil {
		a.t.Fatal(err)
	}
	return u, sess.Token
}

func (a *passkeyApp) do(method, path, cookie string, body any) (int, []byte, *http.Response) {
	a.t.Helper()
	var rd *bytes.Reader
	if body == nil {
		rd = bytes.NewReader(nil)
	} else {
		b, _ := json.Marshal(body)
		rd = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, a.srv.URL+path, rd)
	req.Header.Set("Content-Type", "application/json")
	if cookie != "" {
		req.AddCookie(&http.Cookie{Name: "session", Value: cookie})
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		a.t.Fatal(err)
	}
	defer res.Body.Close()
	var out bytes.Buffer
	out.ReadFrom(res.Body)
	return res.StatusCode, out.Bytes(), res
}

func (a *passkeyApp) want(status int, method, path, cookie string, body any) []byte {
	a.t.Helper()
	got, out, _ := a.do(method, path, cookie, body)
	if got != status {
		a.t.Fatalf("%s %s = %d, want %d: %s", method, path, got, status, out)
	}
	return out
}

// enrol adds a passkey for the session's account and returns its id.
func (a *passkeyApp) enrol(cookie string, key *softKey) int {
	a.t.Helper()
	token, challenge, handle := options(a.t, a.want(200, "POST", "/auth/passkeys/register/begin", cookie, map[string]string{"password": "password1"}))
	out := a.want(201, "POST", "/auth/passkeys/register/finish", cookie, map[string]any{
		"token": token, "name": "  Test phone  ", "credential": key.create(challenge, handle),
	})
	var p Passkey
	json.Unmarshal(out, &p)
	if p.Name != "Test phone" || p.Unlocks {
		a.t.Fatalf("new passkey = %+v, want named and not yet unlocking", p)
	}
	return p.ID
}

// signIn runs a passkey sign-in and returns the new session's cookie.
func (a *passkeyApp) signIn(key *softKey) (string, passkeyLoginResponse) {
	a.t.Helper()
	token, challenge, _ := options(a.t, a.want(200, "POST", "/auth/passkeys/login/begin", "", nil))
	_, out, res := a.do("POST", "/auth/passkeys/login/finish", "", map[string]any{"token": token, "credential": key.get(challenge, false)})
	if res.StatusCode != 200 {
		a.t.Fatalf("passkey sign-in = %d: %s", res.StatusCode, out)
	}
	var body passkeyLoginResponse
	json.Unmarshal(out, &body)
	for _, c := range res.Cookies() {
		if c.Name == "session" {
			return c.Value, body
		}
	}
	a.t.Fatal("passkey sign-in set no session cookie")
	return "", body
}

func TestPasskeysAreInvisibleUntilAllowed(t *testing.T) {
	a := newPasskeyApp(t)
	_, cookie := a.signedIn("anna@example.com", RoleUser)

	var setup map[string]bool
	json.Unmarshal(a.want(200, "GET", "/auth/needs-setup", "", nil), &setup)
	if setup["passkeys"] {
		t.Error("needs-setup offers passkeys before an admin allowed them")
	}
	a.want(404, "POST", "/auth/passkeys/login/begin", "", nil)
	a.want(404, "GET", "/auth/passkeys", cookie, nil)
	a.want(404, "POST", "/auth/passkeys/register/begin", cookie, map[string]string{"password": "password1"})
}

func TestOnlyAnAdminAllowsPasskeys(t *testing.T) {
	a := newPasskeyApp(t)
	_, user := a.signedIn("anna@example.com", RoleUser)
	a.want(403, "POST", "/auth/settings/allow-passkeys", user, map[string]bool{"allow": true})

	_, admin := a.signedIn("admin@example.com", RoleAdmin)
	a.want(200, "POST", "/auth/settings/allow-passkeys", admin, map[string]bool{"allow": true})

	var setup map[string]bool
	json.Unmarshal(a.want(200, "GET", "/auth/needs-setup", "", nil), &setup)
	if !setup["passkeys"] {
		t.Error("needs-setup does not offer passkeys once allowed")
	}
}

func TestPasskeyEnrolSignInAndUnlock(t *testing.T) {
	a := newPasskeyApp(t)
	_, admin := a.signedIn("admin@example.com", RoleAdmin)
	a.want(200, "POST", "/auth/settings/allow-passkeys", admin, map[string]bool{"allow": true})
	anna, cookie := a.signedIn("anna@example.com", RoleUser)
	key := newSoftKey(t)

	// Adding one asks for the password.
	a.want(401, "POST", "/auth/passkeys/register/begin", cookie, map[string]string{"password": "wrong-one"})
	id := a.enrol(cookie, key)

	// It signs in, and the session knows it came from a passkey.
	session, login := a.signIn(key)
	if login.User.ID != anna.ID || !login.User.PasskeySession {
		t.Fatalf("signed in as %+v, want anna by passkey", login.User)
	}
	if login.EncryptedMEKPRF != nil {
		t.Error("a passkey with no vault key handed one back")
	}
	var me meResponse
	json.Unmarshal(a.want(200, "GET", "/auth/me", session, nil), &me)
	if !me.PasskeySession {
		t.Error("/auth/me does not report the passkey session")
	}
	json.Unmarshal(a.want(200, "GET", "/auth/me", cookie, nil), &me)
	if me.PasskeySession {
		t.Error("/auth/me reports a password session as a passkey one")
	}

	// Storing the wrap makes it a passkey that opens the vault.
	a.want(400, "PUT", "/auth/passkeys/"+strconv.Itoa(id)+"/vault-key", cookie, map[string]string{})
	a.want(200, "PUT", "/auth/passkeys/"+strconv.Itoa(id)+"/vault-key", cookie, map[string]string{"encrypted_mek_prf": "wrapped"})
	var list []Passkey
	json.Unmarshal(a.want(200, "GET", "/auth/passkeys", cookie, nil), &list)
	if len(list) != 1 || !list[0].Unlocks || list[0].LastUsedAt == nil {
		t.Fatalf("passkeys = %+v, want one that unlocks and has been used", list)
	}

	_, login = a.signIn(key)
	if login.EncryptedMEKPRF == nil || *login.EncryptedMEKPRF != "wrapped" {
		t.Errorf("sign-in vault key = %v, want the stored wrap", login.EncryptedMEKPRF)
	}

	// Unlocking from a session: the wrap comes back after the passkey answers.
	token, challenge, _ := options(t, a.want(200, "POST", "/auth/passkeys/unlock/begin", cookie, nil))
	var unlocked passkeyUnlockResponse
	json.Unmarshal(a.want(200, "POST", "/auth/passkeys/unlock/finish", cookie, map[string]any{
		"token": token, "credential": key.get(challenge, false),
	}), &unlocked)
	if unlocked.PasskeyID != id || unlocked.EncryptedMEKPRF == nil {
		t.Errorf("unlock = %+v, want passkey %d with its wrap", unlocked, id)
	}
}

func TestPasskeySignInRefusesForgeryAndReplay(t *testing.T) {
	a := newPasskeyApp(t)
	_, admin := a.signedIn("admin@example.com", RoleAdmin)
	a.want(200, "POST", "/auth/settings/allow-passkeys", admin, map[string]bool{"allow": true})
	_, cookie := a.signedIn("anna@example.com", RoleUser)
	key := newSoftKey(t)
	a.enrol(cookie, key)

	token, challenge, _ := options(t, a.want(200, "POST", "/auth/passkeys/login/begin", "", nil))
	a.want(401, "POST", "/auth/passkeys/login/finish", "", map[string]any{"token": token, "credential": key.get(challenge, true)})

	// The challenge went with the failed attempt; a good answer to it is too late.
	a.want(400, "POST", "/auth/passkeys/login/finish", "", map[string]any{"token": token, "credential": key.get(challenge, false)})

	// A passkey nobody enrolled.
	stranger := newSoftKey(t)
	stranger.handle = []byte("nobody")
	token, challenge, _ = options(t, a.want(200, "POST", "/auth/passkeys/login/begin", "", nil))
	a.want(401, "POST", "/auth/passkeys/login/finish", "", map[string]any{"token": token, "credential": stranger.get(challenge, false)})

	// A registration challenge is not a sign-in challenge.
	token, challenge, _ = options(t, a.want(200, "POST", "/auth/passkeys/register/begin", cookie, map[string]string{"password": "password1"}))
	a.want(400, "POST", "/auth/passkeys/login/finish", "", map[string]any{"token": token, "credential": key.get(challenge, false)})
}

func TestRemovingAPasskeyEndsItsSessions(t *testing.T) {
	a := newPasskeyApp(t)
	_, admin := a.signedIn("admin@example.com", RoleAdmin)
	a.want(200, "POST", "/auth/settings/allow-passkeys", admin, map[string]bool{"allow": true})
	_, cookie := a.signedIn("anna@example.com", RoleUser)
	key := newSoftKey(t)
	id := a.enrol(cookie, key)
	session, _ := a.signIn(key)

	// Somebody else cannot remove it, nor give it a vault key.
	_, ben := a.signedIn("ben@example.com", RoleUser)
	a.want(404, "DELETE", "/auth/passkeys/"+strconv.Itoa(id), ben, nil)
	a.want(404, "PUT", "/auth/passkeys/"+strconv.Itoa(id)+"/vault-key", ben, map[string]string{"encrypted_mek_prf": "x"})

	a.want(200, "DELETE", "/auth/passkeys/"+strconv.Itoa(id), cookie, nil)
	a.want(401, "GET", "/auth/me", session, nil)
	a.want(200, "GET", "/auth/me", cookie, nil)
}

func TestTurningPasskeysOffKeepsThem(t *testing.T) {
	a := newPasskeyApp(t)
	_, admin := a.signedIn("admin@example.com", RoleAdmin)
	a.want(200, "POST", "/auth/settings/allow-passkeys", admin, map[string]bool{"allow": true})
	_, cookie := a.signedIn("anna@example.com", RoleUser)
	key := newSoftKey(t)
	id := a.enrol(cookie, key)

	a.want(200, "POST", "/auth/settings/allow-passkeys", admin, map[string]bool{"allow": false})
	a.want(404, "POST", "/auth/passkeys/login/begin", "", nil)

	a.want(200, "POST", "/auth/settings/allow-passkeys", admin, map[string]bool{"allow": true})
	a.signIn(key)

	// Off again: removing one still works, so nobody is stuck with it.
	a.want(200, "POST", "/auth/settings/allow-passkeys", admin, map[string]bool{"allow": false})
	a.want(200, "DELETE", "/auth/passkeys/"+strconv.Itoa(id), cookie, nil)
}

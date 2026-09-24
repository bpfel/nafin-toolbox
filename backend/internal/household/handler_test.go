package household

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/bpfel/nafin-toolbox/internal/auth"
)

// These cover what the handlers decide: who is allowed to ask, what a malformed
// request earns, and how a storage error becomes a status code. What the store
// itself enforces — membership, in SQL — is in store_test.go against a real
// database, because a mock can only confirm a method was called.

type mockStore struct {
	households []Household
	vault      *Vault
	updatedAt  time.Time
	createdID  int

	createErr error
	listErr   error
	getErr    error
	putErr    error
	renameErr error
	deleteErr error

	invites         []Invite
	members         []Member
	createdInviteID int
	acceptedVaultID int

	createInviteErr error
	listInvitesErr  error
	deleteInviteErr error
	acceptErr       error
	confirmErr      error
	listMembersErr  error
	removeMemberErr error
	changeRoleErr   error
	rekeyErr        error

	// Captured so tests can assert what reached the store.
	lastInvite     CreateInviteRequest
	lastInviteID   int
	lastTargetID   int
	lastTokenHash  string
	lastEmail      string
	lastMAC        string
	lastWrappedKey string
	lastRole       string
	lastRekey      RekeyRequest
	lastExpiresAt  time.Time
	lastUserID     int
	lastVaultID    int
	lastCreate     CreateRequest
	lastCiphertext []byte
	lastExpected   *time.Time
	lastName       string
}

func (m *mockStore) Create(ctx context.Context, userID int, req CreateRequest, ciphertext, nonce []byte) (int, time.Time, error) {
	m.lastUserID, m.lastCreate, m.lastCiphertext = userID, req, ciphertext
	return m.createdID, m.updatedAt, m.createErr
}

func (m *mockStore) ListForUser(ctx context.Context, userID int) ([]Household, error) {
	m.lastUserID = userID
	return m.households, m.listErr
}

func (m *mockStore) GetVault(ctx context.Context, vaultID, userID int) (*Vault, error) {
	m.lastUserID, m.lastVaultID = userID, vaultID
	return m.vault, m.getErr
}

func (m *mockStore) PutVault(ctx context.Context, vaultID, userID int, ciphertext, nonce []byte, version int, expectedUpdatedAt *time.Time) (time.Time, error) {
	m.lastUserID, m.lastVaultID = userID, vaultID
	m.lastCiphertext, m.lastExpected = ciphertext, expectedUpdatedAt
	return m.updatedAt, m.putErr
}

func (m *mockStore) Rename(ctx context.Context, vaultID, userID int, encryptedName string) error {
	m.lastUserID, m.lastVaultID, m.lastName = userID, vaultID, encryptedName
	return m.renameErr
}

func (m *mockStore) Delete(ctx context.Context, vaultID, userID int) error {
	m.lastUserID, m.lastVaultID = userID, vaultID
	return m.deleteErr
}

func userCtx(userID int) context.Context {
	return auth.ContextWithUser(context.Background(), &auth.User{ID: userID, Email: "test@test.com"})
}

// serve routes the request the way the app does, so chi fills in {id}.
func serve(store InviteStorer, method, target, body string, ctx context.Context) *httptest.ResponseRecorder {
	r := chi.NewRouter()
	r.Route("/households", RoutesWith(store))

	var req *http.Request
	if body == "" {
		req = httptest.NewRequest(method, target, nil)
	} else {
		req = httptest.NewRequest(method, target, strings.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
	}
	if ctx != nil {
		req = req.WithContext(ctx)
	}

	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w
}

// Nothing here is reachable without signing in.
func TestHandlers_RequireAuth(t *testing.T) {
	cases := []struct{ method, target, body string }{
		{http.MethodGet, "/households", ""},
		{http.MethodPost, "/households", `{"encrypted_name":"n","wrapped_key":"k"}`},
		{http.MethodGet, "/households/1/vault", ""},
		{http.MethodPut, "/households/1/vault", `{"ciphertext":"","nonce":""}`},
		{http.MethodPut, "/households/1/name", `{"encrypted_name":"n"}`},
		{http.MethodDelete, "/households/1", ""},
	}

	for _, c := range cases {
		t.Run(c.method+" "+c.target, func(t *testing.T) {
			w := serve(&mockStore{}, c.method, c.target, c.body, nil)
			if w.Code != http.StatusUnauthorized {
				t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
			}
		})
	}
}

// Belonging to none is the ordinary first state, and it must marshal as [] so
// no caller has to tell an empty list from a missing one.
func TestHandleList_EmptyIsAnArray(t *testing.T) {
	w := serve(&mockStore{households: []Household{}}, http.MethodGet, "/households", "", userCtx(7))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if got := strings.TrimSpace(w.Body.String()); got != "[]" {
		t.Errorf("body = %s, want []", got)
	}
}

func TestHandleList_AsksForTheSignedInUser(t *testing.T) {
	store := &mockStore{households: []Household{{ID: 3, EncryptedName: "sealed"}}}
	w := serve(store, http.MethodGet, "/households", "", userCtx(42))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if store.lastUserID != 42 {
		t.Errorf("asked the store for user %d, want 42", store.lastUserID)
	}
}

func TestHandleCreate_Succeeds(t *testing.T) {
	store := &mockStore{createdID: 11, updatedAt: time.Now()}
	body := `{"encrypted_name":"sealed-name","wrapped_key":"sealed-key","ciphertext":"Y3Q=","nonce":"bm9uY2U=","version":9}`

	w := serve(store, http.MethodPost, "/households", body, userCtx(7))

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body %s", w.Code, http.StatusCreated, w.Body.String())
	}
	var got CreateResponse
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if got.ID != 11 {
		t.Errorf("id = %d, want 11", got.ID)
	}
	if store.lastCreate.EncryptedName != "sealed-name" || store.lastCreate.WrappedKey != "sealed-key" {
		t.Errorf("store got %+v", store.lastCreate)
	}
	if string(store.lastCiphertext) != "ct" {
		t.Errorf("ciphertext = %q, want it base64-decoded to ct", store.lastCiphertext)
	}
}

// A household with no name cannot be told from another in the switch, and one
// with no wrapped key could never be opened by the person who just made it.
func TestHandleCreate_RequiresNameAndKey(t *testing.T) {
	cases := map[string]string{
		"no name": `{"wrapped_key":"k","ciphertext":"","nonce":""}`,
		"no key":  `{"encrypted_name":"n","ciphertext":"","nonce":""}`,
		"neither": `{"ciphertext":"","nonce":""}`,
	}

	for name, body := range cases {
		t.Run(name, func(t *testing.T) {
			store := &mockStore{}
			w := serve(store, http.MethodPost, "/households", body, userCtx(7))

			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
			}
			if store.lastCreate.EncryptedName != "" || store.lastCreate.WrappedKey != "" {
				t.Error("the store was called despite an invalid request")
			}
		})
	}
}

func TestHandleCreate_RejectsBadEncoding(t *testing.T) {
	w := serve(&mockStore{}, http.MethodPost, "/households",
		`{"encrypted_name":"n","wrapped_key":"k","ciphertext":"not base64!!","nonce":""}`, userCtx(7))

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

// Not yours and not there answer alike, so the difference cannot be probed for.
func TestHandleGetVault_NotAMemberIs404(t *testing.T) {
	w := serve(&mockStore{getErr: ErrNotMember}, http.MethodGet, "/households/5/vault", "", userCtx(7))

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestHandleGetVault_ReturnsTheBlob(t *testing.T) {
	store := &mockStore{vault: &Vault{Ciphertext: []byte("ct"), Nonce: []byte("nonce"), Version: 9}}
	w := serve(store, http.MethodGet, "/households/5/vault", "", userCtx(7))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	var got map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding: %v", err)
	}
	if got["ciphertext"] != "Y3Q=" {
		t.Errorf("ciphertext = %v, want base64 of ct", got["ciphertext"])
	}
	if store.lastVaultID != 5 {
		t.Errorf("asked for household %d, want 5", store.lastVaultID)
	}
}

func TestHandleVault_RejectsANonNumericID(t *testing.T) {
	w := serve(&mockStore{}, http.MethodGet, "/households/abc/vault", "", userCtx(7))

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

// Two people editing one plan is the ordinary case, so the conflict has to
// reach the client as something it can act on.
func TestHandlePutVault_ConflictIs409(t *testing.T) {
	w := serve(&mockStore{putErr: ErrConflict}, http.MethodPut, "/households/5/vault",
		`{"ciphertext":"Y3Q=","nonce":"bm9uY2U=","version":9}`, userCtx(7))

	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusConflict)
	}
	if !strings.Contains(w.Body.String(), "another member") {
		t.Errorf("body %q does not say who changed it", w.Body.String())
	}
}

func TestHandlePutVault_NotAMemberIs404(t *testing.T) {
	w := serve(&mockStore{putErr: ErrNotMember}, http.MethodPut, "/households/5/vault",
		`{"ciphertext":"Y3Q=","nonce":"bm9uY2U=","version":9}`, userCtx(7))

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestHandlePutVault_PassesThePrecondition(t *testing.T) {
	store := &mockStore{updatedAt: time.Now()}
	when := "2026-09-24T10:00:00Z"
	w := serve(store, http.MethodPut, "/households/5/vault",
		`{"ciphertext":"Y3Q=","nonce":"bm9uY2U=","version":9,"expected_updated_at":"`+when+`"}`, userCtx(7))

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body %s", w.Code, http.StatusOK, w.Body.String())
	}
	if store.lastExpected == nil {
		t.Fatal("the precondition did not reach the store")
	}
	if got := store.lastExpected.UTC().Format(time.RFC3339); got != when {
		t.Errorf("precondition = %s, want %s", got, when)
	}
}

// Omitting it means "there is nothing to conflict with", which is the first
// save after creation — and must not become a zero time.
func TestHandlePutVault_NoPreconditionStaysNil(t *testing.T) {
	store := &mockStore{updatedAt: time.Now()}
	serve(store, http.MethodPut, "/households/5/vault",
		`{"ciphertext":"Y3Q=","nonce":"bm9uY2U=","version":9}`, userCtx(7))

	if store.lastExpected != nil {
		t.Errorf("precondition = %v, want nil", store.lastExpected)
	}
}

func TestHandleRename(t *testing.T) {
	t.Run("renames", func(t *testing.T) {
		store := &mockStore{}
		w := serve(store, http.MethodPut, "/households/5/name", `{"encrypted_name":"sealed-new"}`, userCtx(7))

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}
		if store.lastName != "sealed-new" {
			t.Errorf("name = %q, want sealed-new", store.lastName)
		}
	})

	t.Run("refuses an empty name", func(t *testing.T) {
		store := &mockStore{}
		w := serve(store, http.MethodPut, "/households/5/name", `{"encrypted_name":""}`, userCtx(7))

		if w.Code != http.StatusBadRequest {
			t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
		}
		if store.lastName != "" {
			t.Error("the store was called with an empty name")
		}
	})

	t.Run("not a member is 404", func(t *testing.T) {
		w := serve(&mockStore{renameErr: ErrNotMember}, http.MethodPut, "/households/5/name",
			`{"encrypted_name":"n"}`, userCtx(7))

		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
		}
	})
}

func TestHandleDelete(t *testing.T) {
	t.Run("deletes", func(t *testing.T) {
		store := &mockStore{}
		w := serve(store, http.MethodDelete, "/households/5", "", userCtx(7))

		if w.Code != http.StatusOK {
			t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
		}
		if store.lastVaultID != 5 || store.lastUserID != 7 {
			t.Errorf("deleted household %d for user %d, want 5 for 7", store.lastVaultID, store.lastUserID)
		}
	})

	// A member who does not own it gets the same answer as a stranger, which is
	// what the store returns for both.
	t.Run("not the owner is 404", func(t *testing.T) {
		w := serve(&mockStore{deleteErr: ErrNotMember}, http.MethodDelete, "/households/5", "", userCtx(7))

		if w.Code != http.StatusNotFound {
			t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
		}
	})
}

func TestHandlers_RejectMalformedJSON(t *testing.T) {
	cases := []struct{ method, target string }{
		{http.MethodPost, "/households"},
		{http.MethodPut, "/households/5/vault"},
		{http.MethodPut, "/households/5/name"},
	}

	for _, c := range cases {
		t.Run(c.method+" "+c.target, func(t *testing.T) {
			w := serve(&mockStore{}, c.method, c.target, `{bad json`, userCtx(7))
			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
			}
		})
	}
}

// --- the membership half of the store ---

func (m *mockStore) CreateInvite(ctx context.Context, vaultID, userID int, req CreateInviteRequest, expiresAt time.Time) (int, error) {
	m.lastUserID, m.lastVaultID, m.lastInvite, m.lastExpiresAt = userID, vaultID, req, expiresAt
	return m.createdInviteID, m.createInviteErr
}

func (m *mockStore) ListInvites(ctx context.Context, vaultID, userID int) ([]Invite, error) {
	m.lastUserID, m.lastVaultID = userID, vaultID
	return m.invites, m.listInvitesErr
}

func (m *mockStore) DeleteInvite(ctx context.Context, vaultID, userID, inviteID int) error {
	m.lastUserID, m.lastVaultID, m.lastInviteID = userID, vaultID, inviteID
	return m.deleteInviteErr
}

func (m *mockStore) AcceptInvite(ctx context.Context, tokenHash string, userID int, email, mac string) (int, error) {
	m.lastTokenHash, m.lastUserID, m.lastEmail, m.lastMAC = tokenHash, userID, email, mac
	return m.acceptedVaultID, m.acceptErr
}

func (m *mockStore) ConfirmInvite(ctx context.Context, vaultID, userID, inviteID int, wrappedKey string) error {
	m.lastUserID, m.lastVaultID, m.lastInviteID, m.lastWrappedKey = userID, vaultID, inviteID, wrappedKey
	return m.confirmErr
}

func (m *mockStore) ListMembers(ctx context.Context, vaultID, userID int) ([]Member, error) {
	m.lastUserID, m.lastVaultID = userID, vaultID
	return m.members, m.listMembersErr
}

func (m *mockStore) RemoveMember(ctx context.Context, vaultID, userID, targetID int) error {
	m.lastUserID, m.lastVaultID, m.lastTargetID = userID, vaultID, targetID
	return m.removeMemberErr
}

func (m *mockStore) Rekey(ctx context.Context, vaultID, userID int, req RekeyRequest, ciphertext, nonce []byte) (time.Time, error) {
	m.lastUserID, m.lastVaultID, m.lastRekey = userID, vaultID, req
	return m.updatedAt, m.rekeyErr
}

func (m *mockStore) ChangeRole(ctx context.Context, vaultID, userID, targetID int, role string) error {
	m.lastUserID, m.lastVaultID, m.lastTargetID, m.lastRole = userID, vaultID, targetID, role
	return m.changeRoleErr
}

package vault

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/auth"
	"golang.org/x/crypto/bcrypt"
)

// Mock store for testing
type mockStore struct {
	vault              *Vault
	encryptedMEK       string
	iterations         int
	recoveryKeyHash    string
	recoveryVersion    int
	encryptedMEKRecov  string
	getVaultErr        error
	putVaultErr        error
	getMEKErr          error
	setMEKErr          error
	updateMEKErr       error
	getRecoveryDataErr error

	identity    Identity
	getIdentErr error
	setIdentErr error

	// Captured so tests can assert the precondition reached the store.
	lastExpectedUpdatedAt *time.Time
}

func (m *mockStore) GetVault(ctx context.Context, userID int) (*Vault, error) {
	if m.getVaultErr != nil {
		return nil, m.getVaultErr
	}
	return m.vault, nil
}

func (m *mockStore) PutVault(
	ctx context.Context,
	userID int,
	ciphertext, nonce []byte,
	version int,
	expectedUpdatedAt *time.Time,
) (time.Time, error) {
	m.lastExpectedUpdatedAt = expectedUpdatedAt
	if m.putVaultErr != nil {
		return time.Time{}, m.putVaultErr
	}
	updatedAt := time.Date(2026, 8, 16, 12, 0, 0, 0, time.UTC)
	m.vault = &Vault{
		UserID:     userID,
		Ciphertext: ciphertext,
		Nonce:      nonce,
		Version:    version,
		UpdatedAt:  updatedAt,
	}
	return updatedAt, nil
}

func (m *mockStore) GetEncryptedMEK(ctx context.Context, userID int) (string, int, error) {
	if m.getMEKErr != nil {
		return "", 0, m.getMEKErr
	}
	return m.encryptedMEK, m.iterations, nil
}

func (m *mockStore) GetIdentity(ctx context.Context, userID int) (Identity, error) {
	if m.getIdentErr != nil {
		return Identity{}, m.getIdentErr
	}
	return m.identity, nil
}

func (m *mockStore) SetEncryptedMEK(ctx context.Context, userID int, encryptedMEK, recoveryKeyHash, encryptedMEKRecovery string, identity Identity) error {
	if m.setMEKErr != nil {
		return m.setMEKErr
	}
	m.encryptedMEK = encryptedMEK
	m.recoveryKeyHash = recoveryKeyHash
	m.recoveryVersion = 2
	m.encryptedMEKRecov = encryptedMEKRecovery
	m.identity = identity
	return nil
}

// Mirrors the store's rule: only an account with no identity gets one.
func (m *mockStore) SetIdentityIfAbsent(ctx context.Context, userID int, identity Identity) (bool, error) {
	if m.setIdentErr != nil {
		return false, m.setIdentErr
	}
	if m.identity.PublicKey != "" {
		return false, nil
	}
	m.identity = identity
	return true, nil
}

func (m *mockStore) UpdateEncryptedMEK(ctx context.Context, userID int, encryptedMEK string) error {
	if m.updateMEKErr != nil {
		return m.updateMEKErr
	}
	m.encryptedMEK = encryptedMEK
	return nil
}

func (m *mockStore) GetRecoveryData(ctx context.Context, userID int) (RecoveryData, error) {
	if m.getRecoveryDataErr != nil {
		return RecoveryData{}, m.getRecoveryDataErr
	}
	return RecoveryData{Hash: m.recoveryKeyHash, EncryptedMEK: m.encryptedMEKRecov, Version: m.recoveryVersion}, nil
}

func userCtx(userID int) context.Context {
	user := &auth.User{ID: userID, Email: "test@test.com"}
	return auth.ContextWithUser(context.Background(), user)
}

// --- GetVault handler tests ---

func TestHandleGetVault_RequiresAuth(t *testing.T) {
	store := &mockStore{}
	handler := handleGetVault(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if !strings.Contains(w.Body.String(), "unauthorized") {
		t.Errorf("body %q does not contain 'unauthorized'", w.Body.String())
	}
}

func TestHandleGetVault_NoVaultFound(t *testing.T) {
	store := &mockStore{
		getVaultErr: context.DeadlineExceeded, // Simulate "not found" error
	}
	handler := handleGetVault(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
	if !strings.Contains(w.Body.String(), "no vault found") {
		t.Errorf("body %q does not contain 'no vault found'", w.Body.String())
	}
}

func TestHandleGetVault_Success(t *testing.T) {
	updatedAt := time.Date(2026, 10, 16, 17, 31, 13, 123456000, time.UTC)
	ciphertext := []byte("encrypted-data")
	nonce := []byte("nonce12345")
	store := &mockStore{
		vault: &Vault{
			UserID:     1,
			Ciphertext: ciphertext,
			Nonce:      nonce,
			Version:    1,
			UpdatedAt:  updatedAt,
		},
	}
	handler := handleGetVault(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var result GetVaultResponse
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}

	expectedCiphertext := base64.StdEncoding.EncodeToString(ciphertext)
	if result.Ciphertext != expectedCiphertext {
		t.Errorf("ciphertext = %q, want %q", result.Ciphertext, expectedCiphertext)
	}

	expectedNonce := base64.StdEncoding.EncodeToString(nonce)
	if result.Nonce != expectedNonce {
		t.Errorf("nonce = %q, want %q", result.Nonce, expectedNonce)
	}

	if result.Version != 1 {
		t.Errorf("version = %d, want 1", result.Version)
	}

	// The client sends this back as expected_updated_at on its first save.
	// Missing, that save went unconditionally and overwrote another device's.
	if !result.UpdatedAt.Equal(updatedAt) {
		t.Errorf("updated_at = %v, want %v", result.UpdatedAt, updatedAt)
	}
}

func TestHandleGetVault_EmptyVaultData(t *testing.T) {
	// Test with empty byte slices (edge case)
	store := &mockStore{
		vault: &Vault{
			UserID:     1,
			Ciphertext: []byte{},
			Nonce:      []byte{},
			Version:    0,
		},
	}
	handler := handleGetVault(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}
}

// --- PutVault handler tests ---

func TestHandlePutVault_RequiresAuth(t *testing.T) {
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"dGVzdA==","nonce":"bm9uY2U=","version":1}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandlePutVault_InvalidJSON(t *testing.T) {
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault", strings.NewReader(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "invalid JSON") {
		t.Errorf("body %q does not contain 'invalid JSON'", w.Body.String())
	}
}

func TestHandlePutVault_InvalidBase64Ciphertext(t *testing.T) {
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"not-valid-base64!!!","nonce":"bm9uY2U=","version":1}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "invalid ciphertext encoding") {
		t.Errorf("body %q does not contain 'invalid ciphertext encoding'", w.Body.String())
	}
}

func TestHandlePutVault_InvalidBase64Nonce(t *testing.T) {
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"dGVzdA==","nonce":"not-valid-base64!!!","version":1}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "invalid nonce encoding") {
		t.Errorf("body %q does not contain 'invalid nonce encoding'", w.Body.String())
	}
}

func TestHandlePutVault_VaultTooLarge(t *testing.T) {
	store := &mockStore{}
	handler := handlePutVault(store)

	// Create a payload that exceeds 512KB when decoded
	largeData := make([]byte, maxVaultSize+1)
	for i := range largeData {
		largeData[i] = 'A'
	}
	largeCiphertext := base64.StdEncoding.EncodeToString(largeData)

	payload := map[string]interface{}{
		"ciphertext": largeCiphertext,
		"nonce":      "bm9uY2U=",
		"version":    1,
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPut, "/api/vault", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("status = %d, want %d", w.Code, http.StatusRequestEntityTooLarge)
	}
	if !strings.Contains(w.Body.String(), "vault too large") {
		t.Errorf("body %q does not contain 'vault too large'", w.Body.String())
	}
}

func TestHandlePutVault_ExactlySizeLimit(t *testing.T) {
	// Test boundary: exactly at maxVaultSize should succeed
	store := &mockStore{}
	handler := handlePutVault(store)

	exactData := make([]byte, maxVaultSize)
	exactCiphertext := base64.StdEncoding.EncodeToString(exactData)

	payload := map[string]interface{}{
		"ciphertext": exactCiphertext,
		"nonce":      "bm9uY2U=",
		"version":    1,
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPut, "/api/vault", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (should accept vault at exact size limit)", w.Code, http.StatusOK)
	}
}

func TestHandlePutVault_Success(t *testing.T) {
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"dGVzdGRhdGE=","nonce":"bm9uY2UxMjM=","version":2}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	// Verify store was called with correct data
	if store.vault == nil {
		t.Fatal("vault was not saved to store")
	}
	if string(store.vault.Ciphertext) != "testdata" {
		t.Errorf("ciphertext = %q, want 'testdata'", string(store.vault.Ciphertext))
	}
	if string(store.vault.Nonce) != "nonce123" {
		t.Errorf("nonce = %q, want 'nonce123'", string(store.vault.Nonce))
	}
	if store.vault.Version != 2 {
		t.Errorf("version = %d, want 2", store.vault.Version)
	}
}

func TestHandlePutVault_EmptyPayload(t *testing.T) {
	// Test with empty strings (edge case)
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"","nonce":"","version":0}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (empty payload should be allowed)", w.Code, http.StatusOK)
	}
}

// --- GetKeys handler tests ---

func TestHandleGetKeys_RequiresAuth(t *testing.T) {
	store := &mockStore{}
	handler := handleGetKeys(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/keys", nil)
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleGetKeys_NoKeysFound(t *testing.T) {
	store := &mockStore{
		encryptedMEK: "",
		getMEKErr:    context.DeadlineExceeded,
	}
	handler := handleGetKeys(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/keys", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
	if !strings.Contains(w.Body.String(), "no keys found") {
		t.Errorf("body %q does not contain 'no keys found'", w.Body.String())
	}
}

func TestHandleGetKeys_EmptyMEK(t *testing.T) {
	// Test when MEK exists but is empty string
	store := &mockStore{
		encryptedMEK: "",
		iterations:   100000,
	}
	handler := handleGetKeys(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/keys", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestHandleGetKeys_Success(t *testing.T) {
	store := &mockStore{
		encryptedMEK: "encrypted-mek-base64",
		iterations:   100000,
	}
	handler := handleGetKeys(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/keys", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var result KeysResponse
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}

	if result.EncryptedMEK != "encrypted-mek-base64" {
		t.Errorf("encrypted_mek = %q, want 'encrypted-mek-base64'", result.EncryptedMEK)
	}
	if result.Iterations != 100000 {
		t.Errorf("iterations = %d, want 100000", result.Iterations)
	}
}

func TestHandleGetKeys_ZeroIterations(t *testing.T) {
	// Test edge case with zero iterations
	store := &mockStore{
		encryptedMEK: "encrypted-mek",
		iterations:   0,
	}
	handler := handleGetKeys(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/keys", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	var result KeysResponse
	json.Unmarshal(w.Body.Bytes(), &result)
	if result.Iterations != 0 {
		t.Errorf("iterations = %d, want 0", result.Iterations)
	}
}

// --- SetupKeys handler tests ---

func TestHandleSetupKeys_RequiresAuth(t *testing.T) {
	store := &mockStore{}
	handler := handleSetupKeys(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/keys",
		strings.NewReader(`{"encrypted_mek":"test","recovery_auth":"test","encrypted_mek_recovery":"test"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleSetupKeys_AlreadySetup(t *testing.T) {
	store := &mockStore{
		encryptedMEK: "existing-mek",
	}
	handler := handleSetupKeys(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/keys",
		strings.NewReader(`{"encrypted_mek":"new","recovery_auth":"hash","encrypted_mek_recovery":"rec"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusConflict {
		t.Errorf("status = %d, want %d", w.Code, http.StatusConflict)
	}
	if !strings.Contains(w.Body.String(), "keys already set up") {
		t.Errorf("body %q does not contain 'keys already set up'", w.Body.String())
	}
}

func TestHandleSetupKeys_InvalidJSON(t *testing.T) {
	store := &mockStore{}
	handler := handleSetupKeys(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/keys", strings.NewReader(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "invalid JSON") {
		t.Errorf("body %q does not contain 'invalid JSON'", w.Body.String())
	}
}

func TestHandleSetupKeys_MissingFields(t *testing.T) {
	store := &mockStore{}
	handler := handleSetupKeys(store)

	tests := []struct {
		name string
		body string
	}{
		{
			name: "missing encrypted_mek",
			body: `{"recovery_auth":"hash","encrypted_mek_recovery":"rec"}`,
		},
		{
			name: "missing recovery_auth",
			body: `{"encrypted_mek":"mek","encrypted_mek_recovery":"rec"}`,
		},
		{
			name: "missing encrypted_mek_recovery",
			body: `{"encrypted_mek":"mek","recovery_auth":"hash"}`,
		},
		{
			name: "empty encrypted_mek",
			body: `{"encrypted_mek":"","recovery_auth":"hash","encrypted_mek_recovery":"rec"}`,
		},
		{
			name: "empty recovery_auth",
			body: `{"encrypted_mek":"mek","recovery_auth":"","encrypted_mek_recovery":"rec"}`,
		},
		{
			name: "empty encrypted_mek_recovery",
			body: `{"encrypted_mek":"mek","recovery_auth":"hash","encrypted_mek_recovery":""}`,
		},
		{
			name: "all empty",
			body: `{"encrypted_mek":"","recovery_auth":"","encrypted_mek_recovery":""}`,
		},
		{
			name: "empty object",
			body: `{}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/vault/keys", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(userCtx(1))
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d (body: %s)", w.Code, http.StatusBadRequest, w.Body.String())
			}
			if !strings.Contains(w.Body.String(), "required") {
				t.Errorf("body %q does not contain 'required'", w.Body.String())
			}
		})
	}
}

func TestHandleSetupKeys_Success(t *testing.T) {
	store := &mockStore{}
	handler := handleSetupKeys(store)

	recoveryKey := "9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo="
	req := httptest.NewRequest(http.MethodPost, "/api/vault/keys",
		strings.NewReader(`{"encrypted_mek":"test-mek","recovery_auth":"9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo=","encrypted_mek_recovery":"rec-mek"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("status = %d, want %d (body: %s)", w.Code, http.StatusCreated, w.Body.String())
	}

	// Verify data was saved
	if store.encryptedMEK != "test-mek" {
		t.Errorf("encryptedMEK = %q, want 'test-mek'", store.encryptedMEK)
	}
	if store.encryptedMEKRecov != "rec-mek" {
		t.Errorf("encryptedMEKRecov = %q, want 'rec-mek'", store.encryptedMEKRecov)
	}

	// Verify recovery key was bcrypt hashed
	if err := bcrypt.CompareHashAndPassword([]byte(store.recoveryKeyHash), []byte(recoveryKey)); err != nil {
		t.Errorf("recovery key hash does not match: %v", err)
	}
}

func TestHandleSetupKeys_BcryptHashDifferentEachTime(t *testing.T) {
	// Verify that bcrypt hashing produces different hashes for the same input
	store1 := &mockStore{}
	store2 := &mockStore{}
	handler1 := handleSetupKeys(store1)
	handler2 := handleSetupKeys(store2)

	sameRecoveryKey := "l1vKXKm/itMumYomXdESJZ7V0wydUfu1pN0tFbVbn/k="
	body := `{"encrypted_mek":"mek","recovery_auth":"l1vKXKm/itMumYomXdESJZ7V0wydUfu1pN0tFbVbn/k=","encrypted_mek_recovery":"rec"}`

	req1 := httptest.NewRequest(http.MethodPost, "/api/vault/keys", strings.NewReader(body))
	req1.Header.Set("Content-Type", "application/json")
	req1 = req1.WithContext(userCtx(1))
	w1 := httptest.NewRecorder()
	handler1.ServeHTTP(w1, req1)

	req2 := httptest.NewRequest(http.MethodPost, "/api/vault/keys", strings.NewReader(body))
	req2.Header.Set("Content-Type", "application/json")
	req2 = req2.WithContext(userCtx(2))
	w2 := httptest.NewRecorder()
	handler2.ServeHTTP(w2, req2)

	if store1.recoveryKeyHash == store2.recoveryKeyHash {
		t.Error("bcrypt should produce different hashes for same input (salt should differ)")
	}

	// Both should still verify correctly
	if err := bcrypt.CompareHashAndPassword([]byte(store1.recoveryKeyHash), []byte(sameRecoveryKey)); err != nil {
		t.Error("first hash should verify")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(store2.recoveryKeyHash), []byte(sameRecoveryKey)); err != nil {
		t.Error("second hash should verify")
	}
}

// --- UpdateKeys handler tests ---

func TestHandleUpdateKeys_RequiresAuth(t *testing.T) {
	store := &mockStore{}
	handler := handleUpdateKeys(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault/keys",
		strings.NewReader(`{"encrypted_mek":"new-mek"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleUpdateKeys_InvalidJSON(t *testing.T) {
	store := &mockStore{}
	handler := handleUpdateKeys(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault/keys", strings.NewReader(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "invalid JSON") {
		t.Errorf("body %q does not contain 'invalid JSON'", w.Body.String())
	}
}

func TestHandleUpdateKeys_MissingEncryptedMEK(t *testing.T) {
	store := &mockStore{}
	handler := handleUpdateKeys(store)

	tests := []struct {
		name string
		body string
	}{
		{
			name: "empty object",
			body: `{}`,
		},
		{
			name: "empty string",
			body: `{"encrypted_mek":""}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPut, "/api/vault/keys", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(userCtx(1))
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
			}
			if !strings.Contains(w.Body.String(), "encrypted_mek is required") {
				t.Errorf("body %q does not contain 'encrypted_mek is required'", w.Body.String())
			}
		})
	}
}

func TestHandleUpdateKeys_Success(t *testing.T) {
	store := &mockStore{
		encryptedMEK: "old-mek",
	}
	handler := handleUpdateKeys(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault/keys",
		strings.NewReader(`{"encrypted_mek":"new-mek-after-password-change"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}

	if store.encryptedMEK != "new-mek-after-password-change" {
		t.Errorf("encryptedMEK = %q, want 'new-mek-after-password-change'", store.encryptedMEK)
	}
}

// --- Recovery handler tests ---

func TestHandleRecovery_RequiresAuth(t *testing.T) {
	store := &mockStore{}
	handler := handleRecovery(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery",
		strings.NewReader(`{"recovery_key":"test-key"}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleRecovery_InvalidJSON(t *testing.T) {
	store := &mockStore{}
	handler := handleRecovery(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery", strings.NewReader(`{bad json`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
	if !strings.Contains(w.Body.String(), "invalid JSON") {
		t.Errorf("body %q does not contain 'invalid JSON'", w.Body.String())
	}
}

func TestHandleRecovery_MissingRecoveryKey(t *testing.T) {
	store := &mockStore{}
	handler := handleRecovery(store)

	tests := []struct {
		name string
		body string
	}{
		{
			name: "empty object",
			body: `{}`,
		},
		{
			name: "empty string",
			body: `{"recovery_key":""}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery", strings.NewReader(tt.body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(userCtx(1))
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
			}
			if !strings.Contains(w.Body.String(), "recovery_key is required") {
				t.Errorf("body %q does not contain 'recovery_key is required'", w.Body.String())
			}
		})
	}
}

func TestHandleRecovery_NoRecoveryKeyConfigured(t *testing.T) {
	store := &mockStore{
		recoveryKeyHash:    "",
		getRecoveryDataErr: context.DeadlineExceeded,
	}
	handler := handleRecovery(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery",
		strings.NewReader(`{"recovery_key":"test-key"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
	if !strings.Contains(w.Body.String(), "no recovery key configured") {
		t.Errorf("body %q does not contain 'no recovery key configured'", w.Body.String())
	}
}

func TestHandleRecovery_EmptyRecoveryHash(t *testing.T) {
	// Test when query succeeds but hash is empty
	store := &mockStore{
		recoveryKeyHash:   "",
		encryptedMEKRecov: "some-data",
	}
	handler := handleRecovery(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery",
		strings.NewReader(`{"recovery_key":"test-key"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("status = %d, want %d", w.Code, http.StatusNotFound)
	}
}

func TestHandleRecovery_InvalidRecoveryKey(t *testing.T) {
	// Setup: hash of "correct-key"
	correctKey := "correct-recovery-key"
	hash, _ := bcrypt.GenerateFromPassword([]byte(correctKey), bcrypt.DefaultCost)

	store := &mockStore{
		recoveryKeyHash:   string(hash),
		encryptedMEKRecov: "encrypted-mek-recovery-data",
	}
	handler := handleRecovery(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery",
		strings.NewReader(`{"recovery_key":"wrong-key"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
	if !strings.Contains(w.Body.String(), "invalid recovery key") {
		t.Errorf("body %q does not contain 'invalid recovery key'", w.Body.String())
	}
}

func TestHandleRecovery_Success(t *testing.T) {
	correctKey := "9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo="
	hash, _ := bcrypt.GenerateFromPassword([]byte(correctKey), bcrypt.DefaultCost)

	store := &mockStore{
		recoveryKeyHash:   string(hash),
		encryptedMEKRecov: "encrypted-mek-recovery-data",
	}
	handler := handleRecovery(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery",
		strings.NewReader(`{"recovery_key":"9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo="}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (body: %s)", w.Code, http.StatusOK, w.Body.String())
	}

	var result RecoveryResponse
	if err := json.Unmarshal(w.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}

	if result.EncryptedMEKRecovery != "encrypted-mek-recovery-data" {
		t.Errorf("encrypted_mek_recovery = %q, want 'encrypted-mek-recovery-data'", result.EncryptedMEKRecovery)
	}
}

func TestHandleRecovery_CaseSensitive(t *testing.T) {
	// Recovery keys should be case-sensitive
	correctKey := "CaseSensitiveKey"
	hash, _ := bcrypt.GenerateFromPassword([]byte(correctKey), bcrypt.DefaultCost)

	store := &mockStore{
		recoveryKeyHash:   string(hash),
		encryptedMEKRecov: "data",
	}
	handler := handleRecovery(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery",
		strings.NewReader(`{"recovery_key":"casesensitivekey"}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d (recovery keys should be case-sensitive)", w.Code, http.StatusUnauthorized)
	}
}

func TestHandleRecovery_WhitespaceMatters(t *testing.T) {
	// Whitespace should matter in recovery keys
	correctKey := "key-with-spaces"
	hash, _ := bcrypt.GenerateFromPassword([]byte(correctKey), bcrypt.DefaultCost)

	store := &mockStore{
		recoveryKeyHash:   string(hash),
		encryptedMEKRecov: "data",
	}
	handler := handleRecovery(store)

	req := httptest.NewRequest(http.MethodPost, "/api/vault/recovery",
		strings.NewReader(`{"recovery_key":" key-with-spaces "}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d (extra whitespace should cause mismatch)", w.Code, http.StatusUnauthorized)
	}
}

// --- Size limit tests (boundary conditions) ---

func TestMaxVaultSize_Constant(t *testing.T) {
	// Verify the constant is set to expected value
	expected := 512 * 1024
	if maxVaultSize != expected {
		t.Errorf("maxVaultSize = %d, want %d", maxVaultSize, expected)
	}
}

func TestHandlePutVault_OneByteBelowLimit(t *testing.T) {
	store := &mockStore{}
	handler := handlePutVault(store)

	data := make([]byte, maxVaultSize-1)
	ciphertext := base64.StdEncoding.EncodeToString(data)

	payload := map[string]interface{}{
		"ciphertext": ciphertext,
		"nonce":      "bm9uY2U=",
		"version":    1,
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPut, "/api/vault", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d (one byte below limit should succeed)", w.Code, http.StatusOK)
	}
}

func TestHandlePutVault_ZeroLength(t *testing.T) {
	// Test with zero-length ciphertext
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"","nonce":"","version":1}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if len(store.vault.Ciphertext) != 0 {
		t.Errorf("ciphertext length = %d, want 0", len(store.vault.Ciphertext))
	}
}

// --- Version field tests (edge cases) ---

func TestHandlePutVault_NegativeVersion(t *testing.T) {
	// Negative versions should be allowed (no validation on version field)
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"dGVzdA==","nonce":"bm9uY2U=","version":-1}`))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if store.vault.Version != -1 {
		t.Errorf("version = %d, want -1", store.vault.Version)
	}
}

func TestHandlePutVault_LargeVersion(t *testing.T) {
	// Test with very large version number
	store := &mockStore{}
	handler := handlePutVault(store)

	largeVersion := 2147483647 // max int32

	payload := map[string]interface{}{
		"ciphertext": "dGVzdA==",
		"nonce":      "bm9uY2U=",
		"version":    largeVersion,
	}
	body, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPut, "/api/vault", strings.NewReader(string(body)))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("status = %d, want %d", w.Code, http.StatusOK)
	}

	if store.vault.Version != largeVersion {
		t.Errorf("version = %d, want %d", store.vault.Version, largeVersion)
	}
}

// --- Optimistic locking ---
//
// The vault is one opaque blob, so a stale client's write does not merge badly —
// it replaces the newer vault entirely. These cover the handler half of refusing
// that; the conditional SQL itself is exercised by the integration tests.

func TestHandlePutVault_PassesPreconditionToStore(t *testing.T) {
	store := &mockStore{}
	handler := handlePutVault(store)

	body := `{"ciphertext":"dGVzdA==","nonce":"bm9uY2U=","version":3,"expected_updated_at":"2026-08-16T10:00:00Z"}`
	req := httptest.NewRequest(http.MethodPut, "/api/vault", strings.NewReader(body)).WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if store.lastExpectedUpdatedAt == nil {
		t.Fatal("precondition was not passed to the store")
	}
	want := time.Date(2026, 8, 16, 10, 0, 0, 0, time.UTC)
	if !store.lastExpectedUpdatedAt.Equal(want) {
		t.Errorf("precondition = %v, want %v", *store.lastExpectedUpdatedAt, want)
	}
}

func TestHandlePutVault_OmittedPreconditionIsNil(t *testing.T) {
	// First save after key setup, and recovery, have nothing to conflict with.
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"dGVzdA==","nonce":"bm9uY2U=","version":3}`)).WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	if store.lastExpectedUpdatedAt != nil {
		t.Errorf("precondition = %v, want nil", *store.lastExpectedUpdatedAt)
	}
}

func TestHandlePutVault_ConflictReturns409(t *testing.T) {
	store := &mockStore{putVaultErr: ErrVaultConflict}
	handler := handlePutVault(store)

	body := `{"ciphertext":"dGVzdA==","nonce":"bm9uY2U=","version":3,"expected_updated_at":"2026-08-16T10:00:00Z"}`
	req := httptest.NewRequest(http.MethodPut, "/api/vault", strings.NewReader(body)).WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	// 409, not 500: the client can recover by reloading, and the distinction is
	// what lets the UI say something useful instead of "failed to save".
	if w.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusConflict)
	}
}

func TestHandlePutVault_ReturnsNewUpdatedAt(t *testing.T) {
	// The response carries the token for the client's next write; without it the
	// client could only save once before going stale against itself.
	store := &mockStore{}
	handler := handlePutVault(store)

	req := httptest.NewRequest(http.MethodPut, "/api/vault",
		strings.NewReader(`{"ciphertext":"dGVzdA==","nonce":"bm9uY2U=","version":3}`)).WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	var got PutVaultResponse
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if got.UpdatedAt.IsZero() {
		t.Error("response did not carry updated_at")
	}
}

// --- Identity tests ---
//
// An identity is the pair of keypairs that lets one user wrap a shared vault's
// key for another. The rule the handler enforces is that it arrives whole or
// not at all; a half-stored identity would invite other users to encrypt to a
// key this user can never unwrap, and the failure would surface much later, to
// somebody else, as a vault that will not open.

func completeIdentity() Identity {
	return Identity{
		PublicKey:           "cHVibGlj",
		EncryptedPrivateKey: "cHJpdmF0ZQ==",
		VerifyingKey:        "dmVyaWZ5",
		EncryptedSigningKey: "c2lnbg==",
	}
}

func TestHandleGetKeys_ReturnsIdentity(t *testing.T) {
	store := &mockStore{
		encryptedMEK: "bWVr",
		iterations:   600000,
		identity:     completeIdentity(),
	}
	handler := handleGetKeys(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/keys", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	var got KeysResponse
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if got.Identity != completeIdentity() {
		t.Errorf("identity = %+v, want %+v", got.Identity, completeIdentity())
	}
}

// A user who set their vault up before identities existed has none, and must
// still be handed their MEK — refusing would lock them out of a vault they can
// open perfectly well.
func TestHandleGetKeys_NoIdentityIsNotAnError(t *testing.T) {
	store := &mockStore{
		encryptedMEK: "bWVr",
		iterations:   600000,
		getIdentErr:  errors.New("no identity"),
	}
	handler := handleGetKeys(store)

	req := httptest.NewRequest(http.MethodGet, "/api/vault/keys", nil)
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
	}
	var got KeysResponse
	if err := json.Unmarshal(w.Body.Bytes(), &got); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if got.EncryptedMEK != "bWVr" {
		t.Errorf("encrypted_mek = %q, want %q", got.EncryptedMEK, "bWVr")
	}
	if !got.Identity.Empty() {
		t.Errorf("identity = %+v, want empty", got.Identity)
	}
}

func TestHandleSetupKeys_StoresIdentity(t *testing.T) {
	store := &mockStore{}
	handler := handleSetupKeys(store)

	body := `{"encrypted_mek":"bWVr","recovery_auth":"9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo=","encrypted_mek_recovery":"cmVj",
	          "public_key":"cHVibGlj","encrypted_private_key":"cHJpdmF0ZQ==",
	          "verifying_key":"dmVyaWZ5","encrypted_signing_key":"c2lnbg=="}`
	req := httptest.NewRequest(http.MethodPost, "/api/vault/keys", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body %s", w.Code, http.StatusCreated, w.Body.String())
	}
	if store.identity != completeIdentity() {
		t.Errorf("stored identity = %+v, want %+v", store.identity, completeIdentity())
	}
}

func TestHandleSetupKeys_RejectsPartialIdentity(t *testing.T) {
	// Every one of the four halves missing on its own, so no single field can
	// quietly stop being required.
	full := map[string]string{
		"public_key":            "cHVibGlj",
		"encrypted_private_key": "cHJpdmF0ZQ==",
		"verifying_key":         "dmVyaWZ5",
		"encrypted_signing_key": "c2lnbg==",
	}

	for omitted := range full {
		t.Run("without "+omitted, func(t *testing.T) {
			fields := map[string]string{
				"encrypted_mek":          "bWVr",
				"recovery_auth":          "cms=",
				"encrypted_mek_recovery": "cmVj",
			}
			for k, v := range full {
				if k != omitted {
					fields[k] = v
				}
			}
			body, err := json.Marshal(fields)
			if err != nil {
				t.Fatalf("marshalling body: %v", err)
			}

			store := &mockStore{}
			handler := handleSetupKeys(store)

			req := httptest.NewRequest(http.MethodPost, "/api/vault/keys", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			req = req.WithContext(userCtx(1))
			w := httptest.NewRecorder()

			handler.ServeHTTP(w, req)

			if w.Code != http.StatusBadRequest {
				t.Errorf("status = %d, want %d; body %s", w.Code, http.StatusBadRequest, w.Body.String())
			}
			if store.encryptedMEK != "" {
				t.Errorf("MEK was stored despite a partial identity")
			}
		})
	}
}

// A client too old to send an identity must still be able to set a vault up.
func TestHandleSetupKeys_AllowsAbsentIdentity(t *testing.T) {
	store := &mockStore{}
	handler := handleSetupKeys(store)

	body := `{"encrypted_mek":"bWVr","recovery_auth":"9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo=","encrypted_mek_recovery":"cmVj"}`
	req := httptest.NewRequest(http.MethodPost, "/api/vault/keys", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()

	handler.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("status = %d, want %d; body %s", w.Code, http.StatusCreated, w.Body.String())
	}
	if !store.identity.Empty() {
		t.Errorf("identity = %+v, want empty", store.identity)
	}
}

const fourKeys = `{"public_key":"p","encrypted_private_key":"ep","verifying_key":"v","encrypted_signing_key":"es"}`

func postIdentity(store *mockStore, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/vault/identity", strings.NewReader(body))
	req = req.WithContext(userCtx(1))
	w := httptest.NewRecorder()
	handleSetupIdentity(store).ServeHTTP(w, req)
	return w
}

// An account made before households had no way to get the keypair every newer
// one is born with, so it could neither start a household nor accept an
// invitation.
func TestHandleSetupIdentity_GivesAnOlderAccountItsKeypair(t *testing.T) {
	store := &mockStore{}

	w := postIdentity(store, fourKeys)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body %s", w.Code, http.StatusOK, w.Body.String())
	}
	if store.identity.PublicKey != "p" || store.identity.EncryptedSigningKey != "es" {
		t.Errorf("identity not stored: %+v", store.identity)
	}
}

// The security half: an identity is added, never replaced. Replacing one would
// break every pin other members hold and let a stolen session swap in its own.
func TestHandleSetupIdentity_NeverReplacesOne(t *testing.T) {
	store := &mockStore{identity: Identity{PublicKey: "original"}}

	w := postIdentity(store, fourKeys)

	if w.Code != http.StatusConflict {
		t.Errorf("status = %d, want %d", w.Code, http.StatusConflict)
	}
	if store.identity.PublicKey != "original" {
		t.Errorf("public key replaced with %q", store.identity.PublicKey)
	}
}

func TestHandleSetupIdentity_RequiresAllFourKeys(t *testing.T) {
	w := postIdentity(&mockStore{}, `{"public_key":"p","encrypted_private_key":"ep","verifying_key":"v"}`)

	if w.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want %d", w.Code, http.StatusBadRequest)
	}
}

func TestHandleSetupIdentity_RequiresAuth(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/api/vault/identity", strings.NewReader(fourKeys))
	w := httptest.NewRecorder()
	handleSetupIdentity(&mockStore{}).ServeHTTP(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Errorf("status = %d, want %d", w.Code, http.StatusUnauthorized)
	}
}

// --- Recovery keys the server never received (version 2) ---

func recoverWith(t *testing.T, store *mockStore, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/vault/recovery", strings.NewReader(body)).WithContext(userCtx(1))
	w := httptest.NewRecorder()
	handleRecovery(store).ServeHTTP(w, req)
	return w
}

func TestHandleRecovery_Version2TakesTheRecoveryAuthOnly(t *testing.T) {
	recoveryAuth := "l1vKXKm/itMumYomXdESJZ7V0wydUfu1pN0tFbVbn/k="
	hash, _ := bcrypt.GenerateFromPassword([]byte(recoveryAuth), bcrypt.MinCost)
	store := &mockStore{recoveryKeyHash: string(hash), encryptedMEKRecov: "wrapped", recoveryVersion: 2}

	if w := recoverWith(t, store, `{"recovery_auth":"`+recoveryAuth+`"}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"recovery_version":2`) {
		t.Errorf("recovery_auth = %d %s, want 200 with recovery_version 2", w.Code, w.Body.String())
	}
	// The same value under the old field must not do: a version 2 recovery
	// never takes the raw key, so a browser cannot put it back on the wire.
	if w := recoverWith(t, store, `{"recovery_key":"`+recoveryAuth+`"}`); w.Code != http.StatusUnauthorized {
		t.Errorf("raw recovery_key on version 2 = %d, want 401", w.Code)
	}
}

func TestHandleRecovery_Version1StillTakesTheRawKey(t *testing.T) {
	hash, _ := bcrypt.GenerateFromPassword([]byte("ABCD-EFGH"), bcrypt.MinCost)
	store := &mockStore{recoveryKeyHash: string(hash), encryptedMEKRecov: "wrapped", recoveryVersion: 1}

	if w := recoverWith(t, store, `{"recovery_key":"ABCD-EFGH"}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"recovery_version":1`) {
		t.Errorf("raw key on version 1 = %d %s, want 200 with recovery_version 1", w.Code, w.Body.String())
	}
}

func TestHandleSetupKeys_RefusesAMalformedRecoveryAuth(t *testing.T) {
	store := &mockStore{}
	req := httptest.NewRequest(http.MethodPost, "/vault/keys",
		strings.NewReader(`{"encrypted_mek":"m","recovery_auth":"ABCD-EFGH-the-raw-key","encrypted_mek_recovery":"r"}`)).WithContext(userCtx(1))
	w := httptest.NewRecorder()
	handleSetupKeys(store).ServeHTTP(w, req)
	if w.Code != http.StatusBadRequest {
		t.Errorf("a raw recovery key as recovery_auth = %d, want 400", w.Code)
	}
}

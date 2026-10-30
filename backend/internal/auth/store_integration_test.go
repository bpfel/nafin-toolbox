//go:build integration

package auth

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/pquerna/otp/totp"

	"github.com/bpfel/nafin-toolbox/internal/database"
	"github.com/bpfel/nafin-toolbox/internal/email"
)

var testDB *sql.DB

func TestMain(m *testing.M) {
	url := os.Getenv("DATABASE_URL")
	if url == "" {
		// Skip integration tests when no DB available
		os.Exit(0)
	}

	db, err := database.Connect(url)
	if err != nil {
		panic("connecting to test DB: " + err.Error())
	}
	testDB = db

	// Run migrations
	if err := database.Migrate(db, "../../migrations"); err != nil {
		panic("running migrations: " + err.Error())
	}

	code := m.Run()
	db.Close()
	os.Exit(code)
}

func truncateTables(t *testing.T) {
	t.Helper()
	tables := []string{
		"audit_log", "recovery_codes", "totp_secrets", "mfa_challenges",
		"verification_tokens", "app_settings", "sessions", "users",
	}
	for _, table := range tables {
		if _, err := testDB.Exec("TRUNCATE " + table + " RESTART IDENTITY CASCADE"); err != nil {
			t.Fatalf("truncating %s: %v", table, err)
		}
	}
}

// --- User CRUD ---

func TestCreateUser(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, err := store.CreateUser(ctx, "test@example.com", hash, RoleUser, false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	if user.ID == 0 {
		t.Error("expected non-zero user ID")
	}
	if user.Email != "test@example.com" {
		t.Errorf("email = %q, want test@example.com", user.Email)
	}
	if user.Role != RoleUser {
		t.Errorf("role = %q, want %q", user.Role, RoleUser)
	}
	if user.CreatedAt.IsZero() {
		t.Error("created_at is zero")
	}
	if !user.EmailVerified {
		t.Error("CreateUser should set email_verified=true by default")
	}
}

func TestCreateUser_AdminRole(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("admin123")
	user, err := store.CreateUser(ctx, "admin@example.com", hash, RoleAdmin, false)
	if err != nil {
		t.Fatalf("CreateUser: %v", err)
	}

	if user.Role != RoleAdmin {
		t.Errorf("role = %q, want %q", user.Role, RoleAdmin)
	}
}

func TestCreateUser_DuplicateEmail(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	if _, err := store.CreateUser(ctx, "dupe@test.com", hash, RoleUser, false); err != nil {
		t.Fatalf("first CreateUser: %v", err)
	}

	_, err := store.CreateUser(ctx, "dupe@test.com", hash, RoleUser, false)
	if err == nil {
		t.Fatal("expected error creating duplicate email, got nil")
	}
}

func TestCreateUserFull_Unverified(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	user, err := store.CreateUserFull(ctx, "unverified@test.com", "", RoleUser, false, false)
	if err != nil {
		t.Fatalf("CreateUserFull: %v", err)
	}

	if user.EmailVerified {
		t.Error("expected email_verified=false for unverified user")
	}
	if user.PasswordHash != "" {
		t.Error("expected empty password hash for email-invited user")
	}
}

func TestGetUserByEmail(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	created, _ := store.CreateUser(ctx, "find@test.com", hash, RoleAdmin, false)

	found, err := store.GetUserByEmail(ctx, "find@test.com")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if found == nil {
		t.Fatal("expected non-nil user")
	}
	if found.ID != created.ID {
		t.Errorf("ID = %d, want %d", found.ID, created.ID)
	}
	if found.Role != RoleAdmin {
		t.Errorf("role = %q, want %q", found.Role, RoleAdmin)
	}
}

func TestGetUserByEmail_NotFound(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	user, err := store.GetUserByEmail(ctx, "nonexistent@test.com")
	if err != nil {
		t.Fatalf("GetUserByEmail: %v", err)
	}
	if user != nil {
		t.Errorf("expected nil user, got %+v", user)
	}
}

func TestGetUserByID(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	created, _ := store.CreateUser(ctx, "byid@test.com", hash, RoleUser, false)

	found, err := store.GetUserByID(ctx, created.ID)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if found == nil {
		t.Fatal("expected non-nil user")
	}
	if found.Email != "byid@test.com" {
		t.Errorf("email = %q, want byid@test.com", found.Email)
	}
}

func TestGetUserByID_NotFound(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	user, err := store.GetUserByID(ctx, 99999)
	if err != nil {
		t.Fatalf("GetUserByID: %v", err)
	}
	if user != nil {
		t.Errorf("expected nil user, got %+v", user)
	}
}

// --- ListUsers ---

func TestListUsers(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	store.CreateUser(ctx, "a@test.com", hash, RoleAdmin, false)
	store.CreateUser(ctx, "b@test.com", hash, RoleUser, false)
	store.CreateUser(ctx, "c@test.com", hash, RoleUser, false)

	users, err := store.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 3 {
		t.Fatalf("got %d users, want 3", len(users))
	}

	if users[0].Email != "a@test.com" {
		t.Errorf("first user = %q, want a@test.com", users[0].Email)
	}
	if users[2].Email != "c@test.com" {
		t.Errorf("last user = %q, want c@test.com", users[2].Email)
	}
}

func TestListUsers_Empty(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	users, err := store.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if users != nil && len(users) != 0 {
		t.Errorf("expected empty list, got %d users", len(users))
	}
}

// --- UserCount ---

func TestUserCount(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	count, err := store.UserCount(ctx)
	if err != nil {
		t.Fatalf("UserCount: %v", err)
	}
	if count != 0 {
		t.Errorf("count = %d, want 0", count)
	}

	hash, _ := HashPassword("test1234")
	store.CreateUser(ctx, "one@test.com", hash, RoleUser, false)
	store.CreateUser(ctx, "two@test.com", hash, RoleAdmin, false)

	count, err = store.UserCount(ctx)
	if err != nil {
		t.Fatalf("UserCount: %v", err)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
}

// --- Email verification ---

func TestSetEmailVerified(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	user, _ := store.CreateUserFull(ctx, "unverified@test.com", "", RoleUser, false, false)
	if user.EmailVerified {
		t.Fatal("expected unverified user")
	}

	if err := store.SetEmailVerified(ctx, user.ID); err != nil {
		t.Fatalf("SetEmailVerified: %v", err)
	}

	updated, _ := store.GetUserByID(ctx, user.ID)
	if !updated.EmailVerified {
		t.Error("expected email_verified=true after SetEmailVerified")
	}
}

// --- TOTP enabled flag ---

func TestSetTOTPEnabled(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "totp@test.com", hash, RoleUser, false)

	// Enable
	if err := store.SetTOTPEnabled(ctx, user.ID, true); err != nil {
		t.Fatalf("SetTOTPEnabled(true): %v", err)
	}
	updated, _ := store.GetUserByID(ctx, user.ID)
	if !updated.TOTPEnabled {
		t.Error("expected totp_enabled=true")
	}

	// Disable
	if err := store.SetTOTPEnabled(ctx, user.ID, false); err != nil {
		t.Fatalf("SetTOTPEnabled(false): %v", err)
	}
	updated, _ = store.GetUserByID(ctx, user.ID)
	if updated.TOTPEnabled {
		t.Error("expected totp_enabled=false")
	}
}

// --- DeleteUser ---

func TestDeleteUser(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "delete@test.com", hash, RoleUser, false)

	if err := store.DeleteUser(ctx, user.ID); err != nil {
		t.Fatalf("DeleteUser: %v", err)
	}

	found, _ := store.GetUserByID(ctx, user.ID)
	if found != nil {
		t.Error("expected user to be deleted")
	}
}

// --- DeleteUserGuardingLastAdmin ---
//
// The state being guarded against is unrecoverable through the API: a role is
// fixed at creation, so an app with no admin cannot promote anyone back.

func TestDeleteUserGuardingLastAdmin_RefusesTheOnlyAdmin(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	admin, _ := store.CreateUser(ctx, "only-admin@test.com", hash, RoleAdmin, false)
	// A plain user alongside: it is the admin *roster* that must not empty,
	// not the users table.
	store.CreateUser(ctx, "member@test.com", hash, RoleUser, false)

	err := store.DeleteUserGuardingLastAdmin(ctx, admin.ID)
	if !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("err = %v, want ErrLastAdmin", err)
	}

	found, _ := store.GetUserByID(ctx, admin.ID)
	if found == nil {
		t.Error("the admin was deleted anyway")
	}
}

func TestDeleteUserGuardingLastAdmin_AllowsOneOfTwo(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	first, _ := store.CreateUser(ctx, "admin-a@test.com", hash, RoleAdmin, false)
	store.CreateUser(ctx, "admin-b@test.com", hash, RoleAdmin, false)

	if err := store.DeleteUserGuardingLastAdmin(ctx, first.ID); err != nil {
		t.Fatalf("DeleteUserGuardingLastAdmin: %v", err)
	}

	found, _ := store.GetUserByID(ctx, first.ID)
	if found != nil {
		t.Error("expected the admin to be deleted")
	}
}

func TestDeleteUserGuardingLastAdmin_LeavesExactlyOneAdminAfterBothAreTried(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	a, _ := store.CreateUser(ctx, "admin-a@test.com", hash, RoleAdmin, false)
	b, _ := store.CreateUser(ctx, "admin-b@test.com", hash, RoleAdmin, false)

	// Two admins deleting each other in turn. The second must be refused: this
	// is the sequence the guard exists for, and the one an advisory lock makes
	// behave the same way when the two arrive at once.
	if err := store.DeleteUserGuardingLastAdmin(ctx, a.ID); err != nil {
		t.Fatalf("deleting the first admin: %v", err)
	}
	if err := store.DeleteUserGuardingLastAdmin(ctx, b.ID); !errors.Is(err, ErrLastAdmin) {
		t.Fatalf("deleting the second admin: err = %v, want ErrLastAdmin", err)
	}

	var admins int
	testDB.QueryRow(`SELECT COUNT(*) FROM users WHERE role = $1`, RoleAdmin).Scan(&admins)
	if admins != 1 {
		t.Errorf("admins remaining = %d, want 1", admins)
	}
}

func TestDeleteUserGuardingLastAdmin_DeletesAPlainUserWhenTheyAreTheOnlyUser(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	// No admin at all. The guard is about the admin roster and must not start
	// refusing ordinary deletions in an app that has none.
	user, _ := store.CreateUser(ctx, "lonely@test.com", hash, RoleUser, false)

	if err := store.DeleteUserGuardingLastAdmin(ctx, user.ID); err != nil {
		t.Fatalf("DeleteUserGuardingLastAdmin: %v", err)
	}

	found, _ := store.GetUserByID(ctx, user.ID)
	if found != nil {
		t.Error("expected the user to be deleted")
	}
}

func TestDeleteUserGuardingLastAdmin_IsQuietAboutAUserAlreadyGone(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	// Matches DeleteUser, which no-ops rather than reporting a missing row.
	if err := store.DeleteUserGuardingLastAdmin(ctx, 999999); err != nil {
		t.Fatalf("deleting a user that is not there: %v", err)
	}
}

// --- Session lifecycle ---

func TestSessionLifecycle(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "session@test.com", hash, RoleUser, false)

	sess, err := store.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatalf("CreateSession: %v", err)
	}
	if sess.Token == "" {
		t.Fatal("session token is empty")
	}
	if sess.UserID != user.ID {
		t.Errorf("session user_id = %d, want %d", sess.UserID, user.ID)
	}
	if sess.ExpiresAt.IsZero() {
		t.Error("session expires_at is zero")
	}

	found, err := store.GetSession(ctx, sess.Token)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if found == nil {
		t.Fatal("expected non-nil session")
	}
	if found.UserID != user.ID {
		t.Errorf("user_id = %d, want %d", found.UserID, user.ID)
	}

	if err := store.DeleteSession(ctx, sess.Token); err != nil {
		t.Fatalf("DeleteSession: %v", err)
	}

	gone, _ := store.GetSession(ctx, sess.Token)
	if gone != nil {
		t.Errorf("expected nil session after delete, got %+v", gone)
	}
}

func TestGetSession_InvalidToken(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	sess, err := store.GetSession(ctx, "nonexistent-token")
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if sess != nil {
		t.Errorf("expected nil for invalid token, got %+v", sess)
	}
}

func TestDeleteExpiredSessions(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "expire@test.com", hash, RoleUser, false)
	sess, _ := store.CreateSession(ctx, user.ID)

	// Manually expire it
	testDB.ExecContext(ctx,
		"UPDATE sessions SET expires_at = NOW() - INTERVAL '1 hour' WHERE token_hash = $1",
		hashToken(sess.Token),
	)

	found, _ := store.GetSession(ctx, sess.Token)
	if found != nil {
		t.Error("expired session should not be found")
	}

	if err := store.DeleteExpiredSessions(ctx); err != nil {
		t.Fatalf("DeleteExpiredSessions: %v", err)
	}
}

// --- Verification tokens ---

func TestVerificationTokenLifecycle(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	user, _ := store.CreateUserFull(ctx, "verify@test.com", "", RoleUser, false, false)

	// Create token
	rawToken, err := store.CreateVerificationToken(ctx, user.ID, "email_verify")
	if err != nil {
		t.Fatalf("CreateVerificationToken: %v", err)
	}
	if rawToken == "" {
		t.Fatal("expected non-empty token")
	}

	// Validate token
	userID, err := store.ValidateVerificationToken(ctx, rawToken, "email_verify")
	if err != nil {
		t.Fatalf("ValidateVerificationToken: %v", err)
	}
	if userID != user.ID {
		t.Errorf("userID = %d, want %d", userID, user.ID)
	}

	// Wrong purpose should not match
	userID, err = store.ValidateVerificationToken(ctx, rawToken, "password_reset")
	if err != nil {
		t.Fatalf("ValidateVerificationToken (wrong purpose): %v", err)
	}
	if userID != 0 {
		t.Errorf("expected userID=0 for wrong purpose, got %d", userID)
	}

	// Delete tokens
	if err := store.DeleteVerificationTokens(ctx, user.ID, "email_verify"); err != nil {
		t.Fatalf("DeleteVerificationTokens: %v", err)
	}

	// Should no longer validate
	userID, _ = store.ValidateVerificationToken(ctx, rawToken, "email_verify")
	if userID != 0 {
		t.Errorf("expected userID=0 after deletion, got %d", userID)
	}
}

func TestVerificationToken_InvalidToken(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	userID, err := store.ValidateVerificationToken(ctx, "nonexistent-token", "email_verify")
	if err != nil {
		t.Fatalf("ValidateVerificationToken: %v", err)
	}
	if userID != 0 {
		t.Errorf("expected userID=0 for invalid token, got %d", userID)
	}
}

func TestDeleteExpiredVerificationTokens(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	user, _ := store.CreateUserFull(ctx, "expire-token@test.com", "", RoleUser, false, false)
	rawToken, _ := store.CreateVerificationToken(ctx, user.ID, "email_verify")

	// Manually expire it
	testDB.ExecContext(ctx,
		"UPDATE verification_tokens SET expires_at = NOW() - INTERVAL '1 hour' WHERE user_id = $1",
		user.ID,
	)

	// Expired token should not validate
	userID, _ := store.ValidateVerificationToken(ctx, rawToken, "email_verify")
	if userID != 0 {
		t.Error("expired token should not validate")
	}

	// Clean up
	if err := store.DeleteExpiredVerificationTokens(ctx); err != nil {
		t.Fatalf("DeleteExpiredVerificationTokens: %v", err)
	}
}

// --- TOTP secrets ---

func TestTOTPSecretCRUD(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "totp@test.com", hash, RoleUser, false)

	// Save secret
	if err := store.SaveTOTPSecret(ctx, user.ID, "encrypted-secret-data"); err != nil {
		t.Fatalf("SaveTOTPSecret: %v", err)
	}

	// Get secret
	secret, err := store.GetTOTPSecret(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetTOTPSecret: %v", err)
	}
	if secret != "encrypted-secret-data" {
		t.Errorf("secret = %q, want encrypted-secret-data", secret)
	}

	// Delete secret
	if err := store.DeleteTOTPSecret(ctx, user.ID); err != nil {
		t.Fatalf("DeleteTOTPSecret: %v", err)
	}

	secret, _ = store.GetTOTPSecret(ctx, user.ID)
	if secret != "" {
		t.Errorf("expected empty secret after delete, got %q", secret)
	}
}

func TestGetTOTPSecret_NotFound(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	secret, err := store.GetTOTPSecret(ctx, 99999)
	if err != nil {
		t.Fatalf("GetTOTPSecret: %v", err)
	}
	if secret != "" {
		t.Errorf("expected empty secret for nonexistent user, got %q", secret)
	}
}

// --- Recovery codes ---

func TestRecoveryCodeLifecycle(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "recovery@test.com", hash, RoleUser, false)

	// Generate and save codes
	codeHashes := make([]string, 3)
	for i := 0; i < 3; i++ {
		h, _ := HashPassword("code" + string(rune('0'+i)))
		codeHashes[i] = h
	}

	if err := store.SaveRecoveryCodes(ctx, user.ID, codeHashes); err != nil {
		t.Fatalf("SaveRecoveryCodes: %v", err)
	}

	// Get codes
	codes, err := store.GetRecoveryCodes(ctx, user.ID)
	if err != nil {
		t.Fatalf("GetRecoveryCodes: %v", err)
	}
	if len(codes) != 3 {
		t.Fatalf("got %d codes, want 3", len(codes))
	}

	// All should be unused
	for _, c := range codes {
		if c.Used {
			t.Error("expected unused code")
		}
	}

	// Spend one, then try to spend it again
	if claimed, err := store.ClaimRecoveryCode(ctx, codes[0].ID); err != nil || !claimed {
		t.Fatalf("ClaimRecoveryCode: claimed=%v err=%v, want true, nil", claimed, err)
	}
	if claimed, err := store.ClaimRecoveryCode(ctx, codes[0].ID); err != nil || claimed {
		t.Fatalf("ClaimRecoveryCode again: claimed=%v err=%v, want false, nil", claimed, err)
	}

	updatedCodes, _ := store.GetRecoveryCodes(ctx, user.ID)
	usedCount := 0
	for _, c := range updatedCodes {
		if c.Used {
			usedCount++
		}
	}
	if usedCount != 1 {
		t.Errorf("expected 1 used code, got %d", usedCount)
	}

	// Delete all codes
	if err := store.DeleteRecoveryCodes(ctx, user.ID); err != nil {
		t.Fatalf("DeleteRecoveryCodes: %v", err)
	}

	remaining, _ := store.GetRecoveryCodes(ctx, user.ID)
	if len(remaining) != 0 {
		t.Errorf("expected 0 codes after delete, got %d", len(remaining))
	}
}

func TestSaveRecoveryCodes_ReplacesExisting(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "replace@test.com", hash, RoleUser, false)

	// Save first batch
	batch1 := []string{"hash1", "hash2"}
	store.SaveRecoveryCodes(ctx, user.ID, batch1)

	// Save second batch (should replace)
	batch2 := []string{"hash3", "hash4", "hash5"}
	store.SaveRecoveryCodes(ctx, user.ID, batch2)

	codes, _ := store.GetRecoveryCodes(ctx, user.ID)
	if len(codes) != 3 {
		t.Errorf("expected 3 codes after replacement, got %d", len(codes))
	}
}

// --- MFA challenges ---

func TestMFAChallengeLifecycle(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "mfa@test.com", hash, RoleUser, false)

	// Create challenge
	mfaToken, err := store.CreateMFAChallenge(ctx, user.ID)
	if err != nil {
		t.Fatalf("CreateMFAChallenge: %v", err)
	}
	if mfaToken == "" {
		t.Fatal("expected non-empty MFA token")
	}

	// Validate challenge (single-use)
	userID, err := store.ValidateMFAChallenge(ctx, mfaToken)
	if err != nil {
		t.Fatalf("ValidateMFAChallenge: %v", err)
	}
	if userID != user.ID {
		t.Errorf("userID = %d, want %d", userID, user.ID)
	}

	// Second use should fail (consumed)
	userID, err = store.ValidateMFAChallenge(ctx, mfaToken)
	if err != nil {
		t.Fatalf("ValidateMFAChallenge (second): %v", err)
	}
	if userID != 0 {
		t.Errorf("expected userID=0 for consumed MFA token, got %d", userID)
	}
}

func TestMFAChallenge_InvalidToken(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	userID, err := store.ValidateMFAChallenge(ctx, "nonexistent-token")
	if err != nil {
		t.Fatalf("ValidateMFAChallenge: %v", err)
	}
	if userID != 0 {
		t.Errorf("expected userID=0 for invalid token, got %d", userID)
	}
}

func TestDeleteExpiredMFAChallenges(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "mfa-expire@test.com", hash, RoleUser, false)
	mfaToken, _ := store.CreateMFAChallenge(ctx, user.ID)

	// Manually expire it
	testDB.ExecContext(ctx,
		"UPDATE mfa_challenges SET expires_at = NOW() - INTERVAL '1 hour'",
	)

	// Expired challenge should not validate
	userID, _ := store.ValidateMFAChallenge(ctx, mfaToken)
	if userID != 0 {
		t.Error("expired MFA challenge should not validate")
	}

	if err := store.DeleteExpiredMFAChallenges(ctx); err != nil {
		t.Fatalf("DeleteExpiredMFAChallenges: %v", err)
	}
}

// --- App settings ---

func TestSettingsCRUD(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	// Get non-existent setting
	val, err := store.GetSetting(ctx, "require_2fa")
	if err != nil {
		t.Fatalf("GetSetting: %v", err)
	}
	if val != "" {
		t.Errorf("expected empty value for missing setting, got %q", val)
	}

	// Set setting
	if err := store.SetSetting(ctx, "require_2fa", "true"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}

	val, _ = store.GetSetting(ctx, "require_2fa")
	if val != "true" {
		t.Errorf("setting value = %q, want true", val)
	}

	// Update setting
	store.SetSetting(ctx, "require_2fa", "false")
	val, _ = store.GetSetting(ctx, "require_2fa")
	if val != "false" {
		t.Errorf("updated setting = %q, want false", val)
	}

	// Delete setting
	if err := store.DeleteSetting(ctx, "require_2fa"); err != nil {
		t.Fatalf("DeleteSetting: %v", err)
	}
	val, _ = store.GetSetting(ctx, "require_2fa")
	if val != "" {
		t.Errorf("expected empty after delete, got %q", val)
	}
}

// --- Audit log ---

func TestAuditLog(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "audit@test.com", hash, RoleUser, false)

	// Log an event
	err := store.LogAudit(ctx, &user.ID, AuditLoginSuccess, nil, map[string]any{"method": "password"})
	if err != nil {
		t.Fatalf("LogAudit: %v", err)
	}

	// Verify it was stored
	var count int
	testDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM audit_log WHERE user_id = $1 AND event = $2",
		user.ID, string(AuditLoginSuccess)).Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 audit entry, got %d", count)
	}

	// Check metadata
	var metadata string
	testDB.QueryRowContext(ctx, "SELECT metadata::text FROM audit_log WHERE user_id = $1",
		user.ID).Scan(&metadata)
	if metadata == "" || metadata == "null" {
		t.Error("expected non-empty metadata")
	}
}

func TestAuditLog_NilUserID(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	// Log with nil user ID (e.g. anonymous events)
	err := store.LogAudit(ctx, nil, AuditLoginFailed, nil, nil)
	if err != nil {
		t.Fatalf("LogAudit with nil user: %v", err)
	}

	var count int
	testDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM audit_log WHERE user_id IS NULL").Scan(&count)
	if count != 1 {
		t.Errorf("expected 1 audit entry with null user_id, got %d", count)
	}
}

func TestAuditLog_PreservedOnUserDelete(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "audit-delete@test.com", hash, RoleUser, false)
	store.LogAudit(ctx, &user.ID, AuditLoginSuccess, nil, nil)

	// Delete user
	store.DeleteUser(ctx, user.ID)

	// Audit entry should remain with null user_id
	var count int
	testDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM audit_log WHERE event = $1 AND user_id IS NULL",
		string(AuditLoginSuccess)).Scan(&count)
	if count != 1 {
		t.Errorf("expected audit entry preserved with null user_id, got count=%d", count)
	}
}

// --- Cascade behavior ---

func TestSessionDeletedWhenUserDeleted(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "cascade@test.com", hash, RoleUser, false)
	sess, _ := store.CreateSession(ctx, user.ID)

	store.DeleteUser(ctx, user.ID)

	found, _ := store.GetSession(ctx, sess.Token)
	if found != nil {
		t.Error("expected session to be cascade-deleted with user")
	}
}

func TestTOTPSecretDeletedWhenUserDeleted(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "totp-cascade@test.com", hash, RoleUser, false)
	store.SaveTOTPSecret(ctx, user.ID, "some-encrypted-secret")

	store.DeleteUser(ctx, user.ID)

	secret, _ := store.GetTOTPSecret(ctx, user.ID)
	if secret != "" {
		t.Error("expected TOTP secret to be cascade-deleted with user")
	}
}

func TestRecoveryCodesDeletedWhenUserDeleted(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test1234")
	user, _ := store.CreateUser(ctx, "recovery-cascade@test.com", hash, RoleUser, false)
	store.SaveRecoveryCodes(ctx, user.ID, []string{"hash1", "hash2"})

	store.DeleteUser(ctx, user.ID)

	codes, _ := store.GetRecoveryCodes(ctx, user.ID)
	if len(codes) != 0 {
		t.Errorf("expected 0 codes after user delete, got %d", len(codes))
	}
}

// --- FirstUser ---

func TestCreateFirstUser(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("admin1234")
	user, err := store.CreateFirstUser(ctx, "first@test.com", hash)
	if err != nil {
		t.Fatalf("CreateFirstUser: %v", err)
	}

	if user.Role != RoleAdmin {
		t.Errorf("role = %q, want admin", user.Role)
	}
	if !user.EmailVerified {
		t.Error("first user should have email_verified=true")
	}

	// Second call should fail
	_, err = store.CreateFirstUser(ctx, "second@test.com", hash)
	if err != ErrSetupAlreadyDone {
		t.Errorf("expected ErrSetupAlreadyDone, got %v", err)
	}
}

// --- Settings handler ---

func TestHandleGetSettings_ReportsEmail(t *testing.T) {
	truncateTables(t)

	for _, tc := range []struct {
		name   string
		sender email.Sender
		want   bool
	}{
		{"without SMTP", &email.LogSender{}, false},
		{"with SMTP", &email.SMTPSender{}, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			deps := testDeps()
			deps.Store = &Store{db: testDB}
			deps.EmailSender = tc.sender

			req := httptest.NewRequest(http.MethodGet, "/api/auth/settings", nil)
			req = req.WithContext(adminCtx())
			w := httptest.NewRecorder()
			HandleGetSettings(deps).ServeHTTP(w, req)

			if w.Code != http.StatusOK {
				t.Fatalf("status = %d, want %d", w.Code, http.StatusOK)
			}
			var body struct {
				EmailEnabled *bool `json:"email_enabled"`
			}
			if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
				t.Fatalf("decoding %q: %v", w.Body.String(), err)
			}
			if body.EmailEnabled == nil || *body.EmailEnabled != tc.want {
				t.Errorf("email_enabled = %v, want %v (body: %s)", body.EmailEnabled, tc.want, w.Body.String())
			}
		})
	}
}

// --- Sign-in limits ---

// A sign-in as it arrives in production: through an outer proxy, then the
// frontend's nginx, which sets X-Real-IP to the outer proxy's address.
func loginFrom(t *testing.T, deps *HandlerDeps, client, email, password string) int {
	t.Helper()
	body := strings.NewReader(`{"email":"` + email + `","auth_key":"` + password + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body)
	req.RemoteAddr = "172.18.0.3:40000"
	req.Header.Set("X-Real-IP", "172.18.0.1")
	req.Header.Set("X-Forwarded-For", client+", 172.18.0.1")
	w := httptest.NewRecorder()
	HandleLogin(deps).ServeHTTP(w, req)
	return w.Code
}

func loginDeps(t *testing.T) *HandlerDeps {
	t.Helper()
	truncateTables(t)
	store := NewStore(testDB)
	for _, email := range []string{"father@example.ch", "admin@example.ch"} {
		if _, err := store.CreateUserFull(context.Background(), email, mustHash("right-pass-1"), RoleUser, false, true); err != nil {
			t.Fatalf("CreateUserFull: %v", err)
		}
	}
	deps := testDeps()
	deps.Store = store
	deps.LoginLimiter = NewLoginRateLimiter(20, time.Minute)
	deps.LoginAccountLimiter = NewLoginRateLimiter(5, time.Minute)
	for _, l := range []*LoginRateLimiter{deps.LoginLimiter, deps.LoginAccountLimiter} {
		l.SetTrustedProxies([]string{"172.16.0.0/12"})
	}
	return deps
}

func TestLogin_OneAccountsFailuresDoNotLockOutAnother(t *testing.T) {
	// The report: five wrong passwords for one account, then a single
	// sign-in to another, from another device — refused as too many.
	deps := loginDeps(t)

	for i := 0; i < 5; i++ {
		loginFrom(t, deps, "203.0.113.7", "father@example.ch", "wrong-pass")
	}
	if got := loginFrom(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1"); got != http.StatusTooManyRequests {
		t.Errorf("sixth try at the same account = %d, want 429", got)
	}

	// Another device elsewhere.
	if got := loginFrom(t, deps, "198.51.100.9", "admin@example.ch", "right-pass-1"); got != http.StatusOK {
		t.Errorf("another account from another address = %d, want 200", got)
	}
	// The same router, as a household shares one.
	if got := loginFrom(t, deps, "203.0.113.7", "admin@example.ch", "right-pass-1"); got != http.StatusOK {
		t.Errorf("another account from the same address = %d, want 200", got)
	}
}

func TestLogin_GuessingAcrossAccountsIsStillLimited(t *testing.T) {
	deps := loginDeps(t)

	for i := 0; i < 20; i++ {
		loginFrom(t, deps, "203.0.113.7", "nobody"+strconv.Itoa(i)+"@example.ch", "wrong-pass")
	}
	if got := loginFrom(t, deps, "203.0.113.7", "admin@example.ch", "right-pass-1"); got != http.StatusTooManyRequests {
		t.Errorf("after twenty misses across accounts = %d, want 429", got)
	}
}

func TestLogin_TheRightPasswordClearsTheMisses(t *testing.T) {
	deps := loginDeps(t)

	for i := 0; i < 4; i++ {
		loginFrom(t, deps, "203.0.113.7", "father@example.ch", "wrong-pass")
	}
	if got := loginFrom(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1"); got != http.StatusOK {
		t.Fatalf("right password after four misses = %d, want 200", got)
	}
	// Four more misses would have been nine without the reset.
	for i := 0; i < 4; i++ {
		loginFrom(t, deps, "203.0.113.7", "father@example.ch", "wrong-pass")
	}
	if got := loginFrom(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1"); got != http.StatusOK {
		t.Errorf("right password after four fresh misses = %d, want 200", got)
	}
}

func TestLogin_AuditRecordsTheClientNotTheProxy(t *testing.T) {
	deps := loginDeps(t)
	deps.Store.SetTrustedProxies([]string{"172.16.0.0/12"})

	loginFrom(t, deps, "203.0.113.7", "father@example.ch", "wrong-pass")

	var ip string
	if err := testDB.QueryRow(`SELECT ip_address FROM audit_log ORDER BY id DESC LIMIT 1`).Scan(&ip); err != nil {
		t.Fatalf("reading audit_log: %v", err)
	}
	if ip != "203.0.113.7" {
		t.Errorf("audit ip = %q, want 203.0.113.7", ip)
	}
}

// --- Sessions per device ---

// signIn signs in as a browser would and returns the session it was given.
func signIn(t *testing.T, deps *HandlerDeps, email string) string {
	t.Helper()
	body := strings.NewReader(`{"email":"` + email + `","auth_key":"right-pass-1"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body)
	w := httptest.NewRecorder()
	HandleLogin(deps).ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("sign-in as %s = %d: %s", email, w.Code, w.Body.String())
	}
	for _, c := range w.Result().Cookies() {
		if c.Name == "session" {
			return c.Value
		}
	}
	t.Fatalf("sign-in as %s set no session cookie", email)
	return ""
}

func stillSignedIn(t *testing.T, store *Store, token string) bool {
	t.Helper()
	sess, err := store.GetSession(context.Background(), token)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	return sess != nil
}

func asUser(t *testing.T, store *Store, email string) context.Context {
	t.Helper()
	user, err := store.GetUserByEmail(context.Background(), email)
	if err != nil || user == nil {
		t.Fatalf("GetUserByEmail(%s): %v", email, err)
	}
	return context.WithValue(context.Background(), userContextKey, user)
}

func TestLogin_AUserKeepsTheirOtherDevicesSignedIn(t *testing.T) {
	// The report: signing in on a phone signed the laptop out without a word.
	deps := loginDeps(t)
	store := deps.Store

	laptop := signIn(t, deps, "father@example.ch")
	phone := signIn(t, deps, "father@example.ch")

	if !stillSignedIn(t, store, laptop) {
		t.Error("the laptop was signed out by signing in on the phone")
	}
	if !stillSignedIn(t, store, phone) {
		t.Error("the phone is not signed in")
	}
}

func TestLogin_AnAdminHasExactlyOneSession(t *testing.T) {
	deps := loginDeps(t)
	store := deps.Store
	if _, err := store.CreateUserFull(context.Background(), "root@example.ch", mustHash("right-pass-1"), RoleAdmin, false, true); err != nil {
		t.Fatalf("CreateUserFull: %v", err)
	}

	first := signIn(t, deps, "root@example.ch")
	second := signIn(t, deps, "root@example.ch")

	if stillSignedIn(t, store, first) {
		t.Error("an earlier admin session survived a new admin sign-in")
	}
	if !stillSignedIn(t, store, second) {
		t.Error("the new admin session is not signed in")
	}
}

func TestLogoutEverywhere_EndsEverySessionOfTheAccount(t *testing.T) {
	deps := loginDeps(t)
	store := deps.Store
	laptop := signIn(t, deps, "father@example.ch")
	phone := signIn(t, deps, "father@example.ch")
	someoneElse := signIn(t, deps, "admin@example.ch")

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout-everywhere", nil)
	req = req.WithContext(asUser(t, store, "father@example.ch"))
	w := httptest.NewRecorder()
	HandleLogoutEverywhere(deps).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	if stillSignedIn(t, store, laptop) || stillSignedIn(t, store, phone) {
		t.Error("a session of the account survived signing out everywhere")
	}
	if !stillSignedIn(t, store, someoneElse) {
		t.Error("another account was signed out too")
	}
	var cleared bool
	for _, c := range w.Result().Cookies() {
		if c.Name == "session" && c.MaxAge < 0 {
			cleared = true
		}
	}
	if !cleared {
		t.Error("this device's cookie was not cleared")
	}
	var logged int
	testDB.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE event = 'logout_everywhere'`).Scan(&logged)
	if logged != 1 {
		t.Errorf("audit entries for logout_everywhere = %d, want 1", logged)
	}
}

func TestAdminResetPassword_SignsTheUserOutEverywhere(t *testing.T) {
	// A reset answers "someone else may know this password". Every device
	// signed in with the old one has to go.
	deps := loginDeps(t)
	store := deps.Store
	laptop := signIn(t, deps, "father@example.ch")
	phone := signIn(t, deps, "father@example.ch")
	target, _ := store.GetUserByEmail(context.Background(), "father@example.ch")

	admin := &User{ID: 999, Email: "root@example.ch", Role: RoleAdmin, EmailVerified: true}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", strconv.Itoa(target.ID))
	ctx := context.WithValue(context.WithValue(context.Background(), userContextKey, admin), chi.RouteCtxKey, rctx)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/users/"+strconv.Itoa(target.ID)+"/reset-password", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	HandleAdminResetPassword(deps).ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", w.Code, w.Body.String())
	}
	if stillSignedIn(t, store, laptop) || stillSignedIn(t, store, phone) {
		t.Error("a device stayed signed in after an admin reset the password")
	}
}

// --- Limits that hold under a burst, and codes that are spent ---

func TestLogin_AParallelBurstGetsOnlyTheLimit(t *testing.T) {
	// The audit: every request that arrived before the first bcrypt finished
	// had passed the check, so fifty at once were fifty guesses, not five.
	deps := loginDeps(t)

	codes := make(chan int, 50)
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			codes <- loginFrom(t, deps, "203.0.113.7", "father@example.ch", "wrong-pass")
		}()
	}
	wg.Wait()
	close(codes)

	guessed := 0
	for code := range codes {
		if code != http.StatusTooManyRequests {
			guessed++
		}
	}
	if guessed != 5 {
		t.Errorf("%d of 50 parallel guesses were checked, want 5", guessed)
	}
}

func TestLogin_GuessesFromManyAddressesAreLimitedPerEmail(t *testing.T) {
	deps := loginDeps(t)
	deps.LoginEmailLimiter = NewLoginRateLimiter(3, time.Minute)

	for i := 0; i < 3; i++ {
		loginFrom(t, deps, "198.51.100."+strconv.Itoa(i+1), "father@example.ch", "wrong-pass")
	}
	if got := loginFrom(t, deps, "198.51.100.200", "father@example.ch", "right-pass-1"); got != http.StatusTooManyRequests {
		t.Errorf("after three misses from three addresses, a fourth address = %d, want 429", got)
	}
	if got := loginFrom(t, deps, "198.51.100.200", "admin@example.ch", "right-pass-1"); got != http.StatusOK {
		t.Errorf("another email from that address = %d, want 200", got)
	}
}

func TestLogin_TheRightPasswordDoesNotClearOtherAddressesMisses(t *testing.T) {
	// Otherwise the real user signing in would hand a distributed guesser a
	// fresh allowance every time.
	deps := loginDeps(t)
	deps.LoginEmailLimiter = NewLoginRateLimiter(3, time.Minute)

	loginFrom(t, deps, "198.51.100.1", "father@example.ch", "wrong-pass")
	loginFrom(t, deps, "198.51.100.2", "father@example.ch", "wrong-pass")
	if got := loginFrom(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1"); got != http.StatusOK {
		t.Fatalf("the real user = %d, want 200", got)
	}
	loginFrom(t, deps, "198.51.100.3", "father@example.ch", "wrong-pass")
	if got := loginFrom(t, deps, "198.51.100.4", "father@example.ch", "wrong-pass"); got != http.StatusTooManyRequests {
		t.Errorf("the fourth miss overall = %d, want 429", got)
	}
}

// tempAuthKey is what a browser sends for a temporary password: its auth key,
// derived with the account's own rounds.
func tempAuthKey(t *testing.T, deps *HandlerDeps, email, temp string) string {
	t.Helper()
	u, _ := deps.Store.GetUserByEmail(context.Background(), email)
	key, err := DeriveAuthKey(temp, email, u.KDFIterations)
	if err != nil {
		t.Fatal(err)
	}
	return key
}

// resetPassword resets email's password as an admin would and returns the
// auth key of the temporary one, as the browser would send it.
func resetPassword(t *testing.T, deps *HandlerDeps, email string) string {
	t.Helper()
	target, _ := deps.Store.GetUserByEmail(context.Background(), email)
	admin := &User{ID: 999, Email: "root@example.ch", Role: RoleAdmin, EmailVerified: true, TOTPEnabled: true}
	rctx := chi.NewRouteContext()
	rctx.URLParams.Add("id", strconv.Itoa(target.ID))
	ctx := context.WithValue(context.WithValue(context.Background(), userContextKey, admin), chi.RouteCtxKey, rctx)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/users/"+strconv.Itoa(target.ID)+"/reset-password", nil).WithContext(ctx)
	w := httptest.NewRecorder()
	HandleAdminResetPassword(deps).ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("reset = %d: %s", w.Code, w.Body.String())
	}
	var body struct {
		TempPassword  string `json:"temp_password"`
		TempExpiresAt string `json:"temp_expires_at"`
	}
	json.NewDecoder(w.Body).Decode(&body)
	expires, err := time.Parse(time.RFC3339, body.TempExpiresAt)
	if err != nil || time.Until(expires) < TempPasswordLifetime-time.Minute {
		t.Fatalf("temp_expires_at = %q, want about %v from now", body.TempExpiresAt, TempPasswordLifetime)
	}
	return tempAuthKey(t, deps, email, body.TempPassword)
}

func TestAdminResetPassword_TheTemporaryPasswordExpires(t *testing.T) {
	deps := loginDeps(t)
	temp := resetPassword(t, deps, "father@example.ch")

	if got := loginFrom(t, deps, "203.0.113.7", "father@example.ch", temp); got != http.StatusOK {
		t.Fatalf("temporary password in time = %d, want 200", got)
	}

	testDB.Exec(`UPDATE users SET temp_password_expires_at = NOW() - INTERVAL '1 minute' WHERE email = 'father@example.ch'`)
	body := strings.NewReader(`{"email":"father@example.ch","auth_key":"` + temp + `"}`)
	w := httptest.NewRecorder()
	HandleLogin(deps).ServeHTTP(w, httptest.NewRequest(http.MethodPost, "/api/auth/login", body))
	if w.Code != http.StatusUnauthorized || !strings.Contains(w.Body.String(), "AUTH-037") {
		t.Errorf("temporary password past its time = %d %s, want 401 AUTH-037", w.Code, w.Body.String())
	}
}

func TestChangePassword_EndsTheTemporaryPasswordsDeadline(t *testing.T) {
	deps := loginDeps(t)
	temp := resetPassword(t, deps, "father@example.ch")

	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password",
		strings.NewReader(`{"current_auth_key":"`+temp+`","new_auth_key":"9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo="}`))
	req = req.WithContext(asUser(t, deps.Store, "father@example.ch"))
	w := httptest.NewRecorder()
	HandleChangePassword(deps).ServeHTTP(w, req)
	if w.Code != http.StatusOK {
		t.Fatalf("change = %d: %s", w.Code, w.Body.String())
	}

	user, _ := deps.Store.GetUserByEmail(context.Background(), "father@example.ch")
	if user.MustChangePassword || user.TempPasswordExpiresAt != nil {
		t.Errorf("after the change: must=%v expires=%v, want false and none", user.MustChangePassword, user.TempPasswordExpiresAt)
	}
}

// with2FA turns on TOTP for email and returns its secret.
func with2FA(t *testing.T, deps *HandlerDeps, email string) (int, string) {
	t.Helper()
	user, _ := deps.Store.GetUserByEmail(context.Background(), email)
	key, err := totp.Generate(totp.GenerateOpts{Issuer: "test", AccountName: email})
	if err != nil {
		t.Fatal(err)
	}
	enc, err := Encrypt([]byte(key.Secret()), deps.EncryptionKey)
	if err != nil {
		t.Fatal(err)
	}
	if err := deps.Store.SaveTOTPSecret(context.Background(), user.ID, enc); err != nil {
		t.Fatal(err)
	}
	if err := deps.Store.SetTOTPEnabled(context.Background(), user.ID, true); err != nil {
		t.Fatal(err)
	}
	return user.ID, key.Secret()
}

// verify2FAFrom answers a fresh challenge for userID with code.
func verify2FAFrom(t *testing.T, deps *HandlerDeps, client string, userID int, code string) *httptest.ResponseRecorder {
	t.Helper()
	token, err := deps.Store.CreateMFAChallenge(context.Background(), userID)
	if err != nil {
		t.Fatal(err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/auth/verify-2fa",
		strings.NewReader(`{"mfa_token":"`+token+`","code":"`+code+`"}`))
	req.RemoteAddr = client + ":40000"
	w := httptest.NewRecorder()
	HandleVerify2FA(deps).ServeHTTP(w, req)
	return w
}

func TestVerify2FA_ACodeWorksOnce(t *testing.T) {
	deps := loginDeps(t)
	deps.EncryptionKey = make([]byte, 32)
	userID, secret := with2FA(t, deps, "father@example.ch")
	code, _ := totp.GenerateCode(secret, time.Now())

	if w := verify2FAFrom(t, deps, "203.0.113.7", userID, code); w.Code != http.StatusOK {
		t.Fatalf("first use = %d: %s", w.Code, w.Body.String())
	}
	if w := verify2FAFrom(t, deps, "198.51.100.9", userID, code); w.Code != http.StatusUnauthorized {
		t.Errorf("the same code again = %d, want 401", w.Code)
	}
}

func TestVerify2FA_WrongCodesAreLimitedPerAccount(t *testing.T) {
	// A correct password is never counted, so an attacker who has it can
	// fetch a challenge per guess, each from a different address.
	deps := loginDeps(t)
	deps.EncryptionKey = make([]byte, 32)
	deps.Verify2FAUserLimiter = NewLoginRateLimiter(2, time.Minute)
	userID, secret := with2FA(t, deps, "father@example.ch")

	verify2FAFrom(t, deps, "198.51.100.1", userID, "000000")
	verify2FAFrom(t, deps, "198.51.100.2", userID, "000000")
	code, _ := totp.GenerateCode(secret, time.Now())
	if w := verify2FAFrom(t, deps, "198.51.100.3", userID, code); w.Code != http.StatusTooManyRequests {
		t.Errorf("third try from a third address = %d, want 429", w.Code)
	}
}

func TestVerify2FA_ARecoveryCodeWorksOnce(t *testing.T) {
	deps := loginDeps(t)
	deps.EncryptionKey = make([]byte, 32)
	userID, _ := with2FA(t, deps, "father@example.ch")
	codes, hashes, err := generateRecoveryCodes(2)
	if err != nil {
		t.Fatal(err)
	}
	deps.Store.SaveRecoveryCodes(context.Background(), userID, hashes)

	if w := verify2FAFrom(t, deps, "203.0.113.7", userID, codes[0]); w.Code != http.StatusOK {
		t.Fatalf("recovery code = %d: %s", w.Code, w.Body.String())
	}
	if w := verify2FAFrom(t, deps, "203.0.113.7", userID, codes[0]); w.Code != http.StatusUnauthorized {
		t.Errorf("the same recovery code again = %d, want 401", w.Code)
	}
}

func TestClaimTOTPStep_OnlyALaterStep(t *testing.T) {
	deps := loginDeps(t)
	deps.EncryptionKey = make([]byte, 32)
	userID, _ := with2FA(t, deps, "father@example.ch")
	store, ctx := deps.Store, context.Background()

	for _, tc := range []struct {
		step int64
		want bool
	}{{10, true}, {10, false}, {9, false}, {11, true}} {
		if got, err := store.ClaimTOTPStep(ctx, userID, tc.step); err != nil || got != tc.want {
			t.Errorf("claim %d = %v, %v; want %v", tc.step, got, err, tc.want)
		}
	}
	// A new secret starts over.
	store.SaveTOTPSecret(ctx, userID, "replaced")
	if got, _ := store.ClaimTOTPStep(ctx, userID, 5); !got {
		t.Error("a new secret did not start its steps over")
	}
}

func TestDisable2FA_RefusedWhileTheInstanceRequiresIt(t *testing.T) {
	deps := loginDeps(t)
	deps.EncryptionKey = make([]byte, 32)
	with2FA(t, deps, "father@example.ch")
	deps.Store.SetSetting(context.Background(), "require_2fa", "true")

	req := httptest.NewRequest(http.MethodDelete, "/api/auth/2fa", strings.NewReader(`{"auth_key":"right-pass-1"}`))
	req = req.WithContext(asUser(t, deps.Store, "father@example.ch"))
	w := httptest.NewRecorder()
	HandleDisable2FA(deps).ServeHTTP(w, req)

	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "AUTH-038") {
		t.Errorf("disable under the policy = %d %s, want 409 AUTH-038", w.Code, w.Body.String())
	}
	if user, _ := deps.Store.GetUserByEmail(context.Background(), "father@example.ch"); !user.TOTPEnabled {
		t.Error("2FA was turned off anyway")
	}
}

// --- Lockouts an administrator clears, and their own 2FA ---

func clearLockoutsAs(t *testing.T, deps *HandlerDeps, body string) *httptest.ResponseRecorder {
	t.Helper()
	// A real account: the audit row names who cleared it, by a foreign key.
	admin, _ := deps.Store.GetUserByEmail(context.Background(), "root@example.ch")
	if admin == nil {
		var err error
		if admin, err = deps.Store.CreateUserFull(context.Background(), "root@example.ch", mustHash("right-pass-1"), RoleAdmin, false, true); err != nil {
			t.Fatal(err)
		}
	}
	admin.TOTPEnabled = true
	req := httptest.NewRequest(http.MethodPost, "/api/auth/lockouts/clear", strings.NewReader(body))
	req = req.WithContext(ContextWithUser(context.Background(), admin))
	w := httptest.NewRecorder()
	HandleClearLockouts(deps).ServeHTTP(w, req)
	return w
}

func TestClearLockouts_LetsAnAddressSignInAgainFromAnywhere(t *testing.T) {
	deps := loginDeps(t)
	deps.LoginEmailLimiter = NewLoginRateLimiter(3, time.Hour)
	for i := 0; i < 5; i++ {
		loginFrom(t, deps, "198.51.100."+strconv.Itoa(i%3+1), "father@example.ch", "wrong-pass")
	}
	if got := loginFrom(t, deps, "198.51.100.1", "father@example.ch", "right-pass-1"); got != http.StatusTooManyRequests {
		t.Fatalf("before clearing = %d, want 429", got)
	}

	if w := clearLockoutsAs(t, deps, `{"kind":"address","key":"father@example.ch"}`); w.Code != http.StatusOK {
		t.Fatalf("clear = %d: %s", w.Code, w.Body.String())
	}
	// Including from a device whose own count was full.
	if got := loginFrom(t, deps, "198.51.100.1", "father@example.ch", "right-pass-1"); got != http.StatusOK {
		t.Errorf("after clearing = %d, want 200", got)
	}
	var logged int
	testDB.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE event = 'lockout_cleared'`).Scan(&logged)
	if logged != 1 {
		t.Errorf("audit entries for lockout_cleared = %d, want 1", logged)
	}
}

func TestClearLockouts_NeedsWhatToClear(t *testing.T) {
	deps := loginDeps(t)
	if w := clearLockoutsAs(t, deps, `{"kind":"address"}`); w.Code != http.StatusBadRequest {
		t.Errorf("no key = %d, want 400", w.Code)
	}
	if w := clearLockoutsAs(t, deps, `{"kind":"nonsense","key":"x"}`); w.Code != http.StatusBadRequest {
		t.Errorf("unknown kind = %d, want 400", w.Code)
	}
}

func TestDisable2FA_AnAdministratorMayNot(t *testing.T) {
	deps := loginDeps(t)
	deps.EncryptionKey = make([]byte, 32)
	if _, err := deps.Store.CreateUserFull(context.Background(), "root@example.ch", mustHash("right-pass-1"), RoleAdmin, false, true); err != nil {
		t.Fatal(err)
	}
	with2FA(t, deps, "root@example.ch")

	req := httptest.NewRequest(http.MethodDelete, "/api/auth/2fa", strings.NewReader(`{"auth_key":"right-pass-1"}`))
	req = req.WithContext(asUser(t, deps.Store, "root@example.ch"))
	w := httptest.NewRecorder()
	HandleDisable2FA(deps).ServeHTTP(w, req)

	if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "AUTH-044") {
		t.Errorf("admin disabling 2FA = %d %s, want 409 AUTH-044", w.Code, w.Body.String())
	}
}

// --- Trusted devices ---

// loginWith signs in from client carrying cookies, and returns the response.
func loginWith(t *testing.T, deps *HandlerDeps, client, email, password string, cookies ...*http.Cookie) *httptest.ResponseRecorder {
	t.Helper()
	body := strings.NewReader(`{"email":"` + email + `","auth_key":"` + password + `"}`)
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", body)
	req.RemoteAddr = "172.18.0.3:40000"
	req.Header.Set("X-Forwarded-For", client+", 172.18.0.1")
	for _, c := range cookies {
		req.AddCookie(c)
	}
	w := httptest.NewRecorder()
	HandleLogin(deps).ServeHTTP(w, req)
	return w
}

func deviceCookie(w *httptest.ResponseRecorder) *http.Cookie {
	for _, c := range w.Result().Cookies() {
		if strings.HasPrefix(c.Name, deviceCookiePrefix) && c.MaxAge > 0 {
			return c
		}
	}
	return nil
}

func deviceDeps(t *testing.T) *HandlerDeps {
	deps := loginDeps(t)
	deps.EncryptionKey = make([]byte, 32)
	deps.LoginEmailLimiter = NewLoginRateLimiter(3, time.Hour)
	deps.DeviceLimiter = NewLoginRateLimiter(5, 15*time.Minute)
	return deps
}

func TestLogin_AKnownDeviceGetsInWhileTheAddressIsLockedOut(t *testing.T) {
	// The attack the cookie exists for: somebody fills the address's limit on
	// purpose, from addresses of their own.
	deps := deviceDeps(t)
	w := loginWith(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1")
	laptop := deviceCookie(w)
	if w.Code != http.StatusOK || laptop == nil {
		t.Fatalf("first sign-in = %d, device cookie %v", w.Code, laptop)
	}
	if laptop.Path != "/api/auth" || !laptop.HttpOnly {
		t.Errorf("cookie path %q httpOnly %v, want /api/auth and true", laptop.Path, laptop.HttpOnly)
	}

	for i := 1; i <= 3; i++ {
		loginWith(t, deps, "198.51.100."+strconv.Itoa(i), "father@example.ch", "wrong-pass")
	}
	if got := loginWith(t, deps, "192.0.2.50", "father@example.ch", "right-pass-1"); got.Code != http.StatusTooManyRequests {
		t.Fatalf("a new device during the attack = %d, want 429", got.Code)
	}
	if got := loginWith(t, deps, "192.0.2.50", "father@example.ch", "right-pass-1", laptop); got.Code != http.StatusOK {
		t.Errorf("the owner's laptop during the attack = %d, want 200", got.Code)
	}
}

func TestLogin_AKnownDeviceHasALimitOfItsOwn(t *testing.T) {
	// A stolen device cookie is not a free pass to guess.
	deps := deviceDeps(t)
	laptop := deviceCookie(loginWith(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1"))

	for i := 0; i < 5; i++ {
		loginWith(t, deps, "203.0.113.7", "father@example.ch", "wrong-pass", laptop)
	}
	if got := loginWith(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1", laptop); got.Code != http.StatusTooManyRequests {
		t.Errorf("sixth try from one device = %d, want 429", got.Code)
	}
}

func TestLogin_ADeviceCookieIsForItsOwnAccountOnly(t *testing.T) {
	deps := deviceDeps(t)
	fathers := deviceCookie(loginWith(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1"))
	// Presented under the name another account's cookie would have.
	fathers.Name = deviceCookiePrefix + "2"
	for i := 1; i <= 3; i++ {
		loginWith(t, deps, "198.51.100."+strconv.Itoa(i), "admin@example.ch", "wrong-pass")
	}
	if got := loginWith(t, deps, "192.0.2.50", "admin@example.ch", "right-pass-1", fathers); got.Code != http.StatusTooManyRequests {
		t.Errorf("another account's cookie = %d, want 429", got.Code)
	}
}

func TestAdminReset_RetiresTheAccountsDevices(t *testing.T) {
	deps := deviceDeps(t)
	laptop := deviceCookie(loginWith(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1"))
	temp := resetPassword(t, deps, "father@example.ch")

	for i := 1; i <= 3; i++ {
		loginWith(t, deps, "198.51.100."+strconv.Itoa(i), "father@example.ch", "wrong-pass")
	}
	if got := loginWith(t, deps, "192.0.2.50", "father@example.ch", temp, laptop); got.Code != http.StatusTooManyRequests {
		t.Errorf("a device from before the reset = %d, want 429: it should no longer be trusted", got.Code)
	}
}

func TestLogoutEverywhere_RetiresTheAccountsDevices(t *testing.T) {
	deps := deviceDeps(t)
	laptop := deviceCookie(loginWith(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1"))

	req := httptest.NewRequest(http.MethodPost, "/api/auth/logout-everywhere", nil)
	req = req.WithContext(asUser(t, deps.Store, "father@example.ch"))
	HandleLogoutEverywhere(deps).ServeHTTP(httptest.NewRecorder(), req)

	for i := 1; i <= 3; i++ {
		loginWith(t, deps, "198.51.100."+strconv.Itoa(i), "father@example.ch", "wrong-pass")
	}
	if got := loginWith(t, deps, "192.0.2.50", "father@example.ch", "right-pass-1", laptop); got.Code != http.StatusTooManyRequests {
		t.Errorf("a device from before signing out everywhere = %d, want 429", got.Code)
	}
}

func TestVerify2FA_TheDeviceIsRememberedOnlyAfterTheSecondFactor(t *testing.T) {
	deps := deviceDeps(t)
	userID, secret := with2FA(t, deps, "father@example.ch")

	w := loginWith(t, deps, "203.0.113.7", "father@example.ch", "right-pass-1")
	if w.Code != http.StatusOK || deviceCookie(w) != nil {
		t.Fatalf("password step = %d, device cookie %v: want 200 and none yet", w.Code, deviceCookie(w))
	}
	code, _ := totp.GenerateCode(secret, time.Now())
	if v := verify2FAFrom(t, deps, "203.0.113.7", userID, code); v.Code != http.StatusOK || deviceCookie(v) == nil {
		t.Errorf("second factor = %d, device cookie %v: want 200 and one", v.Code, deviceCookie(v))
	}
}

// --- Key separation: prelogin, migration, renewal ---

const (
	newKey  = "9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo="
	recAuth = "l1vKXKm/itMumYomXdESJZ7V0wydUfu1pN0tFbVbn/k="
	newKey2 = "nnohXZbg/yNYvts4BMMgG5b3N6n4SRd8UFt2kzxl6eI="
)

// legacyAccount makes a version 1 account as one from before key separation:
// signed in with its password, a vault key wrapped under it, and a recovery
// key stored as the hash of the raw key.
func legacyAccount(t *testing.T, store *Store, email string, withVault bool) *User {
	t.Helper()
	u, err := store.CreateUserFull(context.Background(), email, mustHash("old-pass-1"), RoleUser, false, true)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := testDB.Exec(`UPDATE users SET auth_version = 1 WHERE id = $1`, u.ID); err != nil {
		t.Fatal(err)
	}
	if withVault {
		if _, err := testDB.Exec(`UPDATE users SET encrypted_mek = 'mek-under-password', recovery_key_hash = $2,
		     encrypted_mek_recovery = 'mek-under-raw-recovery', recovery_version = 1 WHERE id = $1`,
			u.ID, mustHash("RAW-RECOVERY-KEY")); err != nil {
			t.Fatal(err)
		}
	}
	u, _ = store.GetUserByID(context.Background(), u.ID)
	return u
}

func post(t *testing.T, h http.HandlerFunc, ctx context.Context, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/x", strings.NewReader(body)).WithContext(ctx)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, req)
	return w
}

func TestPrelogin_SaysHowToDeriveAndHidesUnknownAddresses(t *testing.T) {
	deps := loginDeps(t)
	legacyAccount(t, deps.Store, "old@example.ch", false)

	read := func(email string) PreloginResponse {
		w := post(t, HandlePrelogin(deps), context.Background(), `{"email":"`+email+`"}`)
		var r PreloginResponse
		json.NewDecoder(w.Body).Decode(&r)
		return r
	}
	if r := read("father@example.ch"); r.AuthVersion != 2 || r.KDF != "pbkdf2-sha256" || r.Iterations != DefaultKDFIterations {
		t.Errorf("a version 2 account: %+v", r)
	}
	if r := read("old@example.ch"); r.AuthVersion != 1 {
		t.Errorf("a version 1 account: %+v, want version 1", r)
	}
	if read("nobody@example.ch") != read("father@example.ch") {
		t.Error("an unknown address answers differently from a new account")
	}
}

func TestLogin_AVersion1AccountSignsInWithItsPasswordAndSaysSo(t *testing.T) {
	deps := loginDeps(t)
	legacyAccount(t, deps.Store, "old@example.ch", true)

	body := `{"email":"old@example.ch","password":"old-pass-1"}`
	w := post(t, HandleLogin(deps), context.Background(), body)
	if w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"auth_version":1`) {
		t.Errorf("version 1 with its password = %d %s, want 200 with auth_version 1", w.Code, w.Body.String())
	}
	if w := post(t, HandleLogin(deps), context.Background(), `{"email":"old@example.ch","auth_key":"old-pass-1"}`); w.Code != http.StatusUnauthorized {
		t.Errorf("version 1 with an auth key = %d, want 401", w.Code)
	}
}

func TestUpgrade_MovesAVersion1AccountInOneStep(t *testing.T) {
	deps := loginDeps(t)
	u := legacyAccount(t, deps.Store, "old@example.ch", true)
	ctx := ContextWithUser(context.Background(), u)
	full := `"new_auth_key":"` + newKey + `","encrypted_mek":"mek-under-vault-kek","recovery_auth":"` + recAuth + `","encrypted_mek_recovery":"mek-under-recovery-kek"`

	for name, tc := range map[string]struct {
		body string
		code int
		want string
	}{
		"a session alone":          {`{` + full + `}`, 400, "AUTH-017"},
		"the wrong password":       {`{"password":"guess",` + full + `}`, 401, "AUTH-015"},
		"no rewrapped vault key":   {`{"password":"old-pass-1","new_auth_key":"` + newKey + `","recovery_auth":"` + recAuth + `","encrypted_mek_recovery":"r"}`, 400, "AUTH-061"},
		"no new recovery key":      {`{"password":"old-pass-1","new_auth_key":"` + newKey + `","encrypted_mek":"m"}`, 400, "AUTH-062"},
		"the password as auth key": {`{"password":"old-pass-1","new_auth_key":"old-pass-1","encrypted_mek":"m","recovery_auth":"` + recAuth + `","encrypted_mek_recovery":"r"}`, 400, "AUTH-053"},
	} {
		if w := post(t, HandleUpgrade(deps), ctx, tc.body); w.Code != tc.code || !strings.Contains(w.Body.String(), tc.want) {
			t.Errorf("%s = %d %s, want %d %s", name, w.Code, w.Body.String(), tc.code, tc.want)
		}
	}
	if after, _ := deps.Store.GetUserByID(context.Background(), u.ID); after.AuthVersion != 1 {
		t.Fatal("a refused upgrade changed the account")
	}

	if w := post(t, HandleUpgrade(deps), ctx, `{"password":"old-pass-1",`+full+`}`); w.Code != http.StatusOK || !strings.Contains(w.Body.String(), `"auth_version":2`) {
		t.Fatalf("upgrade = %d %s, want 200 with auth_version 2", w.Code, w.Body.String())
	}

	var mek, mekRec string
	var rv int
	testDB.QueryRow(`SELECT encrypted_mek, encrypted_mek_recovery, recovery_version FROM users WHERE id = $1`, u.ID).Scan(&mek, &mekRec, &rv)
	if mek != "mek-under-vault-kek" || mekRec != "mek-under-recovery-kek" || rv != 2 {
		t.Errorf("stored: mek %q, recovery %q v%d", mek, mekRec, rv)
	}
	// The password itself no longer signs in; its auth key does.
	if w := post(t, HandleLogin(deps), context.Background(), `{"email":"old@example.ch","password":"old-pass-1"}`); w.Code != http.StatusUnauthorized {
		t.Errorf("the old password after upgrading = %d, want 401", w.Code)
	}
	if w := post(t, HandleLogin(deps), context.Background(), `{"email":"old@example.ch","auth_key":"`+newKey+`"}`); w.Code != http.StatusOK {
		t.Errorf("the auth key after upgrading = %d, want 200", w.Code)
	}
	if !strings.Contains(post(t, HandleUpgrade(deps), ContextWithUser(context.Background(), mustUser(t, deps.Store, u.ID)), `{"auth_key":"`+newKey+`"}`).Body.String(), "AUTH-060") {
		t.Error("a second upgrade was not refused as nothing to upgrade")
	}
	var logged int
	testDB.QueryRow(`SELECT COUNT(*) FROM audit_log WHERE event = 'credentials_upgraded'`).Scan(&logged)
	if logged != 1 {
		t.Errorf("credentials_upgraded audit rows = %d, want 1", logged)
	}
}

func TestUpgrade_AnAccountWithoutAVaultMovesItsPasswordOnly(t *testing.T) {
	deps := loginDeps(t)
	u := legacyAccount(t, deps.Store, "admin-old@example.ch", false)
	w := post(t, HandleUpgrade(deps), ContextWithUser(context.Background(), u), `{"password":"old-pass-1","new_auth_key":"`+newKey+`"}`)
	if w.Code != http.StatusOK {
		t.Errorf("no vault = %d %s, want 200", w.Code, w.Body.String())
	}
}

func TestUpgrade_ARecoveryKeyLeftAtVersion1IsRenewedAlone(t *testing.T) {
	// An account whose password became version 2 by a change or a reset, with
	// its recovery key still the one the server received raw.
	deps := loginDeps(t)
	u := legacyAccount(t, deps.Store, "half@example.ch", true)
	testDB.Exec(`UPDATE users SET auth_version = 2, password_hash = $2 WHERE id = $1`, u.ID, mustHash(newKey))
	u = mustUser(t, deps.Store, u.ID)

	w := post(t, HandleUpgrade(deps), ContextWithUser(context.Background(), u),
		`{"auth_key":"`+newKey+`","recovery_auth":"`+recAuth+`","encrypted_mek_recovery":"mek-under-recovery-kek"}`)
	if w.Code != http.StatusOK {
		t.Fatalf("recovery only = %d %s, want 200", w.Code, w.Body.String())
	}
	var mek string
	var rv int
	testDB.QueryRow(`SELECT encrypted_mek, recovery_version FROM users WHERE id = $1`, u.ID).Scan(&mek, &rv)
	if mek != "mek-under-password" || rv != 2 {
		t.Errorf("mek %q (should be untouched), recovery v%d", mek, rv)
	}
}

func TestStoreUpgrade_TwoTabsCannotBothWrite(t *testing.T) {
	deps := loginDeps(t)
	u := legacyAccount(t, deps.Store, "old@example.ch", false)
	ctx := context.Background()
	if err := deps.Store.Upgrade(ctx, u.ID, 1, mustHash(newKey), "", "", ""); err != nil {
		t.Fatal(err)
	}
	if err := deps.Store.Upgrade(ctx, u.ID, 1, mustHash(newKey2), "", "", ""); !errors.Is(err, ErrUpgradeRaced) {
		t.Errorf("second upgrade from version 1 = %v, want ErrUpgradeRaced", err)
	}
}

func mustUser(t *testing.T, store *Store, id int) *User {
	t.Helper()
	u, err := store.GetUserByID(context.Background(), id)
	if err != nil || u == nil {
		t.Fatal(err)
	}
	return u
}

// renewalAccount is a version 2 account with everything renewal touches: a
// vault, a keypair, and one household key held as 'self'.
func renewalAccount(t *testing.T, deps *HandlerDeps) (*User, int, time.Time, string) {
	t.Helper()
	u, err := deps.Store.CreateUserFull(context.Background(), "renew@example.ch", mustHash(newKey), RoleUser, false, true)
	if err != nil {
		t.Fatal(err)
	}
	testDB.Exec(`UPDATE users SET encrypted_mek = 'old-mek', recovery_key_hash = 'x', encrypted_mek_recovery = 'old-rec', recovery_version = 2,
	             public_key = 'pub', encrypted_private_key = 'old-priv', verifying_key = 'ver', encrypted_signing_key = 'old-sign' WHERE id = $1`, u.ID)
	var at time.Time
	testDB.QueryRow(`INSERT INTO user_vaults (user_id, ciphertext, nonce, version) VALUES ($1, 'old', 'n', 11) RETURNING updated_at`, u.ID).Scan(&at)
	var hh int
	testDB.QueryRow(`INSERT INTO shared_vaults (encrypted_name, ciphertext, nonce) VALUES ('n', 'c', 'n') RETURNING id`).Scan(&hh)
	testDB.Exec(`INSERT INTO shared_vault_members (vault_id, user_id, wrapped_key, wrap_kind, role) VALUES ($1, $2, 'old-hk', 'self', 'owner')`, hh, u.ID)
	sess, err := deps.Store.CreateSession(context.Background(), u.ID)
	if err != nil {
		t.Fatal(err)
	}
	return mustUser(t, deps.Store, u.ID), hh, at, sess.Token
}

func renewBody(households string, at time.Time) string {
	return `{"auth_key":"` + newKey + `","new_auth_key":"` + newKey2 + `","encrypted_mek":"new-mek",
	  "recovery_auth":"` + recAuth + `","encrypted_mek_recovery":"new-rec",
	  "encrypted_private_key":"new-priv","encrypted_signing_key":"new-sign",
	  "vault":{"ciphertext":"bmV3","nonce":"bm4=","version":11,"expected_updated_at":"` + at.Format(time.RFC3339Nano) + `"},
	  "households":` + households + `}`
}

func renewAs(t *testing.T, deps *HandlerDeps, u *User, token, body string) *httptest.ResponseRecorder {
	t.Helper()
	req := httptest.NewRequest(http.MethodPost, "/api/auth/renew-keys", strings.NewReader(body)).WithContext(ContextWithUser(context.Background(), u))
	req.AddCookie(&http.Cookie{Name: "session", Value: token})
	w := httptest.NewRecorder()
	HandleRenewKeys(deps).ServeHTTP(w, req)
	return w
}

func TestRenewKeys_ReplacesEverythingSealedUnderTheOldKey(t *testing.T) {
	deps := loginDeps(t)
	u, hh, at, token := renewalAccount(t, deps)
	other, _ := deps.Store.CreateSession(context.Background(), u.ID)

	w := renewAs(t, deps, u, token, renewBody(`[{"id":`+strconv.Itoa(hh)+`,"wrapped_key":"new-hk"}]`, at))
	if w.Code != http.StatusOK {
		t.Fatalf("renew = %d %s", w.Code, w.Body.String())
	}

	var mek, rec, priv, sign, ct, hk string
	testDB.QueryRow(`SELECT encrypted_mek, encrypted_mek_recovery, encrypted_private_key, encrypted_signing_key FROM users WHERE id = $1`, u.ID).Scan(&mek, &rec, &priv, &sign)
	testDB.QueryRow(`SELECT convert_from(ciphertext, 'UTF8') FROM user_vaults WHERE user_id = $1`, u.ID).Scan(&ct)
	testDB.QueryRow(`SELECT wrapped_key FROM shared_vault_members WHERE user_id = $1`, u.ID).Scan(&hk)
	if mek != "new-mek" || rec != "new-rec" || priv != "new-priv" || sign != "new-sign" || ct != "new" || hk != "new-hk" {
		t.Errorf("after renewal: mek %q rec %q priv %q sign %q vault %q household %q", mek, rec, priv, sign, ct, hk)
	}
	if !stillSignedIn(t, deps.Store, token) {
		t.Error("the renewing device was signed out")
	}
	if stillSignedIn(t, deps.Store, other.Token) {
		t.Error("another device, holding the old vault key, stayed signed in")
	}
	if w := post(t, HandleLogin(deps), context.Background(), `{"email":"renew@example.ch","auth_key":"`+newKey2+`"}`); w.Code != http.StatusOK {
		t.Errorf("the new password = %d, want 200", w.Code)
	}
}

func TestRenewKeys_RefusedWhenTheAccountMovedUnderIt(t *testing.T) {
	for name, tc := range map[string]struct {
		households func(hh int) string
		staleVault bool
	}{
		"a household left out": {func(int) string { return `[]` }, false},
		"a household not held": {func(hh int) string {
			return `[{"id":` + strconv.Itoa(hh) + `,"wrapped_key":"a"},{"id":999999,"wrapped_key":"b"}]`
		}, false},
		"a vault saved meanwhile": {func(hh int) string { return `[{"id":` + strconv.Itoa(hh) + `,"wrapped_key":"a"}]` }, true},
	} {
		t.Run(name, func(t *testing.T) {
			deps := loginDeps(t)
			u, hh, at, token := renewalAccount(t, deps)
			if tc.staleVault {
				testDB.Exec(`UPDATE user_vaults SET updated_at = NOW() + INTERVAL '1 second' WHERE user_id = $1`, u.ID)
			}
			w := renewAs(t, deps, u, token, renewBody(tc.households(hh), at))
			if w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "AUTH-065") {
				t.Errorf("= %d %s, want 409 AUTH-065", w.Code, w.Body.String())
			}
			var mek string
			testDB.QueryRow(`SELECT encrypted_mek FROM users WHERE id = $1`, u.ID).Scan(&mek)
			if mek != "old-mek" {
				t.Error("a refused renewal changed the account")
			}
		})
	}
}

func TestRenewKeys_AVersion1AccountMigratesFirst(t *testing.T) {
	deps := loginDeps(t)
	u := legacyAccount(t, deps.Store, "old@example.ch", true)
	sess, _ := deps.Store.CreateSession(context.Background(), u.ID)
	if w := renewAs(t, deps, u, sess.Token, `{"password":"old-pass-1"}`); w.Code != http.StatusConflict || !strings.Contains(w.Body.String(), "AUTH-064") {
		t.Errorf("= %d %s, want 409 AUTH-064", w.Code, w.Body.String())
	}
}

// --- Change password ---

func changePassword(t *testing.T, deps *HandlerDeps, email, current, encryptedMEK string) int {
	t.Helper()
	body, _ := json.Marshal(map[string]string{
		"current_auth_key": current,
		"new_auth_key":     testAuthKey,
		"encrypted_mek":    encryptedMEK,
	})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/change-password", strings.NewReader(string(body)))
	req = req.WithContext(asUser(t, deps.Store, email))
	w := httptest.NewRecorder()
	HandleChangePassword(deps).ServeHTTP(w, req)
	return w.Code
}

func storedMEK(t *testing.T, email string) string {
	t.Helper()
	var mek string
	if err := testDB.QueryRow(`SELECT encrypted_mek FROM users WHERE email = $1`, email).Scan(&mek); err != nil {
		t.Fatalf("reading encrypted_mek: %v", err)
	}
	return mek
}

func TestChangePassword_TheVaultKeyMovesOnlyWithThePassword(t *testing.T) {
	// The report: a mistyped current password was refused, but the vault key
	// had already been re-wrapped under the new one, and the vault no longer
	// opened with the password the account still had.
	deps := loginDeps(t)
	if _, err := testDB.Exec(`UPDATE users SET encrypted_mek = 'wrapped-under-old' WHERE email = 'father@example.ch'`); err != nil {
		t.Fatalf("seeding encrypted_mek: %v", err)
	}

	if got := changePassword(t, deps, "father@example.ch", "wrong-pass", "wrapped-under-new"); got != http.StatusUnauthorized {
		t.Fatalf("wrong current password = %d, want 401", got)
	}
	if got := storedMEK(t, "father@example.ch"); got != "wrapped-under-old" {
		t.Fatalf("after a refused change the vault key is %q, want it untouched", got)
	}

	if got := changePassword(t, deps, "father@example.ch", "right-pass-1", "wrapped-under-new"); got != http.StatusOK {
		t.Fatalf("right current password = %d, want 200", got)
	}
	if got := storedMEK(t, "father@example.ch"); got != "wrapped-under-new" {
		t.Errorf("after the change the vault key is %q, want the new wrap", got)
	}
}

func TestChangePassword_WithoutAVaultKeyLeavesTheStoredOneAlone(t *testing.T) {
	// An account changing a first password before it has a vault sends none.
	deps := loginDeps(t)
	if _, err := testDB.Exec(`UPDATE users SET encrypted_mek = 'kept' WHERE email = 'father@example.ch'`); err != nil {
		t.Fatalf("seeding encrypted_mek: %v", err)
	}

	if got := changePassword(t, deps, "father@example.ch", "right-pass-1", ""); got != http.StatusOK {
		t.Fatalf("change = %d, want 200", got)
	}
	if got := storedMEK(t, "father@example.ch"); got != "kept" {
		t.Errorf("vault key = %q, want it kept", got)
	}
}

// --- Deleting an account anonymises its audit entries ---

func TestDeleteUser_TheAuditLogNoLongerNamesTheAccount(t *testing.T) {
	// The promise in readmore/security.md, which only the foreign key kept:
	// user_id went to NULL, while the metadata still named the address.
	deps := loginDeps(t)
	store := deps.Store
	ctx := context.Background()
	gone, _ := store.GetUserByEmail(ctx, "father@example.ch")
	admin, _ := store.GetUserByEmail(ctx, "admin@example.ch")
	req := httptest.NewRequest(http.MethodPost, "/", nil)

	store.LogAudit(ctx, &gone.ID, AuditLoginFailed, req, map[string]any{"email": "Father@Example.ch"})
	store.LogAudit(ctx, &admin.ID, AuditUserInvited, req, map[string]any{"invited_user_id": gone.ID, "invited_email": "father@example.ch", "method": "email"})
	store.LogAudit(ctx, &admin.ID, AuditPasswordReset, req, map[string]any{"target_user_id": gone.ID, "target_email": "father@example.ch"})
	// Somebody else's entry stays as it was.
	store.LogAudit(ctx, &admin.ID, AuditPasswordReset, req, map[string]any{"target_user_id": admin.ID + 100, "target_email": "other@example.ch"})

	if err := store.DeleteUserGuardingLastAdmin(ctx, gone.ID); err != nil {
		t.Fatalf("DeleteUserGuardingLastAdmin: %v", err)
	}

	var named int
	if err := testDB.QueryRow(`SELECT count(*) FROM audit_log WHERE metadata::text ILIKE '%father@example.ch%' OR metadata->>'invited_user_id' = $1 OR metadata->>'target_user_id' = $1`,
		strconv.Itoa(gone.ID)).Scan(&named); err != nil {
		t.Fatalf("counting: %v", err)
	}
	if named != 0 {
		t.Errorf("%d audit entries still name the deleted account", named)
	}
	var events, others int
	testDB.QueryRow(`SELECT count(*) FROM audit_log`).Scan(&events)
	testDB.QueryRow(`SELECT count(*) FROM audit_log WHERE metadata->>'target_email' = 'other@example.ch'`).Scan(&others)
	if events != 4 || others != 1 {
		t.Errorf("events = %d, others = %d; want every event kept and the other account's untouched", events, others)
	}
}

// --- An administrator removes a user's second factor ---

func TestAdminRemove2FA_TheUserSignsInWithThePasswordAgain(t *testing.T) {
	// A factor somebody else enrolled, or one the user lost: the way back was
	// SQL on the server. Now an admin can take it away, and with it every
	// session, since whoever enrolled it may still hold one.
	deps := loginDeps(t)
	store := deps.Store
	ctx := context.Background()
	father, _ := store.GetUserByEmail(ctx, "father@example.ch")
	session := signIn(t, deps, "father@example.ch")
	if err := store.SetTOTPEnabled(ctx, father.ID, true); err != nil {
		t.Fatalf("SetTOTPEnabled: %v", err)
	}
	if err := store.SaveTOTPSecret(ctx, father.ID, "sealed"); err != nil {
		t.Fatalf("SaveTOTPSecret: %v", err)
	}

	root, err := store.CreateUserFull(ctx, "root@example.ch", mustHash("right-pass-1"), RoleAdmin, true, true)
	if err != nil {
		t.Fatalf("CreateUserFull: %v", err)
	}
	remove := func(target int) int {
		r := chi.NewRouter()
		r.Delete("/api/auth/users/{id}/2fa", HandleAdminRemove2FA(deps))
		req := httptest.NewRequest(http.MethodDelete, "/api/auth/users/"+strconv.Itoa(target)+"/2fa", nil)
		req = req.WithContext(context.WithValue(req.Context(), userContextKey, root))
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	if got := remove(father.ID); got != http.StatusOK {
		t.Fatalf("remove = %d, want 200", got)
	}
	after, _ := store.GetUserByID(ctx, father.ID)
	if after.TOTPEnabled {
		t.Error("2FA is still enabled")
	}
	if stillSignedIn(t, store, session) {
		t.Error("the user's session survived")
	}
	if got := remove(father.ID); got != http.StatusConflict {
		t.Errorf("removing it twice = %d, want 409", got)
	}
	if got := remove(root.ID); got != http.StatusConflict {
		t.Errorf("an administrator's = %d, want 409", got)
	}
}

// --- The instance's 2FA requirement is held on the server ---

func TestRequireEnrolment_APasswordAloneReachesOnlyEnrolment(t *testing.T) {
	// The report: with require_2fa on, a password-only sign-in got a full
	// session, and only the browser's screen asked for a second factor.
	deps := loginDeps(t)
	deps.EncryptionKey = make([]byte, 32)
	store := deps.Store
	ctx := context.Background()
	if err := store.SetSetting(ctx, "require_2fa", "true"); err != nil {
		t.Fatalf("SetSetting: %v", err)
	}
	session := signIn(t, deps, "father@example.ch")

	r := chi.NewRouter()
	r.Route("/api", func(r chi.Router) {
		r.Use(RequireAuth(store), RequireEnrolment(deps))
		ok := func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }
		r.Get("/auth/me", ok)
		r.Post("/auth/2fa/setup", ok)
		r.Post("/auth/change-password", ok)
		r.Get("/vault", ok)
		r.Get("/households", ok)
	})
	call := func(method, path string) int {
		req := httptest.NewRequest(method, path, nil)
		req.AddCookie(&http.Cookie{Name: "session", Value: session})
		w := httptest.NewRecorder()
		r.ServeHTTP(w, req)
		return w.Code
	}

	for _, c := range []struct {
		method, path string
		want         int
	}{
		{"GET", "/api/auth/me", 200},
		{"POST", "/api/auth/2fa/setup", 200},
		{"GET", "/api/vault", 403},
		{"GET", "/api/households", 403},
		// Only for a password the user was told to change.
		{"POST", "/api/auth/change-password", 403},
	} {
		if got := call(c.method, c.path); got != c.want {
			t.Errorf("%s %s = %d, want %d", c.method, c.path, got, c.want)
		}
	}

	// Enrolled, everything opens; and with the setting off, nothing was held.
	father, _ := store.GetUserByEmail(ctx, "father@example.ch")
	store.SetTOTPEnabled(ctx, father.ID, true)
	if got := call("GET", "/api/vault"); got != 200 {
		t.Errorf("enrolled: GET /api/vault = %d, want 200", got)
	}
	store.SetTOTPEnabled(ctx, father.ID, false)
	store.SetSetting(ctx, "require_2fa", "false")
	if got := call("GET", "/api/vault"); got != 200 {
		t.Errorf("not required: GET /api/vault = %d, want 200", got)
	}
}

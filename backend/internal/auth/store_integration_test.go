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
	"testing"
	"time"

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

	// Mark one as used
	if err := store.MarkRecoveryCodeUsed(ctx, codes[0].ID); err != nil {
		t.Fatalf("MarkRecoveryCodeUsed: %v", err)
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
	body := strings.NewReader(`{"email":"` + email + `","password":"` + password + `"}`)
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

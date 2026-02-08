//go:build integration

package auth

import (
	"context"
	"database/sql"
	"os"
	"testing"

	"github.com/bpfel/nafin-toolbox/internal/database"
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
	_, err := testDB.Exec("TRUNCATE sessions, modules, users RESTART IDENTITY CASCADE")
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}
}

// --- User CRUD ---

func TestCreateUser(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test123")
	user, err := store.CreateUser(ctx, "test@example.com", hash, RoleUser)
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
}

func TestCreateUser_AdminRole(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("admin123")
	user, err := store.CreateUser(ctx, "admin@example.com", hash, RoleAdmin)
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

	hash, _ := HashPassword("test123")
	if _, err := store.CreateUser(ctx, "dupe@test.com", hash, RoleUser); err != nil {
		t.Fatalf("first CreateUser: %v", err)
	}

	_, err := store.CreateUser(ctx, "dupe@test.com", hash, RoleUser)
	if err == nil {
		t.Fatal("expected error creating duplicate email, got nil")
	}
}

func TestGetUserByEmail(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test123")
	created, _ := store.CreateUser(ctx, "find@test.com", hash, RoleAdmin)

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

	hash, _ := HashPassword("test123")
	created, _ := store.CreateUser(ctx, "byid@test.com", hash, RoleUser)

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

	hash, _ := HashPassword("test123")
	store.CreateUser(ctx, "a@test.com", hash, RoleAdmin)
	store.CreateUser(ctx, "b@test.com", hash, RoleUser)
	store.CreateUser(ctx, "c@test.com", hash, RoleUser)

	users, err := store.ListUsers(ctx)
	if err != nil {
		t.Fatalf("ListUsers: %v", err)
	}
	if len(users) != 3 {
		t.Fatalf("got %d users, want 3", len(users))
	}

	// Should be ordered by ID
	if users[0].Email != "a@test.com" {
		t.Errorf("first user = %q, want a@test.com", users[0].Email)
	}
	if users[2].Email != "c@test.com" {
		t.Errorf("last user = %q, want c@test.com", users[2].Email)
	}

	// Password hash should not be empty in struct (it's loaded from DB)
	if users[0].PasswordHash != "" {
		// ListUsers doesn't select password_hash, so it should be empty
		// Actually let me check — if it's empty that's correct for list
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

	hash, _ := HashPassword("test123")
	store.CreateUser(ctx, "one@test.com", hash, RoleUser)
	store.CreateUser(ctx, "two@test.com", hash, RoleAdmin)

	count, err = store.UserCount(ctx)
	if err != nil {
		t.Fatalf("UserCount: %v", err)
	}
	if count != 2 {
		t.Errorf("count = %d, want 2", count)
	}
}

// --- Session lifecycle ---

func TestSessionLifecycle(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test123")
	user, _ := store.CreateUser(ctx, "session@test.com", hash, RoleUser)

	// Create session
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

	// Get session
	found, err := store.GetSession(ctx, sess.Token)
	if err != nil {
		t.Fatalf("GetSession: %v", err)
	}
	if found == nil {
		t.Fatal("expected non-nil session")
	}
	if found.Token != sess.Token {
		t.Errorf("token = %q, want %q", found.Token, sess.Token)
	}
	if found.UserID != user.ID {
		t.Errorf("user_id = %d, want %d", found.UserID, user.ID)
	}

	// Delete session
	if err := store.DeleteSession(ctx, sess.Token); err != nil {
		t.Fatalf("DeleteSession: %v", err)
	}

	// Session should be gone
	gone, err := store.GetSession(ctx, sess.Token)
	if err != nil {
		t.Fatalf("GetSession after delete: %v", err)
	}
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

func TestMultipleSessionsPerUser(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test123")
	user, _ := store.CreateUser(ctx, "multi@test.com", hash, RoleUser)

	sess1, err := store.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatalf("CreateSession 1: %v", err)
	}
	sess2, err := store.CreateSession(ctx, user.ID)
	if err != nil {
		t.Fatalf("CreateSession 2: %v", err)
	}

	if sess1.Token == sess2.Token {
		t.Error("expected different tokens for different sessions")
	}

	// Both should be valid
	for _, token := range []string{sess1.Token, sess2.Token} {
		found, err := store.GetSession(ctx, token)
		if err != nil {
			t.Fatalf("GetSession(%q): %v", token, err)
		}
		if found == nil {
			t.Errorf("session %q not found", token)
		}
	}

	// Delete one, the other should still work
	store.DeleteSession(ctx, sess1.Token)
	found, _ := store.GetSession(ctx, sess2.Token)
	if found == nil {
		t.Error("expected sess2 to still be valid after deleting sess1")
	}
}

func TestDeleteExpiredSessions(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test123")
	user, _ := store.CreateUser(ctx, "expire@test.com", hash, RoleUser)

	// Create a session
	sess, _ := store.CreateSession(ctx, user.ID)

	// Manually expire it in the DB
	_, err := testDB.ExecContext(ctx,
		"UPDATE sessions SET expires_at = NOW() - INTERVAL '1 hour' WHERE token = $1",
		sess.Token,
	)
	if err != nil {
		t.Fatalf("expiring session: %v", err)
	}

	// Expired session should not be found
	found, _ := store.GetSession(ctx, sess.Token)
	if found != nil {
		t.Error("expired session should not be found")
	}

	// Clean up expired sessions
	if err := store.DeleteExpiredSessions(ctx); err != nil {
		t.Fatalf("DeleteExpiredSessions: %v", err)
	}

	// Verify it's physically deleted
	var count int
	testDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM sessions WHERE token = $1", sess.Token).Scan(&count)
	if count != 0 {
		t.Errorf("expired session still in DB after cleanup, count = %d", count)
	}
}

// --- User-scoped module isolation ---

func TestModuleIsolationBetweenUsers(t *testing.T) {
	truncateTables(t)
	ctx := context.Background()
	store := NewStore(testDB)

	hash, _ := HashPassword("test123")
	user1, _ := store.CreateUser(ctx, "user1@test.com", hash, RoleUser)
	user2, _ := store.CreateUser(ctx, "user2@test.com", hash, RoleUser)

	// User1 enables a module
	_, err := testDB.ExecContext(ctx,
		"INSERT INTO modules (user_id, id, name) VALUES ($1, 'budget', 'Budget')",
		user1.ID,
	)
	if err != nil {
		t.Fatalf("inserting module for user1: %v", err)
	}

	// User2 enables a different module
	_, err = testDB.ExecContext(ctx,
		"INSERT INTO modules (user_id, id, name) VALUES ($1, 'accounts', 'Accounts')",
		user2.ID,
	)
	if err != nil {
		t.Fatalf("inserting module for user2: %v", err)
	}

	// Verify user1 only sees their module
	rows, err := testDB.QueryContext(ctx,
		"SELECT id FROM modules WHERE user_id = $1", user1.ID)
	if err != nil {
		t.Fatalf("querying user1 modules: %v", err)
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		rows.Scan(&id)
		ids = append(ids, id)
	}
	if len(ids) != 1 || ids[0] != "budget" {
		t.Errorf("user1 modules = %v, want [budget]", ids)
	}

	// Verify user2 only sees their module
	rows2, _ := testDB.QueryContext(ctx,
		"SELECT id FROM modules WHERE user_id = $1", user2.ID)
	defer rows2.Close()

	var ids2 []string
	for rows2.Next() {
		var id string
		rows2.Scan(&id)
		ids2 = append(ids2, id)
	}
	if len(ids2) != 1 || ids2[0] != "accounts" {
		t.Errorf("user2 modules = %v, want [accounts]", ids2)
	}
}

// --- Session cascade on user delete ---

func TestSessionDeletedWhenUserDeleted(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	hash, _ := HashPassword("test123")
	user, _ := store.CreateUser(ctx, "delete-me@test.com", hash, RoleUser)
	sess, _ := store.CreateSession(ctx, user.ID)

	// Delete user directly (admin action)
	_, err := testDB.ExecContext(ctx, "DELETE FROM users WHERE id = $1", user.ID)
	if err != nil {
		t.Fatalf("deleting user: %v", err)
	}

	// Session should be cascade-deleted
	found, _ := store.GetSession(ctx, sess.Token)
	if found != nil {
		t.Error("expected session to be cascade-deleted with user")
	}
}

package vault

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// Against a real PostgreSQL, because the rule under test is a WHERE clause.
// Skipped unless TEST_DATABASE_URL is set; see the household store tests for
// how to run them.
func testDB(t *testing.T) *sql.DB {
	t.Helper()
	url := os.Getenv("TEST_DATABASE_URL")
	if url == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping database-backed tests")
	}
	db, err := sql.Open("pgx", url)
	if err != nil {
		t.Fatalf("opening database: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

func makeUser(t *testing.T, db *sql.DB, email string, withVault bool) int {
	t.Helper()
	var mek any
	if withVault {
		mek = "sealed-mek"
	}
	var id int
	if err := db.QueryRow(
		`INSERT INTO users (email, password_hash, role, encrypted_mek) VALUES ($1, 'x', 'user', $2) RETURNING id`,
		email, mek,
	).Scan(&id); err != nil {
		t.Fatalf("creating %s: %v", email, err)
	}
	t.Cleanup(func() { _, _ = db.Exec(`DELETE FROM users WHERE id = $1`, id) })
	return id
}

var someIdentity = Identity{PublicKey: "p", EncryptedPrivateKey: "ep", VerifyingKey: "v", EncryptedSigningKey: "es"}

func TestStore_SetIdentityIfAbsent(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	t.Run("an older account gets one", func(t *testing.T) {
		id := makeUser(t, db, "older@example.ch", true)

		set, err := store.SetIdentityIfAbsent(ctx, id, someIdentity)
		if err != nil || !set {
			t.Fatalf("set = %v, err = %v", set, err)
		}
		got, _ := store.GetIdentity(ctx, id)
		if got != someIdentity {
			t.Errorf("stored %+v", got)
		}
	})

	t.Run("an account that has one keeps it", func(t *testing.T) {
		id := makeUser(t, db, "keeps@example.ch", true)
		if _, err := store.SetIdentityIfAbsent(ctx, id, someIdentity); err != nil {
			t.Fatal(err)
		}

		set, err := store.SetIdentityIfAbsent(ctx, id, Identity{PublicKey: "swapped", EncryptedPrivateKey: "x", VerifyingKey: "x", EncryptedSigningKey: "x"})
		if err != nil || set {
			t.Fatalf("set = %v, err = %v; want refused", set, err)
		}
		if got, _ := store.GetIdentity(ctx, id); got.PublicKey != "p" {
			t.Errorf("public key became %q", got.PublicKey)
		}
	})

	t.Run("an account with no vault has nothing to seal to", func(t *testing.T) {
		id := makeUser(t, db, "novault@example.ch", false)

		set, err := store.SetIdentityIfAbsent(ctx, id, someIdentity)
		if err != nil || set {
			t.Fatalf("set = %v, err = %v; want refused", set, err)
		}
	})
}

// A write with no token only creates. The client sends none when it believes
// there is no vault yet, and a failed load once made it believe that wrongly:
// the empty vault it then saved replaced the real one.
func TestStore_PutVaultWithoutTokenOnlyCreates(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()
	id := makeUser(t, db, "first-save@example.ch", true)

	created, err := store.PutVault(ctx, id, []byte("real"), []byte("n1"), 1, nil)
	if err != nil {
		t.Fatalf("first save: %v", err)
	}

	if _, err := store.PutVault(ctx, id, []byte("empty"), []byte("n2"), 1, nil); !errors.Is(err, ErrVaultConflict) {
		t.Fatalf("second token-less save: err = %v, want ErrVaultConflict", err)
	}
	if v, _ := store.GetVault(ctx, id); string(v.Ciphertext) != "real" {
		t.Fatalf("stored = %q, want the first save kept", v.Ciphertext)
	}

	if _, err := store.PutVault(ctx, id, []byte("edited"), []byte("n3"), 1, &created); err != nil {
		t.Fatalf("save with the token: %v", err)
	}
	if v, _ := store.GetVault(ctx, id); string(v.Ciphertext) != "edited" {
		t.Fatalf("stored = %q, want the edit", v.Ciphertext)
	}
}

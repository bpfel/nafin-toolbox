package household

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
)

// These run against a real PostgreSQL, because what they are checking lives in
// SQL rather than in Go.
//
// Every one of the store's methods takes the asking user's id and folds the
// membership test into the statement itself. A mock cannot tell you whether that
// test is written correctly — it can only tell you the handler called a method.
// Getting the join wrong would compile, pass every mocked test, and hand one
// household's contents to a stranger.
//
// Skipped unless TEST_DATABASE_URL is set, so the ordinary `go test ./...` stays
// offline:
//
//	docker compose -p nafin-shared exec -T db true   # a database is up
//	TEST_DATABASE_URL=postgres://finance:finance@localhost:5434/finance?sslmode=disable \
//	  go test ./internal/household/ -run TestStore -v
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
	if err := db.Ping(); err != nil {
		t.Fatalf("pinging database: %v", err)
	}
	t.Cleanup(func() { db.Close() })
	return db
}

// makeUser creates a throwaway user and removes it, and everything cascading
// from it, when the test ends.
func makeUser(t *testing.T, db *sql.DB, email string) int {
	t.Helper()
	var id int
	err := db.QueryRow(
		`INSERT INTO users (email, password_hash, role) VALUES ($1, 'x', 'user') RETURNING id`,
		email,
	).Scan(&id)
	if err != nil {
		t.Fatalf("creating user %s: %v", email, err)
	}
	t.Cleanup(func() {
		_, _ = db.Exec(`DELETE FROM users WHERE id = $1`, id)
	})
	return id
}

func aCreateRequest() CreateRequest {
	return CreateRequest{
		EncryptedName: "sealed-name",
		WrappedKey:    "sealed-key",
		Version:       9,
	}
}

func TestStore_CreateAndList(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-create@example.ch")

	id, updatedAt, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("nonce"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if id == 0 {
		t.Error("Create returned id 0")
	}
	if updatedAt.IsZero() {
		t.Error("Create returned a zero updated_at")
	}

	got, err := store.ListForUser(ctx, anna)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if len(got) != 1 {
		t.Fatalf("got %d households, want 1", len(got))
	}
	if got[0].EncryptedName != "sealed-name" || got[0].WrappedKey != "sealed-key" {
		t.Errorf("household came back as %+v", got[0])
	}
	// The creator owns it, and holds their copy sealed under their own MEK.
	if !got[0].IsOwner {
		t.Error("creator is not marked as owner")
	}
	if got[0].WrapKind != WrapSelf {
		t.Errorf("wrap_kind = %q, want %q", got[0].WrapKind, WrapSelf)
	}
}

// The whole point of the feature, stated as a test: someone else's household is
// not visible, not readable, and not writable.
func TestStore_AStrangerSeesNothing(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-private@example.ch")
	ben := makeUser(t, db, "ben-stranger@example.ch")

	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("nonce"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	t.Run("not in their list", func(t *testing.T) {
		got, err := store.ListForUser(ctx, ben)
		if err != nil {
			t.Fatalf("ListForUser: %v", err)
		}
		if len(got) != 0 {
			t.Errorf("stranger sees %d households, want 0", len(got))
		}
	})

	t.Run("cannot read it", func(t *testing.T) {
		if _, err := store.GetVault(ctx, id, ben); err != ErrNotMember {
			t.Errorf("GetVault err = %v, want ErrNotMember", err)
		}
	})

	t.Run("cannot write it", func(t *testing.T) {
		if _, err := store.PutVault(ctx, id, ben, []byte("theirs"), []byte("n"), 9, nil); err != ErrNotMember {
			t.Errorf("PutVault err = %v, want ErrNotMember", err)
		}
		// And nothing was written.
		v, err := store.GetVault(ctx, id, anna)
		if err != nil {
			t.Fatalf("GetVault as owner: %v", err)
		}
		if string(v.Ciphertext) != "ct" {
			t.Errorf("ciphertext = %q, want it untouched", v.Ciphertext)
		}
	})

	t.Run("cannot rename it", func(t *testing.T) {
		if err := store.Rename(ctx, id, ben, "theirs"); err != ErrNotMember {
			t.Errorf("Rename err = %v, want ErrNotMember", err)
		}
	})

	t.Run("cannot delete it", func(t *testing.T) {
		if err := store.Delete(ctx, id, ben); err != ErrNotMember {
			t.Errorf("Delete err = %v, want ErrNotMember", err)
		}
	})

	t.Run("membership says no", func(t *testing.T) {
		if _, err := store.Membership(ctx, id, ben); err != ErrNotMember {
			t.Errorf("Membership err = %v, want ErrNotMember", err)
		}
	})
}

// A household id that does not exist answers exactly as one belonging to
// somebody else does, so the difference cannot be probed for.
func TestStore_MissingHouseholdLooksLikeSomebodyElses(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-missing@example.ch")

	if _, err := store.GetVault(ctx, 2147483000, anna); err != ErrNotMember {
		t.Errorf("GetVault on a missing household = %v, want ErrNotMember", err)
	}
}

func TestStore_PutVaultRoundTrips(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-put@example.ch")
	id, createdAt, err := store.Create(ctx, anna, aCreateRequest(), []byte("first"), []byte("n1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	updatedAt, err := store.PutVault(ctx, id, anna, []byte("second"), []byte("n2"), 9, &createdAt)
	if err != nil {
		t.Fatalf("PutVault: %v", err)
	}
	if !updatedAt.After(createdAt) {
		t.Errorf("updated_at %v did not advance past %v", updatedAt, createdAt)
	}

	v, err := store.GetVault(ctx, id, anna)
	if err != nil {
		t.Fatalf("GetVault: %v", err)
	}
	if string(v.Ciphertext) != "second" || string(v.Nonce) != "n2" {
		t.Errorf("read back %q/%q, want second/n2", v.Ciphertext, v.Nonce)
	}
}

// Two members editing one plan is the ordinary case rather than the unlucky
// one, so the precondition has to hold.
func TestStore_PutVaultRefusesAStaleWrite(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-stale@example.ch")
	id, createdAt, err := store.Create(ctx, anna, aCreateRequest(), []byte("first"), []byte("n1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	// Somebody writes.
	if _, err := store.PutVault(ctx, id, anna, []byte("theirs"), []byte("n2"), 9, &createdAt); err != nil {
		t.Fatalf("first PutVault: %v", err)
	}

	// The other tab, still holding the timestamp from before that write.
	if _, err := store.PutVault(ctx, id, anna, []byte("mine"), []byte("n3"), 9, &createdAt); err != ErrConflict {
		t.Fatalf("stale PutVault err = %v, want ErrConflict", err)
	}

	v, err := store.GetVault(ctx, id, anna)
	if err != nil {
		t.Fatalf("GetVault: %v", err)
	}
	if string(v.Ciphertext) != "theirs" {
		t.Errorf("ciphertext = %q, want the newer write to have survived", v.Ciphertext)
	}
}

// No precondition means "there is nothing to conflict with", which is the first
// save after creation.
func TestStore_PutVaultWithoutPreconditionOverwrites(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-uncond@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("first"), []byte("n1"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if _, err := store.PutVault(ctx, id, anna, []byte("second"), []byte("n2"), 9, nil); err != nil {
		t.Fatalf("PutVault: %v", err)
	}
}

func TestStore_Rename(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-rename@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := store.Rename(ctx, id, anna, "sealed-new-name"); err != nil {
		t.Fatalf("Rename: %v", err)
	}

	got, err := store.ListForUser(ctx, anna)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if got[0].EncryptedName != "sealed-new-name" {
		t.Errorf("encrypted_name = %q, want the new one", got[0].EncryptedName)
	}
}

func TestStore_DeleteTakesTheMembershipWithIt(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-delete@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	if err := store.Delete(ctx, id, anna); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	got, err := store.ListForUser(ctx, anna)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if len(got) != 0 {
		t.Errorf("got %d households after delete, want 0", len(got))
	}

	var members int
	if err := db.QueryRow(`SELECT COUNT(*) FROM shared_vault_members WHERE vault_id = $1`, id).Scan(&members); err != nil {
		t.Fatalf("counting members: %v", err)
	}
	if members != 0 {
		t.Errorf("%d membership rows survived the cascade", members)
	}
}

// The unique partial index, checked directly: a household must have exactly one
// owner, because one with none could never invite anybody again.
func TestStore_AHouseholdCannotHaveTwoOwners(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-owner@example.ch")
	ben := makeUser(t, db, "ben-owner@example.ch")

	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, err = db.ExecContext(ctx,
		`INSERT INTO shared_vault_members (vault_id, user_id, wrapped_key, wrap_kind, is_owner)
		 VALUES ($1, $2, 'k', $3, TRUE)`,
		id, ben, WrapGranted,
	)
	if err == nil {
		t.Fatal("a second owner was accepted")
	}
}

// A member who is not the owner may read, write and rename, but not delete.
// That is the entire role model.
func TestStore_AMemberMayEverythingButDelete(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-shared@example.ch")
	ben := makeUser(t, db, "ben-member@example.ch")

	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	// Ben joins. Invitations do not exist yet, so the row goes in directly —
	// which is exactly the shape one will produce.
	_, err = db.ExecContext(ctx,
		`INSERT INTO shared_vault_members (vault_id, user_id, wrapped_key, wrap_kind, is_owner)
		 VALUES ($1, $2, 'granted-key', $3, FALSE)`,
		id, ben, WrapGranted,
	)
	if err != nil {
		t.Fatalf("adding member: %v", err)
	}

	if _, err := store.GetVault(ctx, id, ben); err != nil {
		t.Errorf("member cannot read: %v", err)
	}
	if _, err := store.PutVault(ctx, id, ben, []byte("bens"), []byte("n"), 9, nil); err != nil {
		t.Errorf("member cannot write: %v", err)
	}
	if err := store.Rename(ctx, id, ben, "bens-name"); err != nil {
		t.Errorf("member cannot rename: %v", err)
	}
	if err := store.Delete(ctx, id, ben); err != ErrNotMember {
		t.Errorf("Delete by a non-owner = %v, want ErrNotMember", err)
	}

	// Ben's own copy of the key is his, and is not Anna's.
	bens, err := store.ListForUser(ctx, ben)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if len(bens) != 1 || bens[0].WrappedKey != "granted-key" || bens[0].IsOwner {
		t.Errorf("member's view of the household is %+v", bens)
	}
}

func TestStore_ListIsNewestFirst(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-order@example.ch")

	first := aCreateRequest()
	first.EncryptedName = "older"
	if _, _, err := store.Create(ctx, anna, first, []byte("ct"), []byte("n")); err != nil {
		t.Fatalf("Create: %v", err)
	}
	time.Sleep(5 * time.Millisecond)
	second := aCreateRequest()
	second.EncryptedName = "newer"
	if _, _, err := store.Create(ctx, anna, second, []byte("ct"), []byte("n")); err != nil {
		t.Fatalf("Create: %v", err)
	}

	got, err := store.ListForUser(ctx, anna)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if len(got) != 2 || got[0].EncryptedName != "newer" {
		t.Errorf("order = %v, want newer first", []string{got[0].EncryptedName, got[1].EncryptedName})
	}
}

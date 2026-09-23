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
//	docker compose -p nafin up -d db                 # a database is up
//	TEST_DATABASE_URL=postgres://finance:finance@localhost:5432/finance?sslmode=disable \
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

// A household nobody is in should not exist.
//
// Found the hard way: deleting a test account took its membership with it, via
// the cascade from users, and left the household behind — ciphertext nobody has
// a key to, which no screen can show and no query will ask for.
func TestStore_AHouseholdDiesWithItsLastMember(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	countVault := func(id int) int {
		t.Helper()
		var n int
		if err := db.QueryRow(`SELECT COUNT(*) FROM shared_vaults WHERE id = $1`, id).Scan(&n); err != nil {
			t.Fatalf("counting households: %v", err)
		}
		return n
	}

	t.Run("when the account is deleted", func(t *testing.T) {
		anna := makeUser(t, db, "anna-last@example.ch")
		id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
		if err != nil {
			t.Fatalf("Create: %v", err)
		}

		if _, err := db.Exec(`DELETE FROM users WHERE id = $1`, anna); err != nil {
			t.Fatalf("deleting user: %v", err)
		}
		if n := countVault(id); n != 0 {
			t.Errorf("%d households survived their only member", n)
		}
	})

	t.Run("when the last member leaves", func(t *testing.T) {
		anna := makeUser(t, db, "anna-leaves@example.ch")
		ben := makeUser(t, db, "ben-stays@example.ch")

		id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		if _, err := db.Exec(
			`INSERT INTO shared_vault_members (vault_id, user_id, wrapped_key, wrap_kind, is_owner)
			 VALUES ($1, $2, 'k', $3, FALSE)`, id, ben, WrapGranted); err != nil {
			t.Fatalf("adding member: %v", err)
		}

		// One of two leaving changes nothing.
		if _, err := db.Exec(`DELETE FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`, id, anna); err != nil {
			t.Fatalf("removing first member: %v", err)
		}
		if n := countVault(id); n != 1 {
			t.Fatalf("the household went away while a member remained")
		}

		// The second leaving takes it.
		if _, err := db.Exec(`DELETE FROM shared_vault_members WHERE vault_id = $1 AND user_id = $2`, id, ben); err != nil {
			t.Fatalf("removing last member: %v", err)
		}
		if n := countVault(id); n != 0 {
			t.Errorf("%d households survived their last member", n)
		}
	})

	// Deleting the household cascades to its members, which fires the trigger,
	// which deletes a household that is already gone. It must simply stop.
	t.Run("deleting the household outright does not recurse", func(t *testing.T) {
		anna := makeUser(t, db, "anna-recurse@example.ch")
		id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
		if err := store.Delete(ctx, id, anna); err != nil {
			t.Fatalf("Delete: %v", err)
		}
		if n := countVault(id); n != 0 {
			t.Errorf("%d households survived a direct delete", n)
		}
	})
}

// --- inviting somebody in ---
//
// Again against a real database, because again the rules are in SQL: who may
// invite, whose acceptance counts, and who may hand over a key.

func anInvite(email string) CreateInviteRequest {
	return CreateInviteRequest{
		TokenHash:    "hash-" + email,
		InvitedEmail: email,
		SecretSealed: "sealed-secret",
	}
}

func hour() time.Time { return time.Now().Add(time.Hour) }

// Adds a member directly, the shape a confirmed invitation produces.
func addMember(t *testing.T, db *sql.DB, vaultID, userID int) {
	t.Helper()
	if _, err := db.Exec(
		`INSERT INTO shared_vault_members (vault_id, user_id, wrapped_key, wrap_kind, is_owner)
		 VALUES ($1, $2, 'granted-key', $3, FALSE)`, vaultID, userID, WrapGranted); err != nil {
		t.Fatalf("adding member: %v", err)
	}
}

func TestStore_OnlyTheOwnerMayInvite(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-inv@example.ch")
	ben := makeUser(t, db, "ben-inv@example.ch")
	stranger := makeUser(t, db, "stranger-inv@example.ch")

	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	addMember(t, db, id, ben)

	if _, err := store.CreateInvite(ctx, id, anna, anInvite("new@example.ch"), hour()); err != nil {
		t.Errorf("owner cannot invite: %v", err)
	}
	// A member is not a stranger, and gets told so rather than told the
	// household does not exist.
	if _, err := store.CreateInvite(ctx, id, ben, anInvite("other@example.ch"), hour()); err != ErrNotOwner {
		t.Errorf("member inviting = %v, want ErrNotOwner", err)
	}
	if _, err := store.CreateInvite(ctx, id, stranger, anInvite("other@example.ch"), hour()); err != ErrNotMember {
		t.Errorf("stranger inviting = %v, want ErrNotMember", err)
	}
}

func TestStore_AcceptingAnInvitation(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-acc@example.ch")
	ben := makeUser(t, db, "ben-acc@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	t.Run("the addressee may", func(t *testing.T) {
		if _, err := store.CreateInvite(ctx, id, anna, anInvite("ben-acc@example.ch"), hour()); err != nil {
			t.Fatalf("CreateInvite: %v", err)
		}
		got, err := store.AcceptInvite(ctx, "hash-ben-acc@example.ch", ben, "BEN-ACC@example.ch", "the-mac")
		if err != nil {
			t.Fatalf("AcceptInvite: %v", err)
		}
		if got != id {
			t.Errorf("vault = %d, want %d", got, id)
		}
	})

	// Accepting grants nothing. Until somebody confirms, the invitee holds no
	// key and the household is not theirs.
	t.Run("but is still not a member", func(t *testing.T) {
		if _, err := store.GetVault(ctx, id, ben); err != ErrNotMember {
			t.Errorf("GetVault after accepting = %v, want ErrNotMember", err)
		}
	})

	t.Run("and cannot accept it twice", func(t *testing.T) {
		if _, err := store.AcceptInvite(ctx, "hash-ben-acc@example.ch", ben, "ben-acc@example.ch", "again"); err != ErrInviteInvalid {
			t.Errorf("second accept = %v, want ErrInviteInvalid", err)
		}
	})
}

// A leaked link still needs the mailbox it was addressed to.
func TestStore_AnInvitationIsAddressed(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-addr@example.ch")
	wrong := makeUser(t, db, "wrong@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := store.CreateInvite(ctx, id, anna, anInvite("intended@example.ch"), hour()); err != nil {
		t.Fatalf("CreateInvite: %v", err)
	}

	if _, err := store.AcceptInvite(ctx, "hash-intended@example.ch", wrong, "wrong@example.ch", "mac"); err != ErrInviteInvalid {
		t.Errorf("accepting somebody else's invitation = %v, want ErrInviteInvalid", err)
	}
}

func TestStore_AnExpiredInvitationIsNoInvitation(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-exp@example.ch")
	ben := makeUser(t, db, "ben-exp@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	past := time.Now().Add(-time.Minute)
	if _, err := store.CreateInvite(ctx, id, anna, anInvite("ben-exp@example.ch"), past); err != nil {
		t.Fatalf("CreateInvite: %v", err)
	}

	if _, err := store.AcceptInvite(ctx, "hash-ben-exp@example.ch", ben, "ben-exp@example.ch", "mac"); err != ErrInviteInvalid {
		t.Errorf("accepting an expired invitation = %v, want ErrInviteInvalid", err)
	}
	// And it is not listed either, so nobody is invited to confirm it.
	invites, err := store.ListInvites(ctx, id, anna)
	if err != nil {
		t.Fatalf("ListInvites: %v", err)
	}
	if len(invites) != 0 {
		t.Errorf("%d expired invitations listed, want 0", len(invites))
	}
}

func TestStore_ConfirmingWritesTheMembership(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-conf@example.ch")
	ben := makeUser(t, db, "ben-conf@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if _, err := store.CreateInvite(ctx, id, anna, anInvite("ben-conf@example.ch"), hour()); err != nil {
		t.Fatalf("CreateInvite: %v", err)
	}
	if _, err := store.AcceptInvite(ctx, "hash-ben-conf@example.ch", ben, "ben-conf@example.ch", "the-mac"); err != nil {
		t.Fatalf("AcceptInvite: %v", err)
	}

	invites, err := store.ListInvites(ctx, id, anna)
	if err != nil {
		t.Fatalf("ListInvites: %v", err)
	}
	if len(invites) != 1 || invites[0].PublicKeyMAC != "the-mac" {
		t.Fatalf("the inviter cannot see the MAC to check: %+v", invites)
	}

	if err := store.ConfirmInvite(ctx, id, anna, invites[0].ID, "signcrypted-key"); err != nil {
		t.Fatalf("ConfirmInvite: %v", err)
	}

	// Now, and only now, Ben can read it.
	if _, err := store.GetVault(ctx, id, ben); err != nil {
		t.Errorf("confirmed member cannot read: %v", err)
	}
	bens, err := store.ListForUser(ctx, ben)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if len(bens) != 1 || bens[0].WrappedKey != "signcrypted-key" || bens[0].WrapKind != WrapGranted || bens[0].IsOwner {
		t.Errorf("member's view is %+v", bens)
	}

	// The invitation is consumed, so it cannot grant a second key.
	after, err := store.ListInvites(ctx, id, anna)
	if err != nil {
		t.Fatalf("ListInvites: %v", err)
	}
	if len(after) != 0 {
		t.Errorf("%d invitations survived being confirmed", len(after))
	}
}

func TestStore_ConfirmingIsTheOwnersAlone(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-confown@example.ch")
	ben := makeUser(t, db, "ben-confown@example.ch")
	carl := makeUser(t, db, "carl-confown@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	addMember(t, db, id, ben)
	if _, err := store.CreateInvite(ctx, id, anna, anInvite("carl-confown@example.ch"), hour()); err != nil {
		t.Fatalf("CreateInvite: %v", err)
	}
	if _, err := store.AcceptInvite(ctx, "hash-carl-confown@example.ch", carl, "carl-confown@example.ch", "mac"); err != nil {
		t.Fatalf("AcceptInvite: %v", err)
	}
	invites, _ := store.ListInvites(ctx, id, anna)

	if err := store.ConfirmInvite(ctx, id, ben, invites[0].ID, "key"); err != ErrNotOwner {
		t.Errorf("member confirming = %v, want ErrNotOwner", err)
	}
	if _, err := store.GetVault(ctx, id, carl); err != ErrNotMember {
		t.Error("the invitee got in anyway")
	}
}

// Leaving is always unilateral; removing somebody else is the owner's alone.
func TestStore_RemovingAMember(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-rm@example.ch")
	ben := makeUser(t, db, "ben-rm@example.ch")
	carl := makeUser(t, db, "carl-rm@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	addMember(t, db, id, ben)
	addMember(t, db, id, carl)

	t.Run("a member may not remove another", func(t *testing.T) {
		if err := store.RemoveMember(ctx, id, ben, carl); err != ErrNotOwner {
			t.Errorf("member removing another = %v, want ErrNotOwner", err)
		}
	})

	t.Run("but may always remove themselves", func(t *testing.T) {
		if err := store.RemoveMember(ctx, id, ben, ben); err != nil {
			t.Fatalf("member leaving: %v", err)
		}
		if _, err := store.GetVault(ctx, id, ben); err != ErrNotMember {
			t.Error("they can still read it after leaving")
		}
	})

	t.Run("and the owner may remove anybody", func(t *testing.T) {
		if err := store.RemoveMember(ctx, id, anna, carl); err != nil {
			t.Errorf("owner removing a member: %v", err)
		}
	})
}

func TestStore_Rekey(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-rk@example.ch")
	ben := makeUser(t, db, "ben-rk@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("old"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	addMember(t, db, id, ben)

	t.Run("replaces the payload and everybody’s key, and drops whoever is left out", func(t *testing.T) {
		_, err := store.Rekey(ctx, id, anna, RekeyRequest{
			EncryptedName: "new-sealed-name",
			Version:       9,
			Members:       []RekeyMember{{UserID: anna, WrappedKey: "new-self", WrapKind: WrapSelf}},
		}, []byte("new"), []byte("n2"))
		if err != nil {
			t.Fatalf("Rekey: %v", err)
		}

		v, err := store.GetVault(ctx, id, anna)
		if err != nil {
			t.Fatalf("GetVault: %v", err)
		}
		if string(v.Ciphertext) != "new" {
			t.Errorf("ciphertext = %q, want the re-encrypted one", v.Ciphertext)
		}
		mine, _ := store.ListForUser(ctx, anna)
		if len(mine) != 1 || mine[0].WrappedKey != "new-self" || mine[0].EncryptedName != "new-sealed-name" {
			t.Errorf("owner's view after rekey: %+v", mine)
		}
		// Ben was not in the list, so Ben is out.
		if _, err := store.GetVault(ctx, id, ben); err != ErrNotMember {
			t.Errorf("the removed member can still read: %v", err)
		}
	})

	// Rekeying yourself out of your own household is not a thing to let
	// somebody do by accident.
	t.Run("refuses to leave the household without the person doing it", func(t *testing.T) {
		other := makeUser(t, db, "other-rk@example.ch")
		_, err := store.Rekey(ctx, id, anna, RekeyRequest{
			EncryptedName: "n",
			Members:       []RekeyMember{{UserID: other, WrappedKey: "k", WrapKind: WrapGranted}},
		}, []byte("x"), []byte("y"))
		if err != ErrNotMember {
			t.Errorf("Rekey without self = %v, want ErrNotMember", err)
		}
	})

	t.Run("is the owner’s alone", func(t *testing.T) {
		carl := makeUser(t, db, "carl-rk@example.ch")
		addMember(t, db, id, carl)
		_, err := store.Rekey(ctx, id, carl, RekeyRequest{
			EncryptedName: "n",
			Members:       []RekeyMember{{UserID: carl, WrappedKey: "k", WrapKind: WrapGranted}},
		}, []byte("x"), []byte("y"))
		if err != ErrNotOwner {
			t.Errorf("member rekeying = %v, want ErrNotOwner", err)
		}
	})
}

// A rekey advances the generation, so grants made after it cannot be confused
// with grants made before.
func TestStore_RekeyAdvancesTheEpoch(t *testing.T) {
	db := testDB(t)
	store := NewStore(db)
	ctx := context.Background()

	anna := makeUser(t, db, "anna-epoch@example.ch")
	id, _, err := store.Create(ctx, anna, aCreateRequest(), []byte("ct"), []byte("n"))
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	first, err := store.ListForUser(ctx, anna)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if first[0].KeyEpoch != 1 {
		t.Fatalf("a new household starts at epoch %d, want 1", first[0].KeyEpoch)
	}

	if _, err := store.Rekey(ctx, id, anna, RekeyRequest{
		EncryptedName: "n",
		Members:       []RekeyMember{{UserID: anna, WrappedKey: "k", WrapKind: WrapSelf}},
	}, []byte("x"), []byte("y")); err != nil {
		t.Fatalf("Rekey: %v", err)
	}

	after, err := store.ListForUser(ctx, anna)
	if err != nil {
		t.Fatalf("ListForUser: %v", err)
	}
	if after[0].KeyEpoch != 2 {
		t.Errorf("epoch after a rekey = %d, want 2", after[0].KeyEpoch)
	}
}

//go:build integration

package budget

import (
	"context"
	"database/sql"
	"errors"
	"math"
	"os"
	"strconv"
	"testing"
	"time"

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
	_, err := testDB.Exec("TRUNCATE budget_entries, budget_periods, budget_categories, budget_category_groups RESTART IDENTITY CASCADE")
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}
}

// testGroup creates a group and returns its ID for use in category creation.
func testGroup(t *testing.T, store *Store, name, typ string, sortOrder int) int {
	t.Helper()
	g := &CategoryGroup{Name: name, Type: typ, SortOrder: sortOrder}
	if err := store.CreateGroup(context.Background(), g); err != nil {
		t.Fatalf("CreateGroup(%s): %v", name, err)
	}
	return g.ID
}

func TestSeedDefaultsCreatesGroupsAndFixed(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	count, periodCreated, err := SeedDefaults(ctx, store)
	if err != nil {
		t.Fatalf("SeedDefaults: %v", err)
	}
	if count != len(BFSDefaults()) {
		t.Errorf("categories created = %d, want %d", count, len(BFSDefaults()))
	}
	if !periodCreated {
		t.Error("expected period to be created")
	}

	cats, err := store.ListCategories(ctx, false)
	if err != nil {
		t.Fatalf("ListCategories: %v", err)
	}

	groupsSeen := make(map[string]bool)
	fixedCount := 0
	for _, c := range cats {
		if c.GroupName == "" {
			t.Errorf("category %q has empty group_name", c.Name)
		}
		groupsSeen[c.GroupName] = true
		if c.Fixed {
			fixedCount++
		}
	}

	expectedGroups := []string{"Employment", "Housing", "Insurance & Taxes", "Living", "Lifestyle", "Savings"}
	for _, g := range expectedGroups {
		if !groupsSeen[g] {
			t.Errorf("expected group %q not found", g)
		}
	}
	if fixedCount == 0 {
		t.Error("expected at least one fixed category")
	}

	// Verify groups table is populated
	groups, err := store.ListGroups(ctx)
	if err != nil {
		t.Fatalf("ListGroups: %v", err)
	}
	if len(groups) != len(expectedGroups) {
		t.Errorf("group count = %d, want %d", len(groups), len(expectedGroups))
	}
}

func TestSeedDefaultsIdempotent(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	count1, _, err := SeedDefaults(ctx, store)
	if err != nil {
		t.Fatalf("first SeedDefaults: %v", err)
	}

	count2, _, err := SeedDefaults(ctx, store)
	if err != nil {
		t.Fatalf("second SeedDefaults: %v", err)
	}
	if count2 != 0 {
		t.Errorf("second seed created %d categories, want 0", count2)
	}

	cats, _ := store.ListCategories(ctx, false)
	if len(cats) != count1 {
		t.Errorf("category count = %d, want %d", len(cats), count1)
	}
}

func TestFixedEnforcement_PlannedAutoSetsActual(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Housing", "expense", 10)
	cat := &Category{Name: "Rent", Type: "expense", GroupID: &gid, Fixed: true}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "1350.00"
	entry, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, nil)
	if err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	if entry.PlannedAmount != "1350.0000" {
		t.Errorf("planned = %q, want 1350.0000", entry.PlannedAmount)
	}
	if entry.ActualAmount != "1350.0000" {
		t.Errorf("actual = %q, want 1350.0000 (auto-set for fixed)", entry.ActualAmount)
	}
}

func TestFixedEnforcement_ActualOnlyReturnsError(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Housing", "expense", 10)
	cat := &Category{Name: "Rent", Type: "expense", GroupID: &gid, Fixed: true}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	actual := "999.00"
	_, err := store.UpsertEntry(ctx, p.ID, cat.ID, nil, &actual)
	if err == nil {
		t.Fatal("expected error for actual-only on fixed category, got nil")
	}

	var fixedErr *FixedCategoryError
	if !errors.As(err, &fixedErr) {
		t.Errorf("expected FixedCategoryError, got %T: %v", err, err)
	}
}

func TestNonFixedAllowsActualOnly(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Living", "expense", 30)
	cat := &Category{Name: "Food", Type: "expense", GroupID: &gid, Fixed: false}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	actual := "450.00"
	entry, err := store.UpsertEntry(ctx, p.ID, cat.ID, nil, &actual)
	if err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}
	if entry.ActualAmount != "450.0000" {
		t.Errorf("actual = %q, want 450.0000", entry.ActualAmount)
	}
}

func TestReorderPersistsSortOrder(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "G", "expense", 1)
	c1 := &Category{Name: "A", Type: "expense", SortOrder: 10, GroupID: &gid}
	c2 := &Category{Name: "B", Type: "expense", SortOrder: 20, GroupID: &gid}
	c3 := &Category{Name: "C", Type: "expense", SortOrder: 30, GroupID: &gid}
	for _, c := range []*Category{c1, c2, c3} {
		if err := store.CreateCategory(ctx, c); err != nil {
			t.Fatalf("CreateCategory(%s): %v", c.Name, err)
		}
	}

	// Reorder: C, A, B
	err := store.ReorderCategories(ctx, []int{c3.ID, c1.ID, c2.ID})
	if err != nil {
		t.Fatalf("ReorderCategories: %v", err)
	}

	cats, err := store.ListCategories(ctx, false)
	if err != nil {
		t.Fatalf("ListCategories: %v", err)
	}

	if len(cats) != 3 {
		t.Fatalf("got %d categories, want 3", len(cats))
	}
	if cats[0].Name != "C" {
		t.Errorf("first category = %q, want C", cats[0].Name)
	}
	if cats[1].Name != "A" {
		t.Errorf("second category = %q, want A", cats[1].Name)
	}
	if cats[2].Name != "B" {
		t.Errorf("third category = %q, want B", cats[2].Name)
	}
}

func TestCascadeDeleteRemovesEntries(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Test", "expense", 1)
	cat := &Category{Name: "ToDelete", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 3}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "100.00"
	actual := "50.00"
	_, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, &actual)
	if err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	if err := store.DeleteCategory(ctx, cat.ID); err != nil {
		t.Fatalf("DeleteCategory: %v", err)
	}

	_, err = store.GetCategory(ctx, cat.ID)
	if err == nil {
		t.Error("expected error fetching deleted category")
	}

	var entryCount int
	testDB.QueryRowContext(ctx, "SELECT COUNT(*) FROM budget_entries WHERE category_id = $1", cat.ID).Scan(&entryCount)
	if entryCount != 0 {
		t.Errorf("entry count = %d, want 0 after cascade delete", entryCount)
	}
}

func TestDeleteNonexistentCategoryReturnsError(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	err := store.DeleteCategory(ctx, 99999)
	if err == nil {
		t.Error("expected error deleting nonexistent category")
	}
}

func TestCreateCategoryAutoSortOrder(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "G", "expense", 1)
	hid := testGroup(t, store, "H", "expense", 2)

	// First category with SortOrder=0 should get 10
	c1 := &Category{Name: "First", Type: "expense", SortOrder: 0, GroupID: &gid}
	if err := store.CreateCategory(ctx, c1); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}
	if c1.SortOrder != 10 {
		t.Errorf("first sort_order = %d, want 10", c1.SortOrder)
	}

	// Second in same group should get 20
	c2 := &Category{Name: "Second", Type: "expense", SortOrder: 0, GroupID: &gid}
	if err := store.CreateCategory(ctx, c2); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}
	if c2.SortOrder != 20 {
		t.Errorf("second sort_order = %d, want 20", c2.SortOrder)
	}

	// Different group starts fresh at 10
	c3 := &Category{Name: "Other", Type: "expense", SortOrder: 0, GroupID: &hid}
	if err := store.CreateCategory(ctx, c3); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}
	if c3.SortOrder != 10 {
		t.Errorf("different-group sort_order = %d, want 10", c3.SortOrder)
	}
}

func TestCopyPeriodFixedActualEqualsPlanned(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gidH := testGroup(t, store, "Housing", "expense", 10)
	gidL := testGroup(t, store, "Living", "expense", 30)

	fixed := &Category{Name: "Rent", Type: "expense", GroupID: &gidH, Fixed: true}
	flex := &Category{Name: "Food", Type: "expense", GroupID: &gidL, Fixed: false}
	if err := store.CreateCategory(ctx, fixed); err != nil {
		t.Fatalf("CreateCategory(fixed): %v", err)
	}
	if err := store.CreateCategory(ctx, flex); err != nil {
		t.Fatalf("CreateCategory(flex): %v", err)
	}

	src := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, src); err != nil {
		t.Fatalf("CreatePeriod(src): %v", err)
	}
	rentPlanned := "1350.00"
	rentActual := "1350.00"
	if _, err := store.UpsertEntry(ctx, src.ID, fixed.ID, &rentPlanned, &rentActual); err != nil {
		t.Fatalf("UpsertEntry(rent): %v", err)
	}
	foodPlanned := "500.00"
	foodActual := "480.00"
	if _, err := store.UpsertEntry(ctx, src.ID, flex.ID, &foodPlanned, &foodActual); err != nil {
		t.Fatalf("UpsertEntry(food): %v", err)
	}

	dst := &Period{Year: 2026, Month: 2}
	if err := store.CreatePeriod(ctx, dst); err != nil {
		t.Fatalf("CreatePeriod(dst): %v", err)
	}

	if err := store.CopyPeriodEntries(ctx, src.ID, dst.ID); err != nil {
		t.Fatalf("CopyPeriodEntries: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 2)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	for _, e := range summary.Entries {
		switch e.CategoryName {
		case "Rent":
			if e.PlannedAmount != "1350.0000" {
				t.Errorf("copied rent planned = %q, want 1350.0000", e.PlannedAmount)
			}
			if e.ActualAmount != "1350.0000" {
				t.Errorf("copied rent actual = %q, want 1350.0000 (fixed -> actual=planned)", e.ActualAmount)
			}
		case "Food":
			if e.PlannedAmount != "500.0000" {
				t.Errorf("copied food planned = %q, want 500.0000", e.PlannedAmount)
			}
			if e.ActualAmount != "0.0000" {
				t.Errorf("copied food actual = %q, want 0.0000 (non-fixed -> zeroed)", e.ActualAmount)
			}
		}
	}
}

func TestLeftJoinNewCategoryAppearsInSummary(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	p := &Period{Year: 2026, Month: 4}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	gid := testGroup(t, store, "Test", "expense", 1)
	cat := &Category{Name: "NewCat", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 4)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	found := false
	for _, e := range summary.Entries {
		if e.CategoryID == cat.ID {
			found = true
			pv, _ := strconv.ParseFloat(e.PlannedAmount, 64)
			if pv != 0 {
				t.Errorf("new category planned = %q, want 0", e.PlannedAmount)
			}
			av, _ := strconv.ParseFloat(e.ActualAmount, 64)
			if av != 0 {
				t.Errorf("new category actual = %q, want 0", e.ActualAmount)
			}
		}
	}
	if !found {
		t.Error("new category not found in period summary (LEFT JOIN not working)")
	}
}

func TestUpsertEntryFillsCategoryFields(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Employment", "income", 1)
	cat := &Category{Name: "Salary", Type: "income", GroupID: &gid, Fixed: true}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 5}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "6000.00"
	entry, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, nil)
	if err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	if entry.CategoryName != "Salary" {
		t.Errorf("CategoryName = %q, want Salary", entry.CategoryName)
	}
	if entry.CategoryType != "income" {
		t.Errorf("CategoryType = %q, want income", entry.CategoryType)
	}
	if entry.CategoryGroupName != "Employment" {
		t.Errorf("CategoryGroupName = %q, want Employment", entry.CategoryGroupName)
	}
	if !entry.CategoryFixed {
		t.Error("CategoryFixed = false, want true")
	}
}

// --- Adversarial / edge-case / precision tests ---

func TestUpsertEntry_NonexistentCategory(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "100.00"
	_, err := store.UpsertEntry(ctx, p.ID, 99999, &planned, nil)
	if err == nil {
		t.Fatal("expected error for nonexistent category, got nil")
	}
}

func TestUpsertEntry_PreservesActualWhenUpdatingPlanned(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Living", "expense", 30)
	cat := &Category{Name: "Food", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "500.00"
	actual := "480.00"
	if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, &actual); err != nil {
		t.Fatalf("initial UpsertEntry: %v", err)
	}

	newPlanned := "600.00"
	entry, err := store.UpsertEntry(ctx, p.ID, cat.ID, &newPlanned, nil)
	if err != nil {
		t.Fatalf("update UpsertEntry: %v", err)
	}

	if entry.PlannedAmount != "600.0000" {
		t.Errorf("planned = %q, want 600.0000", entry.PlannedAmount)
	}
	if entry.ActualAmount != "480.0000" {
		t.Errorf("actual = %q, want 480.0000 (should be preserved)", entry.ActualAmount)
	}
}

func TestUpsertEntry_PreservesPlannedWhenUpdatingActual(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Living", "expense", 30)
	cat := &Category{Name: "Food", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "500.00"
	actual := "480.00"
	if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, &actual); err != nil {
		t.Fatalf("initial UpsertEntry: %v", err)
	}

	newActual := "520.00"
	entry, err := store.UpsertEntry(ctx, p.ID, cat.ID, nil, &newActual)
	if err != nil {
		t.Fatalf("update UpsertEntry: %v", err)
	}

	if entry.PlannedAmount != "500.0000" {
		t.Errorf("planned = %q, want 500.0000 (should be preserved)", entry.PlannedAmount)
	}
	if entry.ActualAmount != "520.0000" {
		t.Errorf("actual = %q, want 520.0000", entry.ActualAmount)
	}
}

func TestUpsertEntry_UpdateExistingEntry(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Living", "expense", 30)
	cat := &Category{Name: "Food", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned1 := "500.00"
	actual1 := "480.00"
	entry1, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned1, &actual1)
	if err != nil {
		t.Fatalf("first UpsertEntry: %v", err)
	}

	planned2 := "600.00"
	actual2 := "590.00"
	entry2, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned2, &actual2)
	if err != nil {
		t.Fatalf("second UpsertEntry: %v", err)
	}

	if entry2.ID != entry1.ID {
		t.Errorf("entry ID changed: %d -> %d (expected same entry via upsert)", entry1.ID, entry2.ID)
	}
	if entry2.PlannedAmount != "600.0000" {
		t.Errorf("planned = %q, want 600.0000", entry2.PlannedAmount)
	}
	if entry2.ActualAmount != "590.0000" {
		t.Errorf("actual = %q, want 590.0000", entry2.ActualAmount)
	}
}

func TestArchivedCategoryExcludedFromSummary(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Test", "expense", 1)
	cat := &Category{Name: "OldCat", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "100.00"
	if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, nil); err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	cat.Archived = true
	if err := store.UpdateCategory(ctx, cat); err != nil {
		t.Fatalf("UpdateCategory: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 1)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	for _, e := range summary.Entries {
		if e.CategoryID == cat.ID {
			t.Errorf("archived category %q should not appear in summary", cat.Name)
		}
	}
}

func TestSummary_OnlyIncome(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Employment", "income", 1)
	cat := &Category{Name: "Salary", Type: "income", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "6000.00"
	actual := "6000.00"
	if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, &actual); err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 1)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	if summary.TotalPlannedIncome != "6000.0000" {
		t.Errorf("TotalPlannedIncome = %q, want 6000.0000", summary.TotalPlannedIncome)
	}
	if summary.TotalPlannedExpenses != "0.0000" {
		t.Errorf("TotalPlannedExpenses = %q, want 0.0000", summary.TotalPlannedExpenses)
	}
	if summary.PlannedBalance != "6000.0000" {
		t.Errorf("PlannedBalance = %q, want 6000.0000", summary.PlannedBalance)
	}
}

func TestSummary_OnlyExpenses(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Housing", "expense", 10)
	cat := &Category{Name: "Rent", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "1350.00"
	actual := "1350.00"
	if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, &actual); err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 1)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	if summary.TotalPlannedIncome != "0.0000" {
		t.Errorf("TotalPlannedIncome = %q, want 0.0000", summary.TotalPlannedIncome)
	}
	if summary.TotalPlannedExpenses != "1350.0000" {
		t.Errorf("TotalPlannedExpenses = %q, want 1350.0000", summary.TotalPlannedExpenses)
	}
	if summary.PlannedBalance != "-1350.0000" {
		t.Errorf("PlannedBalance = %q, want -1350.0000 (negative)", summary.PlannedBalance)
	}
}

func TestSummary_NoCategoriesEmptyPeriod(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 1)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	if len(summary.Entries) != 0 {
		t.Errorf("expected 0 entries, got %d", len(summary.Entries))
	}
	if summary.TotalPlannedIncome != "0.0000" {
		t.Errorf("TotalPlannedIncome = %q, want 0.0000", summary.TotalPlannedIncome)
	}
	if summary.TotalPlannedExpenses != "0.0000" {
		t.Errorf("TotalPlannedExpenses = %q, want 0.0000", summary.TotalPlannedExpenses)
	}
	if summary.PlannedBalance != "0.0000" {
		t.Errorf("PlannedBalance = %q, want 0.0000", summary.PlannedBalance)
	}
}

func TestCopyPeriod_OntoSelf(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Living", "expense", 30)
	cat := &Category{Name: "Food", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	planned := "500.00"
	actual := "480.00"
	if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, &actual); err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	if err := store.CopyPeriodEntries(ctx, p.ID, p.ID); err != nil {
		t.Fatalf("CopyPeriodEntries onto self: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 1)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	for _, e := range summary.Entries {
		if e.CategoryID == cat.ID {
			if e.PlannedAmount != "500.0000" {
				t.Errorf("planned after self-copy = %q, want 500.0000", e.PlannedAmount)
			}
			if e.ActualAmount != "0.0000" {
				t.Errorf("actual after self-copy = %q, want 0.0000 (non-fixed zeroed)", e.ActualAmount)
			}
		}
	}
}

func TestCopyPeriod_EmptySource(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Living", "expense", 30)
	cat := &Category{Name: "Food", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	src := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, src); err != nil {
		t.Fatalf("CreatePeriod(src): %v", err)
	}

	dst := &Period{Year: 2026, Month: 2}
	if err := store.CreatePeriod(ctx, dst); err != nil {
		t.Fatalf("CreatePeriod(dst): %v", err)
	}

	err := store.CopyPeriodEntries(ctx, src.ID, dst.ID)
	if err != nil {
		t.Fatalf("CopyPeriodEntries from empty source: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 2)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	if len(summary.Entries) != 1 {
		t.Fatalf("expected 1 entry (from LEFT JOIN), got %d", len(summary.Entries))
	}
	pv, _ := strconv.ParseFloat(summary.Entries[0].PlannedAmount, 64)
	if pv != 0 {
		t.Errorf("planned = %q, want 0", summary.Entries[0].PlannedAmount)
	}
}

func TestReorder_DuplicateIDs(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "G", "expense", 1)
	c1 := &Category{Name: "A", Type: "expense", SortOrder: 10, GroupID: &gid}
	c2 := &Category{Name: "B", Type: "expense", SortOrder: 20, GroupID: &gid}
	for _, c := range []*Category{c1, c2} {
		if err := store.CreateCategory(ctx, c); err != nil {
			t.Fatalf("CreateCategory(%s): %v", c.Name, err)
		}
	}

	err := store.ReorderCategories(ctx, []int{c1.ID, c1.ID, c2.ID})
	if err != nil {
		t.Fatalf("ReorderCategories with duplicates: %v", err)
	}

	cats, err := store.ListCategories(ctx, false)
	if err != nil {
		t.Fatalf("ListCategories: %v", err)
	}

	if len(cats) != 2 {
		t.Fatalf("expected 2 categories, got %d", len(cats))
	}
	if cats[0].Name != "A" || cats[1].Name != "B" {
		t.Errorf("order = [%s, %s], want [A, B]", cats[0].Name, cats[1].Name)
	}
}

func TestReorder_NonexistentIDs(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	err := store.ReorderCategories(ctx, []int{99999})
	if err != nil {
		t.Fatalf("ReorderCategories with nonexistent ID: unexpected error: %v", err)
	}
}

func TestPrecision_4dpRoundTrip(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Test", "expense", 1)
	cat := &Category{Name: "Test", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	amount := "833.3333"
	entry, err := store.UpsertEntry(ctx, p.ID, cat.ID, &amount, nil)
	if err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	if entry.PlannedAmount != "833.3333" {
		t.Errorf("stored amount = %q, want 833.3333", entry.PlannedAmount)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 1)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}
	if summary.TotalPlannedExpenses != "833.3333" {
		t.Errorf("TotalPlannedExpenses = %q, want 833.3333", summary.TotalPlannedExpenses)
	}
}

func TestPrecision_YearlyDivisionRoundTrip(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Test", "expense", 1)
	cat := &Category{Name: "Test", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	amount := "833.3333"
	if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &amount, nil); err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	summary, err := store.GetPeriodSummary(ctx, 2026, 1)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	monthly, err := strconv.ParseFloat(summary.TotalPlannedExpenses, 64)
	if err != nil {
		t.Fatalf("cannot parse TotalPlannedExpenses %q: %v", summary.TotalPlannedExpenses, err)
	}

	yearly := monthly * 12
	yearlyDisplay := math.Round(yearly*100) / 100
	if yearlyDisplay != 10000.00 {
		t.Errorf("yearly display = %.2f, want 10000.00 (monthly=%s x 12 = %.4f)", yearlyDisplay, summary.TotalPlannedExpenses, yearly)
	}
}

func TestDuplicatePeriodCreation(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	p1 := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p1); err != nil {
		t.Fatalf("first CreatePeriod: %v", err)
	}

	p2 := &Period{Year: 2026, Month: 1}
	err := store.CreatePeriod(ctx, p2)
	if err == nil {
		t.Fatal("expected error creating duplicate period, got nil")
	}
}

func TestSeedDefaults_ExistingCategoriesNoEntries(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	gid := testGroup(t, store, "Custom", "expense", 1)
	cat := &Category{Name: "Custom", Type: "expense", GroupID: &gid}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	count, periodCreated, err := SeedDefaults(ctx, store)
	if err != nil {
		t.Fatalf("SeedDefaults: %v", err)
	}

	if count != 0 {
		t.Errorf("categories created = %d, want 0 (existing categories present)", count)
	}

	if !periodCreated {
		t.Error("expected period to be created")
	}

	now := time.Now()
	year, m, _ := now.Date()
	month := int(m)

	summary, err := store.GetPeriodSummary(ctx, year, month)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	if len(summary.Entries) != 1 {
		t.Errorf("expected 1 entry (custom cat via LEFT JOIN), got %d", len(summary.Entries))
	}
}

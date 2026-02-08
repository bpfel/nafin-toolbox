//go:build integration

package budget

import (
	"context"
	"database/sql"
	"errors"
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
	_, err := testDB.Exec("TRUNCATE budget_entries, budget_periods, budget_categories RESTART IDENTITY CASCADE")
	if err != nil {
		t.Fatalf("truncating tables: %v", err)
	}
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

	// Create a fixed category
	cat := &Category{Name: "Rent", Type: "expense", GroupName: "Housing", GroupSortOrder: 10, Fixed: true}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	// Create a period
	p := &Period{Year: 2026, Month: 1}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	// Upsert with planned only — actual should be auto-set
	planned := "1350.00"
	entry, err := store.UpsertEntry(ctx, p.ID, cat.ID, &planned, nil)
	if err != nil {
		t.Fatalf("UpsertEntry: %v", err)
	}

	if entry.PlannedAmount != "1350.00" {
		t.Errorf("planned = %q, want 1350.00", entry.PlannedAmount)
	}
	if entry.ActualAmount != "1350.00" {
		t.Errorf("actual = %q, want 1350.00 (auto-set for fixed)", entry.ActualAmount)
	}
}

func TestFixedEnforcement_ActualOnlyReturnsError(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	cat := &Category{Name: "Rent", Type: "expense", GroupName: "Housing", GroupSortOrder: 10, Fixed: true}
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

	cat := &Category{Name: "Food", Type: "expense", GroupName: "Living", GroupSortOrder: 30, Fixed: false}
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
	if entry.ActualAmount != "450.00" {
		t.Errorf("actual = %q, want 450.00", entry.ActualAmount)
	}
}

func TestReorderPersistsSortOrder(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	// Create 3 categories in order
	c1 := &Category{Name: "A", Type: "expense", SortOrder: 10, GroupName: "G", GroupSortOrder: 1}
	c2 := &Category{Name: "B", Type: "expense", SortOrder: 20, GroupName: "G", GroupSortOrder: 1}
	c3 := &Category{Name: "C", Type: "expense", SortOrder: 30, GroupName: "G", GroupSortOrder: 1}
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

	// Verify new order
	cats, err := store.ListCategories(ctx, false)
	if err != nil {
		t.Fatalf("ListCategories: %v", err)
	}

	if len(cats) != 3 {
		t.Fatalf("got %d categories, want 3", len(cats))
	}
	// All have same group_sort_order, so sorted by sort_order, then id
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

	cat := &Category{Name: "ToDelete", Type: "expense", GroupName: "Test", GroupSortOrder: 1}
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

	// Delete should succeed even with entries
	if err := store.DeleteCategory(ctx, cat.ID); err != nil {
		t.Fatalf("DeleteCategory: %v", err)
	}

	// Verify category is gone
	_, err = store.GetCategory(ctx, cat.ID)
	if err == nil {
		t.Error("expected error fetching deleted category")
	}

	// Verify entries are gone
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

	// First category with SortOrder=0 should get 10
	c1 := &Category{Name: "First", Type: "expense", SortOrder: 0, GroupName: "G", GroupSortOrder: 1}
	if err := store.CreateCategory(ctx, c1); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}
	if c1.SortOrder != 10 {
		t.Errorf("first sort_order = %d, want 10", c1.SortOrder)
	}

	// Second in same group should get 20
	c2 := &Category{Name: "Second", Type: "expense", SortOrder: 0, GroupName: "G", GroupSortOrder: 1}
	if err := store.CreateCategory(ctx, c2); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}
	if c2.SortOrder != 20 {
		t.Errorf("second sort_order = %d, want 20", c2.SortOrder)
	}

	// Different group starts fresh at 10
	c3 := &Category{Name: "Other", Type: "expense", SortOrder: 0, GroupName: "H", GroupSortOrder: 2}
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

	// Create one fixed and one non-fixed category
	fixed := &Category{Name: "Rent", Type: "expense", GroupName: "Housing", GroupSortOrder: 10, Fixed: true}
	flex := &Category{Name: "Food", Type: "expense", GroupName: "Living", GroupSortOrder: 30, Fixed: false}
	if err := store.CreateCategory(ctx, fixed); err != nil {
		t.Fatalf("CreateCategory(fixed): %v", err)
	}
	if err := store.CreateCategory(ctx, flex); err != nil {
		t.Fatalf("CreateCategory(flex): %v", err)
	}

	// Create source period with entries
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

	// Create destination period
	dst := &Period{Year: 2026, Month: 2}
	if err := store.CreatePeriod(ctx, dst); err != nil {
		t.Fatalf("CreatePeriod(dst): %v", err)
	}

	// Copy
	if err := store.CopyPeriodEntries(ctx, src.ID, dst.ID); err != nil {
		t.Fatalf("CopyPeriodEntries: %v", err)
	}

	// Verify
	summary, err := store.GetPeriodSummary(ctx, 2026, 2)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	for _, e := range summary.Entries {
		switch e.CategoryName {
		case "Rent":
			if e.PlannedAmount != "1350.00" {
				t.Errorf("copied rent planned = %q, want 1350.00", e.PlannedAmount)
			}
			if e.ActualAmount != "1350.00" {
				t.Errorf("copied rent actual = %q, want 1350.00 (fixed → actual=planned)", e.ActualAmount)
			}
		case "Food":
			if e.PlannedAmount != "500.00" {
				t.Errorf("copied food planned = %q, want 500.00", e.PlannedAmount)
			}
			if e.ActualAmount != "0.00" {
				t.Errorf("copied food actual = %q, want 0.00 (non-fixed → zeroed)", e.ActualAmount)
			}
		}
	}
}

func TestLeftJoinNewCategoryAppearsInSummary(t *testing.T) {
	truncateTables(t)
	store := NewStore(testDB)
	ctx := context.Background()

	// Create period first
	p := &Period{Year: 2026, Month: 4}
	if err := store.CreatePeriod(ctx, p); err != nil {
		t.Fatalf("CreatePeriod: %v", err)
	}

	// Create category after the period (no entry exists)
	cat := &Category{Name: "NewCat", Type: "expense", GroupName: "Test", GroupSortOrder: 1}
	if err := store.CreateCategory(ctx, cat); err != nil {
		t.Fatalf("CreateCategory: %v", err)
	}

	// Period summary should include the category with zero amounts
	summary, err := store.GetPeriodSummary(ctx, 2026, 4)
	if err != nil {
		t.Fatalf("GetPeriodSummary: %v", err)
	}

	found := false
	for _, e := range summary.Entries {
		if e.CategoryID == cat.ID {
			found = true
			if e.PlannedAmount != "0" && e.PlannedAmount != "0.00" {
				t.Errorf("new category planned = %q, want 0", e.PlannedAmount)
			}
			if e.ActualAmount != "0" && e.ActualAmount != "0.00" {
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

	cat := &Category{Name: "Salary", Type: "income", GroupName: "Employment", GroupSortOrder: 1, Fixed: true}
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

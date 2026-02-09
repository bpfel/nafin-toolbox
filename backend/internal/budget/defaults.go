package budget

import (
	"context"
	"time"
)

// DefaultGroup holds a default budget category group.
type DefaultGroup struct {
	Name      string
	Type      string
	SortOrder int
}

// DefaultCategory holds a BFS-based default budget category for a Swiss single person.
type DefaultCategory struct {
	Name      string // display name, e.g. "Rent"
	Type      string // "income" or "expense"
	SortOrder int    // position within its group
	GroupName string // visual grouping, e.g. "Housing"
	Fixed     bool   // if true, actual always equals planned (non-editable actual)
	Amount    string // default monthly CHF amount
}

// BFSDefaultGroups returns the default category groups.
func BFSDefaultGroups() []DefaultGroup {
	return []DefaultGroup{
		{Name: "Employment", Type: "income", SortOrder: 1},
		{Name: "Housing", Type: "expense", SortOrder: 10},
		{Name: "Insurance & Taxes", Type: "expense", SortOrder: 20},
		{Name: "Living", Type: "expense", SortOrder: 30},
		{Name: "Lifestyle", Type: "expense", SortOrder: 40},
		{Name: "Savings", Type: "expense", SortOrder: 50},
	}
}

// BFSDefaults returns the default categories based on BFS HABE 2023 data.
// All amounts are monthly values.
func BFSDefaults() []DefaultCategory {
	return []DefaultCategory{
		// Income — Employment
		{Name: "Salary (net)", Type: "income", SortOrder: 10, GroupName: "Employment", Fixed: true, Amount: "6000.00"},

		// Expense — Housing
		{Name: "Rent", Type: "expense", SortOrder: 10, GroupName: "Housing", Fixed: true, Amount: "1350.00"},
		{Name: "Utilities", Type: "expense", SortOrder: 20, GroupName: "Housing", Fixed: false, Amount: "150.00"},

		// Expense — Insurance & Taxes
		{Name: "Health Insurance", Type: "expense", SortOrder: 10, GroupName: "Insurance & Taxes", Fixed: true, Amount: "391.67"},
		{Name: "Other Insurance", Type: "expense", SortOrder: 20, GroupName: "Insurance & Taxes", Fixed: true, Amount: "166.67"},
		{Name: "Taxes", Type: "expense", SortOrder: 30, GroupName: "Insurance & Taxes", Fixed: true, Amount: "833.33"},

		// Expense — Living
		{Name: "Food & Groceries", Type: "expense", SortOrder: 10, GroupName: "Living", Fixed: false, Amount: "500.00"},
		{Name: "Transportation", Type: "expense", SortOrder: 20, GroupName: "Living", Fixed: false, Amount: "400.00"},
		{Name: "Telecommunications", Type: "expense", SortOrder: 30, GroupName: "Living", Fixed: true, Amount: "80.00"},

		// Expense — Lifestyle
		{Name: "Clothing & Footwear", Type: "expense", SortOrder: 10, GroupName: "Lifestyle", Fixed: false, Amount: "100.00"},
		{Name: "Entertainment & Recreation", Type: "expense", SortOrder: 20, GroupName: "Lifestyle", Fixed: false, Amount: "250.00"},
		{Name: "Dining Out", Type: "expense", SortOrder: 30, GroupName: "Lifestyle", Fixed: false, Amount: "250.00"},

		// Expense — Savings
		{Name: "Savings", Type: "expense", SortOrder: 10, GroupName: "Savings", Fixed: false, Amount: "500.00"},
	}
}

// SeedDefaults creates the BFS default groups, categories, and a period for the current month
// with pre-filled entries. Returns the number of categories created and whether a period was created.
func SeedDefaults(ctx context.Context, store *Store) (int, bool, error) {
	categoriesCreated := 0

	// Check if categories already exist
	existingCount, err := store.CategoryCount(ctx)
	if err != nil {
		return 0, false, err
	}

	// Only seed if no categories exist
	if existingCount == 0 {
		// Create groups first
		groupMap := make(map[string]int) // "name|type" -> group ID
		for _, dg := range BFSDefaultGroups() {
			g := &CategoryGroup{
				Name:      dg.Name,
				Type:      dg.Type,
				SortOrder: dg.SortOrder,
			}
			if err := store.CreateGroup(ctx, g); err != nil {
				return 0, false, err
			}
			groupMap[dg.Name+"|"+dg.Type] = g.ID
		}

		// Create categories with group_id FK
		defaults := BFSDefaults()
		for _, d := range defaults {
			groupID := groupMap[d.GroupName+"|"+d.Type]
			c := &Category{
				Name:      d.Name,
				Type:      d.Type,
				SortOrder: d.SortOrder,
				GroupID:   &groupID,
				Fixed:     d.Fixed,
			}
			if err := store.CreateCategory(ctx, c); err != nil {
				return categoriesCreated, false, err
			}
			categoriesCreated++
		}
	}

	// Create current month period if it doesn't exist
	now := time.Now()
	year, m, _ := now.Date()
	month := int(m)

	periodCreated := false
	_, err = store.GetPeriodByYearMonth(ctx, year, month)
	if err != nil {
		// Period doesn't exist, create it
		p := &Period{Year: year, Month: month}
		if err := store.CreatePeriod(ctx, p); err != nil {
			return categoriesCreated, false, err
		}
		periodCreated = true

		// Pre-fill entries with default amounts
		if categoriesCreated > 0 {
			defaults := BFSDefaults()
			cats, err := store.ListCategories(ctx, false)
			if err != nil {
				return categoriesCreated, periodCreated, err
			}
			for i, cat := range cats {
				if i < len(defaults) {
					amt := defaults[i].Amount
					if cat.Fixed {
						if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &amt, &amt); err != nil {
							return categoriesCreated, periodCreated, err
						}
					} else {
						if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &amt, nil); err != nil {
							return categoriesCreated, periodCreated, err
						}
					}
				}
			}
		}
	}

	return categoriesCreated, periodCreated, nil
}

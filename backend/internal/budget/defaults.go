package budget

import (
	"context"
	"time"
)

// DefaultCategory holds a BFS-based default budget category for a Swiss single person.
type DefaultCategory struct {
	Name           string
	Type           string
	SortOrder      int
	GroupName      string
	GroupSortOrder int
	Fixed          bool
	Amount         string // default monthly CHF amount
}

// BFSDefaults returns the default categories based on BFS HABE 2023 data.
// All amounts are monthly values.
func BFSDefaults() []DefaultCategory {
	return []DefaultCategory{
		// Income — Employment
		{Name: "Salary (net)", Type: "income", SortOrder: 10, GroupName: "Employment", GroupSortOrder: 1, Fixed: true, Amount: "6000.00"},

		// Expense — Housing
		{Name: "Rent", Type: "expense", SortOrder: 10, GroupName: "Housing", GroupSortOrder: 10, Fixed: true, Amount: "1350.00"},
		{Name: "Utilities", Type: "expense", SortOrder: 20, GroupName: "Housing", GroupSortOrder: 10, Fixed: false, Amount: "150.00"},

		// Expense — Insurance & Taxes
		{Name: "Health Insurance", Type: "expense", SortOrder: 10, GroupName: "Insurance & Taxes", GroupSortOrder: 20, Fixed: true, Amount: "391.67"},
		{Name: "Other Insurance", Type: "expense", SortOrder: 20, GroupName: "Insurance & Taxes", GroupSortOrder: 20, Fixed: true, Amount: "166.67"},
		{Name: "Taxes", Type: "expense", SortOrder: 30, GroupName: "Insurance & Taxes", GroupSortOrder: 20, Fixed: true, Amount: "833.33"},

		// Expense — Living
		{Name: "Food & Groceries", Type: "expense", SortOrder: 10, GroupName: "Living", GroupSortOrder: 30, Fixed: false, Amount: "500.00"},
		{Name: "Transportation", Type: "expense", SortOrder: 20, GroupName: "Living", GroupSortOrder: 30, Fixed: false, Amount: "400.00"},
		{Name: "Telecommunications", Type: "expense", SortOrder: 30, GroupName: "Living", GroupSortOrder: 30, Fixed: true, Amount: "80.00"},

		// Expense — Lifestyle
		{Name: "Clothing & Footwear", Type: "expense", SortOrder: 10, GroupName: "Lifestyle", GroupSortOrder: 40, Fixed: false, Amount: "100.00"},
		{Name: "Entertainment & Recreation", Type: "expense", SortOrder: 20, GroupName: "Lifestyle", GroupSortOrder: 40, Fixed: false, Amount: "250.00"},
		{Name: "Dining Out", Type: "expense", SortOrder: 30, GroupName: "Lifestyle", GroupSortOrder: 40, Fixed: false, Amount: "250.00"},

		// Expense — Savings
		{Name: "Savings", Type: "expense", SortOrder: 10, GroupName: "Savings", GroupSortOrder: 50, Fixed: false, Amount: "500.00"},
	}
}

// SeedDefaults creates the BFS default categories and a period for the current month
// with pre-filled entries. Returns the number of categories created and whether a period was created.
func SeedDefaults(ctx context.Context, store *Store) (int, bool, error) {
	defaults := BFSDefaults()
	categoriesCreated := 0

	// Check if categories already exist
	existingCount, err := store.CategoryCount(ctx)
	if err != nil {
		return 0, false, err
	}

	// Only seed categories if none exist
	if existingCount == 0 {
		for _, d := range defaults {
			c := &Category{
				Name:           d.Name,
				Type:           d.Type,
				SortOrder:      d.SortOrder,
				GroupName:      d.GroupName,
				GroupSortOrder: d.GroupSortOrder,
				Fixed:          d.Fixed,
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
			cats, err := store.ListCategories(ctx, false)
			if err != nil {
				return categoriesCreated, periodCreated, err
			}
			for i, cat := range cats {
				if i < len(defaults) {
					amt := defaults[i].Amount
					// For fixed categories, set actual = planned
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

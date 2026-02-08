package budget

import (
	"context"
	"time"
)

// DefaultCategory holds a BFS-based default budget category for a Swiss single person.
type DefaultCategory struct {
	Name      string
	Type      string
	SortOrder int
	Amount    string // default monthly CHF amount
}

// BFSDefaults returns the default categories based on BFS HABE 2023 data.
// All amounts are monthly values.
func BFSDefaults() []DefaultCategory {
	return []DefaultCategory{
		{Name: "Salary (net)", Type: "income", SortOrder: 1, Amount: "6000.00"},
		{Name: "Housing (rent + utilities)", Type: "expense", SortOrder: 10, Amount: "1500.00"},
		{Name: "Health Insurance", Type: "expense", SortOrder: 20, Amount: "391.67"},
		{Name: "Food & Groceries", Type: "expense", SortOrder: 30, Amount: "500.00"},
		{Name: "Transportation", Type: "expense", SortOrder: 40, Amount: "400.00"},
		{Name: "Taxes", Type: "expense", SortOrder: 50, Amount: "833.33"},
		{Name: "Other Insurance", Type: "expense", SortOrder: 60, Amount: "166.67"},
		{Name: "Telecommunications", Type: "expense", SortOrder: 70, Amount: "80.00"},
		{Name: "Clothing & Footwear", Type: "expense", SortOrder: 80, Amount: "100.00"},
		{Name: "Entertainment & Recreation", Type: "expense", SortOrder: 90, Amount: "250.00"},
		{Name: "Dining Out", Type: "expense", SortOrder: 100, Amount: "250.00"},
		{Name: "Savings", Type: "expense", SortOrder: 110, Amount: "500.00"},
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
				Name:      d.Name,
				Type:      d.Type,
				SortOrder: d.SortOrder,
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
					if _, err := store.UpsertEntry(ctx, p.ID, cat.ID, &amt, nil); err != nil {
						return categoriesCreated, periodCreated, err
					}
				}
			}
		}
	}

	return categoriesCreated, periodCreated, nil
}

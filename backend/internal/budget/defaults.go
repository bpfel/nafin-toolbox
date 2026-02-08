package budget

import (
	"context"
	"time"
)

// DefaultCategory holds a BFS-based default budget category for a Swiss single person.
type DefaultCategory struct {
	Name      string
	Type      string
	Frequency string
	SortOrder int
	Amount    string // default CHF amount
}

// BFSDefaults returns the default categories based on BFS HABE 2023 data.
func BFSDefaults() []DefaultCategory {
	return []DefaultCategory{
		{Name: "Salary (net)", Type: "income", Frequency: "monthly", SortOrder: 1, Amount: "6000.00"},
		{Name: "Housing (rent + utilities)", Type: "expense", Frequency: "monthly", SortOrder: 10, Amount: "1500.00"},
		{Name: "Health Insurance", Type: "expense", Frequency: "yearly", SortOrder: 20, Amount: "4700.00"},
		{Name: "Food & Groceries", Type: "expense", Frequency: "monthly", SortOrder: 30, Amount: "500.00"},
		{Name: "Transportation", Type: "expense", Frequency: "monthly", SortOrder: 40, Amount: "400.00"},
		{Name: "Taxes", Type: "expense", Frequency: "yearly", SortOrder: 50, Amount: "10000.00"},
		{Name: "Other Insurance", Type: "expense", Frequency: "yearly", SortOrder: 60, Amount: "2000.00"},
		{Name: "Telecommunications", Type: "expense", Frequency: "monthly", SortOrder: 70, Amount: "80.00"},
		{Name: "Clothing & Footwear", Type: "expense", Frequency: "monthly", SortOrder: 80, Amount: "100.00"},
		{Name: "Entertainment & Recreation", Type: "expense", Frequency: "monthly", SortOrder: 90, Amount: "250.00"},
		{Name: "Dining Out", Type: "expense", Frequency: "monthly", SortOrder: 100, Amount: "250.00"},
		{Name: "Savings", Type: "expense", Frequency: "monthly", SortOrder: 110, Amount: "500.00"},
	}
}

// SeedDefaults creates the BFS default categories, an initial plan with default amounts,
// and a period for the current month initialized from that plan.
// Returns (categoriesCreated, planCreated, periodCreated, error).
func SeedDefaults(ctx context.Context, store *Store) (int, bool, bool, error) {
	defaults := BFSDefaults()
	categoriesCreated := 0

	// Check if categories already exist
	existingCount, err := store.CategoryCount(ctx)
	if err != nil {
		return 0, false, false, err
	}

	// Only seed categories if none exist
	if existingCount == 0 {
		for _, d := range defaults {
			c := &Category{
				Name:      d.Name,
				Type:      d.Type,
				Frequency: d.Frequency,
				SortOrder: d.SortOrder,
			}
			if err := store.CreateCategory(ctx, c); err != nil {
				return categoriesCreated, false, false, err
			}
			categoriesCreated++
		}
	}

	now := time.Now()
	year, m, _ := now.Date()
	month := int(m)

	// Create an initial plan if none exists
	planCreated := false
	plans, err := store.ListPlans(ctx)
	if err != nil {
		return categoriesCreated, false, false, err
	}

	var planID int
	if len(plans) == 0 && categoriesCreated > 0 {
		plan := &Plan{
			Name:               "Swiss BFS Defaults",
			EffectiveFromYear:  year,
			EffectiveFromMonth: month,
			Notes:              "Default plan based on BFS HABE 2023 survey data",
		}
		if err := store.CreatePlan(ctx, plan); err != nil {
			return categoriesCreated, false, false, err
		}
		planCreated = true
		planID = plan.ID

		// Populate plan entries with default amounts
		cats, err := store.ListCategories(ctx, false)
		if err != nil {
			return categoriesCreated, planCreated, false, err
		}
		for i, cat := range cats {
			if i < len(defaults) {
				if _, err := store.UpsertPlanEntry(ctx, planID, cat.ID, defaults[i].Amount); err != nil {
					return categoriesCreated, planCreated, false, err
				}
			}
		}
	} else if len(plans) > 0 {
		planID = plans[0].ID
	}

	// Create current month period if it doesn't exist
	periodCreated := false
	_, err = store.GetPeriodByYearMonth(ctx, year, month)
	if err != nil {
		// Period doesn't exist, create it linked to the plan
		var pID *int
		if planID > 0 {
			pID = &planID
		}
		p := &Period{Year: year, Month: month, PlanID: pID}
		if err := store.CreatePeriod(ctx, p); err != nil {
			return categoriesCreated, planCreated, false, err
		}
		periodCreated = true

		// Initialize entries from plan
		if planID > 0 {
			if err := store.InitializePeriodFromPlan(ctx, p.ID, planID); err != nil {
				return categoriesCreated, planCreated, periodCreated, err
			}
		}
	}

	return categoriesCreated, planCreated, periodCreated, nil
}

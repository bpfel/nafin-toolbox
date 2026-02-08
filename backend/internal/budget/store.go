package budget

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strconv"
)

// All amounts are stored as monthly values. Yearly display is frontend-only.

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Categories

func (s *Store) ListCategories(ctx context.Context, includeArchived bool) ([]Category, error) {
	query := `SELECT id, name, type, sort_order, archived, group_name, group_sort_order, fixed, created_at, updated_at
	          FROM budget_categories`
	if !includeArchived {
		query += " WHERE archived = FALSE"
	}
	query += " ORDER BY group_sort_order, sort_order, id"

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Type, &c.SortOrder, &c.Archived, &c.GroupName, &c.GroupSortOrder, &c.Fixed, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

func (s *Store) CreateCategory(ctx context.Context, c *Category) error {
	// Auto-assign sort_order if not set
	if c.SortOrder == 0 {
		var maxSort sql.NullInt64
		err := s.db.QueryRowContext(ctx,
			`SELECT MAX(sort_order) FROM budget_categories WHERE type = $1 AND group_name = $2`,
			c.Type, c.GroupName,
		).Scan(&maxSort)
		if err != nil {
			return err
		}
		if maxSort.Valid {
			c.SortOrder = int(maxSort.Int64) + 10
		} else {
			c.SortOrder = 10
		}
	}
	return s.db.QueryRowContext(ctx,
		`INSERT INTO budget_categories (name, type, sort_order, group_name, group_sort_order, fixed)
		 VALUES ($1, $2, $3, $4, $5, $6)
		 RETURNING id, created_at, updated_at`,
		c.Name, c.Type, c.SortOrder, c.GroupName, c.GroupSortOrder, c.Fixed,
	).Scan(&c.ID, &c.CreatedAt, &c.UpdatedAt)
}

func (s *Store) UpdateCategory(ctx context.Context, c *Category) error {
	return s.db.QueryRowContext(ctx,
		`UPDATE budget_categories
		 SET name = $2, type = $3, sort_order = $4, archived = $5,
		     group_name = $6, group_sort_order = $7, fixed = $8, updated_at = NOW()
		 WHERE id = $1
		 RETURNING updated_at`,
		c.ID, c.Name, c.Type, c.SortOrder, c.Archived, c.GroupName, c.GroupSortOrder, c.Fixed,
	).Scan(&c.UpdatedAt)
}

func (s *Store) DeleteCategory(ctx context.Context, id int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(ctx, "DELETE FROM budget_entries WHERE category_id = $1", id); err != nil {
		return err
	}
	result, err := tx.ExecContext(ctx, "DELETE FROM budget_categories WHERE id = $1", id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("category not found")
	}
	return tx.Commit()
}

func (s *Store) ReorderCategories(ctx context.Context, categoryIDs []int) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	for i, id := range categoryIDs {
		_, err := tx.ExecContext(ctx,
			"UPDATE budget_categories SET sort_order = $1, updated_at = NOW() WHERE id = $2",
			(i+1)*10, id,
		)
		if err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Store) GetCategory(ctx context.Context, id int) (*Category, error) {
	var c Category
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, type, sort_order, archived, group_name, group_sort_order, fixed, created_at, updated_at
		 FROM budget_categories WHERE id = $1`, id,
	).Scan(&c.ID, &c.Name, &c.Type, &c.SortOrder, &c.Archived, &c.GroupName, &c.GroupSortOrder, &c.Fixed, &c.CreatedAt, &c.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return &c, nil
}

func (s *Store) CategoryCount(ctx context.Context) (int, error) {
	var count int
	err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM budget_categories").Scan(&count)
	return count, err
}

// Periods

func (s *Store) ListPeriods(ctx context.Context) ([]Period, error) {
	rows, err := s.db.QueryContext(ctx,
		"SELECT id, year, month, notes, created_at FROM budget_periods ORDER BY year DESC, month DESC")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var periods []Period
	for rows.Next() {
		var p Period
		if err := rows.Scan(&p.ID, &p.Year, &p.Month, &p.Notes, &p.CreatedAt); err != nil {
			return nil, err
		}
		periods = append(periods, p)
	}
	return periods, rows.Err()
}

func (s *Store) CreatePeriod(ctx context.Context, p *Period) error {
	return s.db.QueryRowContext(ctx,
		`INSERT INTO budget_periods (year, month) VALUES ($1, $2) RETURNING id, notes, created_at`,
		p.Year, p.Month,
	).Scan(&p.ID, &p.Notes, &p.CreatedAt)
}

func (s *Store) GetPeriodSummary(ctx context.Context, year, month int) (*PeriodSummary, error) {
	var p Period
	err := s.db.QueryRowContext(ctx,
		"SELECT id, year, month, notes, created_at FROM budget_periods WHERE year = $1 AND month = $2",
		year, month,
	).Scan(&p.ID, &p.Year, &p.Month, &p.Notes, &p.CreatedAt)
	if err != nil {
		return nil, err
	}

	rows, err := s.db.QueryContext(ctx,
		`SELECT COALESCE(e.id, 0), $1, c.id, c.name, c.type, c.group_name, c.fixed,
		        COALESCE(e.planned_amount, 0), COALESCE(e.actual_amount, 0)
		 FROM budget_categories c
		 LEFT JOIN budget_entries e ON e.category_id = c.id AND e.period_id = $1
		 WHERE c.archived = FALSE
		 ORDER BY c.group_sort_order, c.sort_order, c.id`, p.ID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []Entry
	totalPlannedIncome := 0.0
	totalActualIncome := 0.0
	totalPlannedExpenses := 0.0
	totalActualExpenses := 0.0

	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.PeriodID, &e.CategoryID, &e.CategoryName, &e.CategoryType,
			&e.CategoryGroupName, &e.CategoryFixed,
			&e.PlannedAmount, &e.ActualAmount); err != nil {
			return nil, err
		}

		planned, _ := strconv.ParseFloat(e.PlannedAmount, 64)
		actual, _ := strconv.ParseFloat(e.ActualAmount, 64)

		if e.CategoryType == "income" {
			totalPlannedIncome += planned
			totalActualIncome += actual
		} else {
			totalPlannedExpenses += planned
			totalActualExpenses += actual
		}

		entries = append(entries, e)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	return &PeriodSummary{
		PeriodID:             p.ID,
		Year:                 p.Year,
		Month:                p.Month,
		Notes:                p.Notes,
		Entries:              entries,
		TotalPlannedIncome:   formatAmount(totalPlannedIncome),
		TotalActualIncome:    formatAmount(totalActualIncome),
		TotalPlannedExpenses: formatAmount(totalPlannedExpenses),
		TotalActualExpenses:  formatAmount(totalActualExpenses),
		PlannedBalance:       formatAmount(totalPlannedIncome - totalPlannedExpenses),
		ActualBalance:        formatAmount(totalActualIncome - totalActualExpenses),
	}, nil
}

// Entries

func (s *Store) UpsertEntry(ctx context.Context, periodID, categoryID int, plannedAmount *string, actualAmount *string) (*Entry, error) {
	// Check if category is fixed
	var fixed bool
	err := s.db.QueryRowContext(ctx,
		"SELECT fixed FROM budget_categories WHERE id = $1", categoryID,
	).Scan(&fixed)
	if err != nil {
		return nil, err
	}

	if fixed {
		if plannedAmount == nil && actualAmount != nil {
			return nil, &FixedCategoryError{msg: "cannot set actual_amount directly on a fixed category; update planned_amount instead"}
		}
		// For fixed categories, actual always equals planned
		if plannedAmount != nil {
			actualAmount = plannedAmount
		}
	}

	var e Entry

	if plannedAmount != nil && actualAmount != nil {
		err := s.db.QueryRowContext(ctx,
			`INSERT INTO budget_entries (period_id, category_id, planned_amount, actual_amount)
			 VALUES ($1, $2, $3, $4)
			 ON CONFLICT (period_id, category_id) DO UPDATE SET planned_amount = $3, actual_amount = $4
			 RETURNING id, period_id, category_id, planned_amount, actual_amount`,
			periodID, categoryID, *plannedAmount, *actualAmount,
		).Scan(&e.ID, &e.PeriodID, &e.CategoryID, &e.PlannedAmount, &e.ActualAmount)
		if err != nil {
			return nil, err
		}
	} else if plannedAmount != nil {
		// For fixed categories this branch won't be reached (actualAmount was set above),
		// but keep it for non-fixed planned-only updates.
		err := s.db.QueryRowContext(ctx,
			`INSERT INTO budget_entries (period_id, category_id, planned_amount)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (period_id, category_id) DO UPDATE SET planned_amount = $3
			 RETURNING id, period_id, category_id, planned_amount, actual_amount`,
			periodID, categoryID, *plannedAmount,
		).Scan(&e.ID, &e.PeriodID, &e.CategoryID, &e.PlannedAmount, &e.ActualAmount)
		if err != nil {
			return nil, err
		}
	} else if actualAmount != nil {
		err := s.db.QueryRowContext(ctx,
			`INSERT INTO budget_entries (period_id, category_id, actual_amount)
			 VALUES ($1, $2, $3)
			 ON CONFLICT (period_id, category_id) DO UPDATE SET actual_amount = $3
			 RETURNING id, period_id, category_id, planned_amount, actual_amount`,
			periodID, categoryID, *actualAmount,
		).Scan(&e.ID, &e.PeriodID, &e.CategoryID, &e.PlannedAmount, &e.ActualAmount)
		if err != nil {
			return nil, err
		}
	} else {
		return nil, fmt.Errorf("at least one of planned_amount or actual_amount must be provided")
	}

	err = s.db.QueryRowContext(ctx,
		"SELECT name, type, group_name, fixed FROM budget_categories WHERE id = $1", categoryID,
	).Scan(&e.CategoryName, &e.CategoryType, &e.CategoryGroupName, &e.CategoryFixed)
	if err != nil {
		return nil, err
	}

	return &e, nil
}

// FixedCategoryError is returned when trying to directly set actual on a fixed category.
type FixedCategoryError struct {
	msg string
}

func (e *FixedCategoryError) Error() string {
	return e.msg
}

func (s *Store) DeleteEntry(ctx context.Context, id int) error {
	result, err := s.db.ExecContext(ctx, "DELETE FROM budget_entries WHERE id = $1", id)
	if err != nil {
		return err
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("entry not found")
	}
	return nil
}

func (s *Store) GetPeriodByYearMonth(ctx context.Context, year, month int) (*Period, error) {
	var p Period
	err := s.db.QueryRowContext(ctx,
		"SELECT id, year, month, notes, created_at FROM budget_periods WHERE year = $1 AND month = $2",
		year, month,
	).Scan(&p.ID, &p.Year, &p.Month, &p.Notes, &p.CreatedAt)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func (s *Store) CopyPeriodEntries(ctx context.Context, fromPeriodID, toPeriodID int) error {
	_, err := s.db.ExecContext(ctx,
		`INSERT INTO budget_entries (period_id, category_id, planned_amount, actual_amount)
		 SELECT $2, e.category_id, e.planned_amount,
		        CASE WHEN c.fixed THEN e.planned_amount ELSE 0 END
		 FROM budget_entries e
		 JOIN budget_categories c ON c.id = e.category_id
		 WHERE e.period_id = $1
		 ON CONFLICT (period_id, category_id) DO UPDATE
		   SET planned_amount = EXCLUDED.planned_amount,
		       actual_amount = EXCLUDED.actual_amount`,
		fromPeriodID, toPeriodID,
	)
	return err
}

func formatAmount(f float64) string {
	rounded := math.Round(f*100) / 100
	return strconv.FormatFloat(rounded, 'f', 2, 64)
}

package budget

import (
	"context"
	"database/sql"
	"fmt"
	"math"
	"strconv"
)

type Store struct {
	db *sql.DB
}

func NewStore(db *sql.DB) *Store {
	return &Store{db: db}
}

// Categories

func (s *Store) ListCategories(ctx context.Context, includeArchived bool) ([]Category, error) {
	query := "SELECT id, name, type, frequency, sort_order, archived, created_at, updated_at FROM budget_categories"
	if !includeArchived {
		query += " WHERE archived = FALSE"
	}
	query += " ORDER BY sort_order, id"

	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var cats []Category
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Type, &c.Frequency, &c.SortOrder, &c.Archived, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		cats = append(cats, c)
	}
	return cats, rows.Err()
}

func (s *Store) CreateCategory(ctx context.Context, c *Category) error {
	return s.db.QueryRowContext(ctx,
		`INSERT INTO budget_categories (name, type, frequency, sort_order)
		 VALUES ($1, $2, $3, $4)
		 RETURNING id, created_at, updated_at`,
		c.Name, c.Type, c.Frequency, c.SortOrder,
	).Scan(&c.ID, &c.CreatedAt, &c.UpdatedAt)
}

func (s *Store) UpdateCategory(ctx context.Context, c *Category) error {
	return s.db.QueryRowContext(ctx,
		`UPDATE budget_categories
		 SET name = $2, type = $3, frequency = $4, sort_order = $5, archived = $6, updated_at = NOW()
		 WHERE id = $1
		 RETURNING updated_at`,
		c.ID, c.Name, c.Type, c.Frequency, c.SortOrder, c.Archived,
	).Scan(&c.UpdatedAt)
}

func (s *Store) DeleteCategory(ctx context.Context, id int) error {
	var count int
	if err := s.db.QueryRowContext(ctx, "SELECT COUNT(*) FROM budget_entries WHERE category_id = $1", id).Scan(&count); err != nil {
		return err
	}
	if count > 0 {
		return fmt.Errorf("category is in use by %d entries", count)
	}
	_, err := s.db.ExecContext(ctx, "DELETE FROM budget_categories WHERE id = $1", id)
	return err
}

func (s *Store) GetCategory(ctx context.Context, id int) (*Category, error) {
	var c Category
	err := s.db.QueryRowContext(ctx,
		"SELECT id, name, type, frequency, sort_order, archived, created_at, updated_at FROM budget_categories WHERE id = $1", id,
	).Scan(&c.ID, &c.Name, &c.Type, &c.Frequency, &c.SortOrder, &c.Archived, &c.CreatedAt, &c.UpdatedAt)
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
	rows, err := s.db.QueryContext(ctx, "SELECT id, year, month, notes, created_at FROM budget_periods ORDER BY year DESC, month DESC")
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
		`SELECT e.id, e.period_id, e.category_id, c.name, c.type, c.frequency, e.amount
		 FROM budget_entries e
		 JOIN budget_categories c ON c.id = e.category_id
		 WHERE e.period_id = $1
		 ORDER BY c.sort_order, c.id`, p.ID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var entries []Entry
	totalIncome := 0.0
	totalExpenses := 0.0
	totalMonthlyExpenses := 0.0

	for rows.Next() {
		var e Entry
		if err := rows.Scan(&e.ID, &e.PeriodID, &e.CategoryID, &e.CategoryName, &e.CategoryType, &e.CategoryFrequency, &e.Amount); err != nil {
			return nil, err
		}

		amt, _ := strconv.ParseFloat(e.Amount, 64)

		if e.CategoryFrequency == "yearly" {
			e.MonthlyEquivalent = formatAmount(amt / 12)
		} else {
			e.MonthlyEquivalent = e.Amount
		}

		monthlyAmt, _ := strconv.ParseFloat(e.MonthlyEquivalent, 64)

		if e.CategoryType == "income" {
			totalIncome += monthlyAmt
		} else {
			totalExpenses += amt
			totalMonthlyExpenses += monthlyAmt
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
		TotalIncome:          formatAmount(totalIncome),
		TotalExpenses:        formatAmount(totalExpenses),
		TotalMonthlyExpenses: formatAmount(totalMonthlyExpenses),
		Balance:              formatAmount(totalIncome - totalMonthlyExpenses),
	}, nil
}

// Entries

func (s *Store) UpsertEntry(ctx context.Context, periodID, categoryID int, amount string) (*Entry, error) {
	var e Entry
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO budget_entries (period_id, category_id, amount)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (period_id, category_id) DO UPDATE SET amount = EXCLUDED.amount
		 RETURNING id, period_id, category_id, amount`,
		periodID, categoryID, amount,
	).Scan(&e.ID, &e.PeriodID, &e.CategoryID, &e.Amount)
	if err != nil {
		return nil, err
	}

	// Fetch category info
	err = s.db.QueryRowContext(ctx,
		"SELECT name, type, frequency FROM budget_categories WHERE id = $1", categoryID,
	).Scan(&e.CategoryName, &e.CategoryType, &e.CategoryFrequency)
	if err != nil {
		return nil, err
	}

	amt, _ := strconv.ParseFloat(e.Amount, 64)
	if e.CategoryFrequency == "yearly" {
		e.MonthlyEquivalent = formatAmount(amt / 12)
	} else {
		e.MonthlyEquivalent = e.Amount
	}

	return &e, nil
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
		`INSERT INTO budget_entries (period_id, category_id, amount)
		 SELECT $2, category_id, amount FROM budget_entries WHERE period_id = $1
		 ON CONFLICT (period_id, category_id) DO UPDATE SET amount = EXCLUDED.amount`,
		fromPeriodID, toPeriodID,
	)
	return err
}

func formatAmount(f float64) string {
	rounded := math.Round(f*100) / 100
	return strconv.FormatFloat(rounded, 'f', 2, 64)
}

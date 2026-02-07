package budget

import "time"

type Category struct {
	ID        int       `json:"id"`
	Name      string    `json:"name"`
	Type      string    `json:"type"`
	Frequency string    `json:"frequency"`
	SortOrder int       `json:"sort_order"`
	Archived  bool      `json:"archived"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

type Period struct {
	ID        int       `json:"id"`
	Year      int       `json:"year"`
	Month     int       `json:"month"`
	Notes     string    `json:"notes"`
	CreatedAt time.Time `json:"created_at"`
}

type Entry struct {
	ID                int    `json:"id"`
	PeriodID          int    `json:"period_id"`
	CategoryID        int    `json:"category_id"`
	CategoryName      string `json:"category_name"`
	CategoryType      string `json:"category_type"`
	CategoryFrequency string `json:"category_frequency"`
	Amount            string `json:"amount"`
	MonthlyEquivalent string `json:"monthly_equivalent"`
}

type PeriodSummary struct {
	PeriodID             int     `json:"period_id"`
	Year                 int     `json:"year"`
	Month                int     `json:"month"`
	Notes                string  `json:"notes"`
	Entries              []Entry `json:"entries"`
	TotalIncome          string  `json:"total_income"`
	TotalExpenses        string  `json:"total_expenses"`
	TotalMonthlyExpenses string  `json:"total_monthly_expenses"`
	Balance              string  `json:"balance"`
}

package budget

import "time"

type Category struct {
	ID             int       `json:"id"`
	Name           string    `json:"name"`
	Type           string    `json:"type"`
	SortOrder      int       `json:"sort_order"`
	Archived       bool      `json:"archived"`
	GroupName      string    `json:"group_name"`
	GroupSortOrder int       `json:"group_sort_order"`
	Fixed          bool      `json:"fixed"`
	CreatedAt      time.Time `json:"created_at"`
	UpdatedAt      time.Time `json:"updated_at"`
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
	CategoryGroupName string `json:"category_group_name"`
	CategoryFixed     bool   `json:"category_fixed"`
	PlannedAmount     string `json:"planned_amount"`
	ActualAmount      string `json:"actual_amount"`
}

type PeriodSummary struct {
	PeriodID             int     `json:"period_id"`
	Year                 int     `json:"year"`
	Month                int     `json:"month"`
	Notes                string  `json:"notes"`
	Entries              []Entry `json:"entries"`
	TotalPlannedIncome   string  `json:"total_planned_income"`
	TotalActualIncome    string  `json:"total_actual_income"`
	TotalPlannedExpenses string  `json:"total_planned_expenses"`
	TotalActualExpenses  string  `json:"total_actual_expenses"`
	PlannedBalance       string  `json:"planned_balance"`
	ActualBalance        string  `json:"actual_balance"`
}

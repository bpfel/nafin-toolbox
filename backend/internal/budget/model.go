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
	PlanID    *int      `json:"plan_id"`
	CreatedAt time.Time `json:"created_at"`
}

type Entry struct {
	ID                       int    `json:"id"`
	PeriodID                 int    `json:"period_id"`
	CategoryID               int    `json:"category_id"`
	CategoryName             string `json:"category_name"`
	CategoryType             string `json:"category_type"`
	CategoryFrequency        string `json:"category_frequency"`
	PlannedAmount            string `json:"planned_amount"`
	ActualAmount             string `json:"actual_amount"`
	Variance                 string `json:"variance"`
	PlannedMonthlyEquivalent string `json:"planned_monthly_equivalent"`
	ActualMonthlyEquivalent  string `json:"actual_monthly_equivalent"`
}

type PeriodSummary struct {
	PeriodID             int     `json:"period_id"`
	Year                 int     `json:"year"`
	Month                int     `json:"month"`
	Notes                string  `json:"notes"`
	PlanID               *int    `json:"plan_id"`
	PlanName             string  `json:"plan_name"`
	Entries              []Entry `json:"entries"`
	TotalPlannedIncome   string  `json:"total_planned_income"`
	TotalActualIncome    string  `json:"total_actual_income"`
	TotalPlannedExpenses string  `json:"total_planned_expenses"`
	TotalActualExpenses  string  `json:"total_actual_expenses"`
	TotalPlannedMonthly  string  `json:"total_planned_monthly"`
	TotalActualMonthly   string  `json:"total_actual_monthly"`
	PlannedBalance       string  `json:"planned_balance"`
	ActualBalance        string  `json:"actual_balance"`
}

type Plan struct {
	ID                 int       `json:"id"`
	Name               string    `json:"name"`
	EffectiveFromYear  int       `json:"effective_from_year"`
	EffectiveFromMonth int       `json:"effective_from_month"`
	Notes              string    `json:"notes"`
	CreatedAt          time.Time `json:"created_at"`
}

type PlanEntry struct {
	ID                int    `json:"id"`
	PlanID            int    `json:"plan_id"`
	CategoryID        int    `json:"category_id"`
	CategoryName      string `json:"category_name"`
	CategoryType      string `json:"category_type"`
	CategoryFrequency string `json:"category_frequency"`
	Amount            string `json:"amount"`
}

type PlanDetail struct {
	Plan    Plan        `json:"plan"`
	Entries []PlanEntry `json:"entries"`
}

# Budget Module Implementation Plan

Saved from conversation on 2026-02-07. Ready to implement once branch handling is set up.

## Overview
First domain module. Monthly budget with income/categorized expenses, yearly expenses as monthly equivalents. Default categories from BFS (Swiss Federal Statistical Office) HABE 2023 data for single person.

## Database — `002_budget.sql`
3 tables:
- **budget_categories**: id, name, type (income/expense), frequency (monthly/yearly), sort_order, archived, timestamps
- **budget_periods**: id, year, month, notes, timestamps. UNIQUE(year, month)
- **budget_entries**: id, period_id FK, category_id FK, amount NUMERIC(12,2). UNIQUE(period_id, category_id)
- Yearly categories store full yearly amount; API computes monthly_equivalent = amount / 12

## Default Categories (BFS-based, single person)
| Category | Type | Freq | Default CHF |
|---|---|---|---|
| Salary (net) | income | monthly | 6,000 |
| Housing (rent + utilities) | expense | monthly | 1,500 |
| Health Insurance | expense | yearly | 4,700 |
| Food & Groceries | expense | monthly | 500 |
| Transportation | expense | monthly | 400 |
| Taxes | expense | yearly | 10,000 |
| Other Insurance | expense | yearly | 2,000 |
| Telecommunications | expense | monthly | 80 |
| Clothing & Footwear | expense | monthly | 100 |
| Entertainment & Recreation | expense | monthly | 250 |
| Dining Out | expense | monthly | 250 |
| Savings | expense | monthly | 500 |

Seeding creates categories + current month period with entries pre-filled.

## Backend — `backend/internal/budget/`
4 files: model.go, store.go, defaults.go, handler.go

### Endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | /api/budget/categories | List (opt ?include_archived=true) |
| POST | /api/budget/categories | Create |
| PUT | /api/budget/categories/{id} | Update |
| DELETE | /api/budget/categories/{id} | Delete (fails if in use) |
| GET | /api/budget/periods | List all |
| POST | /api/budget/periods | Create |
| GET | /api/budget/periods/{year}/{month} | Budget summary |
| PUT | /api/budget/periods/{year}/{month}/entries | Upsert entry |
| DELETE | /api/budget/entries/{id} | Delete entry |
| POST | /api/budget/periods/{year}/{month}/copy | Copy from another month |
| POST | /api/budget/seed-defaults | Seed defaults |

### Also needed in server.go
- Wire budget routes
- Add POST /api/modules and DELETE /api/modules/{id} for module enable/disable

## Frontend — `frontend/src/modules/budget/`
Components: BudgetModule, BudgetSummary, BudgetTable, BudgetEntryRow, CategoryManager, MonthSelector, BudgetSetup

### Navigation
- State-based router in App.svelte: `activeModule: string | null`
- Module card click → render module component, back button → grid

### API client extensions
- Types + fetch functions for all budget endpoints
- Module enable/disable functions

## Implementation Order
1. Migration 002_budget.sql
2. Go models (model.go)
3. Go store (store.go)
4. Defaults (defaults.go)
5. Go handlers (handler.go)
6. Server wiring (server.go)
7. API client (client.ts)
8. Frontend components (bottom-up)
9. App.svelte navigation wiring
10. README update (BFS sources)

## BFS Sources to Document
- BFS Household Budget Survey 2023
- BFS Household Expenditure Details
- BFS HABE 2023 Press Release (CHF 7,186 disposable income)
- Budgetberatung.ch Templates
- DemoSCOPE HABE Survey

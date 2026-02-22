# Feature: Budget Onboarding Wizard

**Branch:** `feature/onboarding`

## What This Feature Does

A 7-step guided wizard that helps new users set up their budget with Swiss-specific calculations built in.

### The Wizard Steps

1. **Welcome** — Choose between Quick Setup (empty budget) or Guided Setup (wizard)
2. **Income** — Enter monthly net salary in CHF (minimum CHF 1,000)
3. **Age** — Used to estimate health insurance premium (editable if user knows their actual premium)
4. **Rent** — Monthly rent with typical Swiss values shown
5. **Food** — Budget slider with preset options (default CHF 650)
6. **Goal** — Choose financial goal:
   - **Invest** — 70% to investments, 30% to savings
   - **Save** — 80% to savings, 20% to investments
   - **Save for Goal** — Target amount + timeline (e.g., CHF 10,000 for a car in 12 months)
7. **Preview** — See 12-month savings projection before confirming

### Swiss-Specific Logic

**Tax brackets** (simplified progressive rates based on yearly income):
| Yearly Income | Tax Rate |
|---------------|----------|
| ≤ CHF 40,000 | 8% |
| ≤ CHF 80,000 | 12% |
| ≤ CHF 120,000 | 15% |
| ≤ CHF 180,000 | 18% |
| > CHF 180,000 | 22% |

**Health insurance by age** (Grundversicherung estimates):
| Age Group | Monthly Premium |
|-----------|-----------------|
| < 19 | CHF 120 |
| 19-25 | CHF 280 |
| 26-34 | CHF 350 |
| 35-44 | CHF 380 |
| 45-54 | CHF 420 |
| 55-64 | CHF 480 |
| 65+ | CHF 520 |

### Auto-Generated Budget Categories

When the wizard completes, it creates these categories:
- **Employment:** Salary (net)
- **Housing:** Rent, Utilities
- **Insurance & Taxes:** Health Insurance, Taxes
- **Living:** Food & Groceries, Transportation, Telecommunications
- **Lifestyle:** Clothing, Entertainment, Dining Out
- **Savings & Investments:** Based on chosen goal

### Technical Features

- Progress saved to localStorage (survives page refresh)
- Keyboard navigation (Enter = next, Escape = back)
- Mobile-first responsive design
- Step animations with directional sliding
- Validation per step (can't proceed until valid input)

## Files Added/Modified

### Core Wizard Components
```
frontend/src/modules/budget/wizard/
├── BudgetWizard.svelte       # Main wizard container
├── WizardProgress.svelte     # Step indicator
├── WizardNav.svelte          # Back/Next buttons
├── WizardIllustration.svelte # Step illustrations
├── wizardCalculations.ts     # Tax/insurance/budget logic
└── steps/
    ├── WelcomeStep.svelte
    ├── IncomeStep.svelte
    ├── AgeStep.svelte
    ├── RentStep.svelte
    ├── FoodStep.svelte
    ├── GoalStep.svelte
    └── PreviewStep.svelte
```

### Integration

This branch adds the wizard on top of `main`. Key integration points:
- `BudgetModule.svelte` — Shows wizard when budget has no categories
- `budgetEngine.ts` — New `seedFromWizard()` function creates categories from wizard data

## Running Locally

```bash
# Frontend dev server
cd frontend
npm install
npm run dev

# Or with Docker
docker-compose up
```

## Next Steps

After merging, the wizard will be available when a user enables the Budget module for the first time.

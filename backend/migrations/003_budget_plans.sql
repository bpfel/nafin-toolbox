-- Budget plans: templates for monthly budgets with planned vs actual tracking

CREATE TABLE IF NOT EXISTS budget_plans (
    id                   SERIAL PRIMARY KEY,
    name                 TEXT NOT NULL,
    effective_from_year  INTEGER NOT NULL,
    effective_from_month INTEGER NOT NULL CHECK (effective_from_month BETWEEN 1 AND 12),
    notes                TEXT NOT NULL DEFAULT '',
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(effective_from_year, effective_from_month)
);

CREATE TABLE IF NOT EXISTS budget_plan_entries (
    id          SERIAL PRIMARY KEY,
    plan_id     INTEGER NOT NULL REFERENCES budget_plans(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES budget_categories(id),
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE(plan_id, category_id)
);

-- Add plan reference to periods
ALTER TABLE budget_periods ADD COLUMN IF NOT EXISTS plan_id INTEGER REFERENCES budget_plans(id);

-- Rename amount to planned_amount and add actual_amount
ALTER TABLE budget_entries RENAME COLUMN amount TO planned_amount;
ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

-- Data migration: create "Initial Plan" from earliest period if data exists
DO $$
DECLARE
    v_period_id INTEGER;
    v_plan_id INTEGER;
    v_year INTEGER;
    v_month INTEGER;
BEGIN
    -- Find the earliest period
    SELECT id, year, month INTO v_period_id, v_year, v_month
    FROM budget_periods
    ORDER BY year ASC, month ASC
    LIMIT 1;

    IF v_period_id IS NOT NULL THEN
        -- Create the initial plan
        INSERT INTO budget_plans (name, effective_from_year, effective_from_month, notes)
        VALUES ('Initial Plan', v_year, v_month, 'Auto-created from existing budget data')
        RETURNING id INTO v_plan_id;

        -- Copy entries from that period into plan entries
        INSERT INTO budget_plan_entries (plan_id, category_id, amount)
        SELECT v_plan_id, category_id, planned_amount
        FROM budget_entries
        WHERE period_id = v_period_id;

        -- Link all existing periods to this plan
        UPDATE budget_periods SET plan_id = v_plan_id;
    END IF;
END $$;

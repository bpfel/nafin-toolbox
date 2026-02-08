-- Split budget entries into planned vs actual amounts

ALTER TABLE budget_entries RENAME COLUMN amount TO planned_amount;
ALTER TABLE budget_entries ADD COLUMN IF NOT EXISTS actual_amount NUMERIC(12,2) NOT NULL DEFAULT 0;

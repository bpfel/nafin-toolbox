-- Add category groups and fixed flag for recurring fixed-amount categories

ALTER TABLE budget_categories ADD COLUMN group_name TEXT NOT NULL DEFAULT '';
ALTER TABLE budget_categories ADD COLUMN group_sort_order INTEGER NOT NULL DEFAULT 0;
ALTER TABLE budget_categories ADD COLUMN fixed BOOLEAN NOT NULL DEFAULT FALSE;

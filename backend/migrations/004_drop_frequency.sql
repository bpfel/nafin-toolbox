-- Remove frequency column from budget_categories.
-- All amounts are now stored as monthly values; yearly display is a frontend computation.

-- Convert existing yearly amounts to monthly equivalents before dropping frequency
UPDATE budget_entries
SET planned_amount = planned_amount / 12,
    actual_amount  = actual_amount / 12
FROM budget_categories
WHERE budget_entries.category_id = budget_categories.id
  AND budget_categories.frequency = 'yearly';

ALTER TABLE budget_categories DROP COLUMN frequency;

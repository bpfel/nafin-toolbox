-- Increase decimal precision from 2 to 4 places so that yearly÷12 round-trips correctly.
-- Example: 10000/yr → 833.3333/mo → ×12 = 9999.9996 → displays as 10'000.00
ALTER TABLE budget_entries ALTER COLUMN planned_amount TYPE NUMERIC(14,4);
ALTER TABLE budget_entries ALTER COLUMN actual_amount TYPE NUMERIC(14,4);

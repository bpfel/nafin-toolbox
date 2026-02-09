-- Create the groups table
CREATE TABLE budget_category_groups (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, type)
);

-- Populate from existing categories (one group per distinct name+type)
INSERT INTO budget_category_groups (name, type, sort_order)
SELECT group_name, type, MIN(group_sort_order)
FROM budget_categories
WHERE group_name != ''
GROUP BY group_name, type;

-- Add FK column
ALTER TABLE budget_categories ADD COLUMN group_id INTEGER REFERENCES budget_category_groups(id);

-- Backfill FK from name+type match
UPDATE budget_categories c
SET group_id = g.id
FROM budget_category_groups g
WHERE c.group_name = g.name AND c.type = g.type;

-- Drop old columns
ALTER TABLE budget_categories DROP COLUMN group_name;
ALTER TABLE budget_categories DROP COLUMN group_sort_order;

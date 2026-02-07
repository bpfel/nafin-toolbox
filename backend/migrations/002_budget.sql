CREATE TABLE IF NOT EXISTS budget_categories (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    frequency  TEXT NOT NULL CHECK (frequency IN ('monthly', 'yearly')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived   BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS budget_periods (
    id         SERIAL PRIMARY KEY,
    year       INTEGER NOT NULL,
    month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    notes      TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(year, month)
);

CREATE TABLE IF NOT EXISTS budget_entries (
    id          SERIAL PRIMARY KEY,
    period_id   INTEGER NOT NULL REFERENCES budget_periods(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES budget_categories(id),
    amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
    UNIQUE(period_id, category_id)
);

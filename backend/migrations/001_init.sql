CREATE TABLE IF NOT EXISTS modules (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    enabled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE budget_category_groups (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(name, type)
);

CREATE TABLE budget_categories (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    type       TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    archived   BOOLEAN NOT NULL DEFAULT FALSE,
    fixed      BOOLEAN NOT NULL DEFAULT FALSE,
    group_id   INTEGER REFERENCES budget_category_groups(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE budget_periods (
    id         SERIAL PRIMARY KEY,
    year       INTEGER NOT NULL,
    month      INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
    notes      TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(year, month)
);

CREATE TABLE budget_entries (
    id              SERIAL PRIMARY KEY,
    period_id       INTEGER NOT NULL REFERENCES budget_periods(id) ON DELETE CASCADE,
    category_id     INTEGER NOT NULL REFERENCES budget_categories(id),
    planned_amount  NUMERIC(14,4) NOT NULL DEFAULT 0,
    actual_amount   NUMERIC(14,4) NOT NULL DEFAULT 0,
    UNIQUE(period_id, category_id)
);

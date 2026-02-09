package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

// Migrate runs all pending SQL migrations from the given directory.
// It tracks applied migrations in a schema_migrations table.
// An advisory lock serializes concurrent callers (e.g. parallel test packages).
func Migrate(db *sql.DB, migrationsDir string) error {
	// Serialize migrations across concurrent processes sharing the same DB.
	if _, err := db.Exec("SELECT pg_advisory_lock(1)"); err != nil {
		return fmt.Errorf("acquiring migration lock: %w", err)
	}
	defer db.Exec("SELECT pg_advisory_unlock(1)")

	if err := ensureMigrationsTable(db); err != nil {
		return fmt.Errorf("creating schema_migrations table: %w", err)
	}

	applied, err := getAppliedMigrations(db)
	if err != nil {
		return fmt.Errorf("reading applied migrations: %w", err)
	}

	files, err := listMigrationFiles(migrationsDir)
	if err != nil {
		return fmt.Errorf("listing migration files: %w", err)
	}

	for _, f := range files {
		if applied[f] {
			continue
		}

		content, err := os.ReadFile(filepath.Join(migrationsDir, f))
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", f, err)
		}

		tx, err := db.Begin()
		if err != nil {
			return fmt.Errorf("beginning transaction for %s: %w", f, err)
		}

		if _, err := tx.Exec(string(content)); err != nil {
			tx.Rollback()
			return fmt.Errorf("executing migration %s: %w", f, err)
		}

		if _, err := tx.Exec("INSERT INTO schema_migrations (filename) VALUES ($1)", f); err != nil {
			tx.Rollback()
			return fmt.Errorf("recording migration %s: %w", f, err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("committing migration %s: %w", f, err)
		}

		log.Printf("Applied migration: %s", f)
	}

	return nil
}

func ensureMigrationsTable(db *sql.DB) error {
	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			filename   TEXT PRIMARY KEY,
			applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
		)
	`)
	if err != nil {
		// Handle race condition: concurrent CREATE TABLE IF NOT EXISTS can fail
		// with a pg_type unique violation even though the table now exists.
		var exists bool
		if db.QueryRow("SELECT EXISTS (SELECT FROM pg_tables WHERE tablename = 'schema_migrations')").Scan(&exists) == nil && exists {
			return nil
		}
	}
	return err
}

func getAppliedMigrations(db *sql.DB) (map[string]bool, error) {
	rows, err := db.Query("SELECT filename FROM schema_migrations")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	applied := make(map[string]bool)
	for rows.Next() {
		var f string
		if err := rows.Scan(&f); err != nil {
			return nil, err
		}
		applied[f] = true
	}
	return applied, rows.Err()
}

func listMigrationFiles(dir string) ([]string, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}

	var files []string
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			files = append(files, e.Name())
		}
	}
	sort.Strings(files)
	return files, nil
}

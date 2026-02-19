package database

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestListMigrationFiles_EmptyDirectory(t *testing.T) {
	tmpDir := t.TempDir()

	files, err := listMigrationFiles(tmpDir)
	if err != nil {
		t.Fatalf("listMigrationFiles: %v", err)
	}

	if len(files) != 0 {
		t.Errorf("expected 0 files in empty directory, got %d", len(files))
	}
}

func TestListMigrationFiles_OnlySQLFiles(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a mix of .sql and non-.sql files
	mustWriteFile(t, tmpDir, "001_init.sql", "CREATE TABLE test;")
	mustWriteFile(t, tmpDir, "002_users.sql", "CREATE TABLE users;")
	mustWriteFile(t, tmpDir, "README.md", "This is a readme")
	mustWriteFile(t, tmpDir, "notes.txt", "Some notes")
	mustWriteFile(t, tmpDir, ".gitkeep", "")

	files, err := listMigrationFiles(tmpDir)
	if err != nil {
		t.Fatalf("listMigrationFiles: %v", err)
	}

	want := 2
	if len(files) != want {
		t.Errorf("got %d files, want %d", len(files), want)
	}

	// Verify only .sql files are returned
	for _, f := range files {
		if filepath.Ext(f) != ".sql" {
			t.Errorf("non-.sql file returned: %s", f)
		}
	}
}

func TestListMigrationFiles_Ordering(t *testing.T) {
	tmpDir := t.TempDir()

	// Create files in non-sequential order
	mustWriteFile(t, tmpDir, "003_accounts.sql", "")
	mustWriteFile(t, tmpDir, "001_init.sql", "")
	mustWriteFile(t, tmpDir, "010_indexes.sql", "")
	mustWriteFile(t, tmpDir, "002_users.sql", "")

	files, err := listMigrationFiles(tmpDir)
	if err != nil {
		t.Fatalf("listMigrationFiles: %v", err)
	}

	// Verify files are sorted alphabetically
	expected := []string{
		"001_init.sql",
		"002_users.sql",
		"003_accounts.sql",
		"010_indexes.sql",
	}

	if len(files) != len(expected) {
		t.Fatalf("got %d files, want %d", len(files), len(expected))
	}

	for i, want := range expected {
		if files[i] != want {
			t.Errorf("files[%d] = %s, want %s", i, files[i], want)
		}
	}
}

func TestListMigrationFiles_IgnoresSubdirectories(t *testing.T) {
	tmpDir := t.TempDir()

	// Create migration files
	mustWriteFile(t, tmpDir, "001_init.sql", "")

	// Create a subdirectory with a .sql file (should be ignored)
	subDir := filepath.Join(tmpDir, "archived")
	if err := os.Mkdir(subDir, 0755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	mustWriteFile(t, subDir, "old_migration.sql", "")

	files, err := listMigrationFiles(tmpDir)
	if err != nil {
		t.Fatalf("listMigrationFiles: %v", err)
	}

	want := 1
	if len(files) != want {
		t.Errorf("got %d files, want %d (subdirectories should be ignored)", len(files), want)
	}

	if files[0] != "001_init.sql" {
		t.Errorf("got %s, want 001_init.sql", files[0])
	}
}

func TestListMigrationFiles_NonExistentDirectory(t *testing.T) {
	_, err := listMigrationFiles("/nonexistent/path/that/does/not/exist")
	if err == nil {
		t.Error("expected error for nonexistent directory, got nil")
	}
}

func TestListMigrationFiles_CaseSensitivity(t *testing.T) {
	tmpDir := t.TempDir()

	// Create files with different case extensions
	mustWriteFile(t, tmpDir, "001_init.sql", "")
	mustWriteFile(t, tmpDir, "002_users.SQL", "") // Uppercase extension
	mustWriteFile(t, tmpDir, "003_data.Sql", "")  // Mixed case extension

	files, err := listMigrationFiles(tmpDir)
	if err != nil {
		t.Fatalf("listMigrationFiles: %v", err)
	}

	// Only lowercase .sql should match (per current implementation)
	want := 1
	if len(files) != want {
		t.Errorf("got %d files, want %d (only lowercase .sql should match)", len(files), want)
	}
}

func TestListMigrationFiles_SpecialCharacters(t *testing.T) {
	tmpDir := t.TempDir()

	// Create files with special characters in names
	mustWriteFile(t, tmpDir, "001_init.sql", "")
	mustWriteFile(t, tmpDir, "002_add-users.sql", "")
	mustWriteFile(t, tmpDir, "003_fix_bug_#123.sql", "")
	mustWriteFile(t, tmpDir, "004_update (v2).sql", "")

	files, err := listMigrationFiles(tmpDir)
	if err != nil {
		t.Fatalf("listMigrationFiles: %v", err)
	}

	want := 4
	if len(files) != want {
		t.Errorf("got %d files, want %d", len(files), want)
	}
}

func TestListMigrationFiles_EmptyFilename(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a file with just the .sql extension
	mustWriteFile(t, tmpDir, ".sql", "")
	mustWriteFile(t, tmpDir, "001_init.sql", "")

	files, err := listMigrationFiles(tmpDir)
	if err != nil {
		t.Fatalf("listMigrationFiles: %v", err)
	}

	// Both files should be included (filesystem allows .sql as a filename)
	want := 2
	if len(files) != want {
		t.Errorf("got %d files, want %d", len(files), want)
	}
}

func TestListMigrationFiles_LargeNumberOfFiles(t *testing.T) {
	tmpDir := t.TempDir()

	// Create 100 migration files
	for i := 1; i <= 100; i++ {
		filename := filepath.Join(tmpDir, fmt.Sprintf("%03d_migration.sql", i))
		if err := os.WriteFile(filename, []byte(""), 0644); err != nil {
			t.Fatalf("writing file %s: %v", filename, err)
		}
	}

	files, err := listMigrationFiles(tmpDir)
	if err != nil {
		t.Fatalf("listMigrationFiles: %v", err)
	}

	want := 100
	if len(files) != want {
		t.Errorf("got %d files, want %d", len(files), want)
	}

	// Verify ordering of first and last
	if files[0] != "001_migration.sql" {
		t.Errorf("first file = %s, want 001_migration.sql", files[0])
	}
	if files[99] != "100_migration.sql" {
		t.Errorf("last file = %s, want 100_migration.sql", files[99])
	}
}

// Helper function to write test files
func mustWriteFile(t *testing.T, dir, filename, content string) {
	t.Helper()
	path := filepath.Join(dir, filename)
	if err := os.WriteFile(path, []byte(content), 0644); err != nil {
		t.Fatalf("writing file %s: %v", path, err)
	}
}

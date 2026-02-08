package main

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/bpfel/nafin-toolbox/internal/auth"
	"github.com/bpfel/nafin-toolbox/internal/database"
	"github.com/bpfel/nafin-toolbox/internal/server"
)

func main() {
	db, err := database.Connect(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

	migrationsDir := os.Getenv("MIGRATIONS_DIR")
	if migrationsDir == "" {
		migrationsDir = "migrations"
	}
	if err := database.Migrate(db, migrationsDir); err != nil {
		log.Fatalf("failed to run migrations: %v", err)
	}

	// Handle --create-user CLI command
	if len(os.Args) >= 3 && os.Args[1] == "--create-user" {
		createUser(db, os.Args[2])
		return
	}

	srv := server.New(db)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("API server listening on :%s", port)
	if err := srv.ListenAndServe(":" + port); err != nil {
		log.Fatalf("server error: %v", err)
	}
}

func createUser(db *sql.DB, email string) {
	store := auth.NewStore(db)

	existing, err := store.GetUserByEmail(context.Background(), email)
	if err != nil {
		log.Fatalf("checking existing user: %v", err)
	}
	if existing != nil {
		log.Fatalf("user with email %q already exists", email)
	}

	fmt.Print("Enter password: ")
	reader := bufio.NewReader(os.Stdin)
	password, _ := reader.ReadString('\n')
	password = strings.TrimSpace(password)

	if password == "" {
		log.Fatal("password cannot be empty")
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatalf("hashing password: %v", err)
	}

	user, err := store.CreateUser(context.Background(), email, hash, auth.RoleAdmin)
	if err != nil {
		log.Fatalf("creating user: %v", err)
	}

	fmt.Printf("Created user: id=%d email=%s role=%s\n", user.ID, user.Email, user.Role)
}

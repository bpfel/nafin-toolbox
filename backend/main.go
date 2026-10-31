package main

import (
	"bufio"
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/auth"
	"github.com/bpfel/nafin-toolbox/internal/database"
	"github.com/bpfel/nafin-toolbox/internal/email"
	"github.com/bpfel/nafin-toolbox/internal/household"
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

	// Initialize email sender
	var emailSender email.Sender
	smtpCfg := email.SMTPConfig{
		Host:     os.Getenv("SMTP_HOST"),
		Port:     os.Getenv("SMTP_PORT"),
		Username: os.Getenv("SMTP_USERNAME"),
		Password: os.Getenv("SMTP_PASSWORD"),
		From:     os.Getenv("SMTP_FROM"),
	}
	if smtp := email.NewSMTPSender(smtpCfg); smtp != nil {
		emailSender = smtp
		log.Printf("SMTP configured: %s:%s", smtpCfg.Host, smtpCfg.Port)
	} else {
		emailSender = &email.LogSender{}
		log.Println("SMTP not configured — invite emails will be logged only")
	}

	// The server's own secret: it encrypts 2FA secrets at rest. See
	// auth.LoadEncryptionKey for where it may come from.
	encryptionKey, keySource, err := auth.LoadEncryptionKey(os.Getenv, os.ReadFile)
	if err != nil {
		log.Fatalf("encryption key: %v", err)
	}
	if encryptionKey != nil {
		log.Printf("Encryption key loaded from %s — 2FA available", keySource)
	} else {
		log.Println("Neither ENCRYPTION_KEY nor ENCRYPTION_KEY_FILE set — 2FA will not be available")
	}

	appURL := os.Getenv("APP_URL")
	if appURL == "" {
		appURL = "http://localhost:3000"
	}

	// Start background cleanup (every hour)
	authStore := auth.NewStore(db)
	householdStore := household.NewStore(db)
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			ctx := context.Background()
			if err := authStore.DeleteExpiredSessions(ctx); err != nil {
				log.Printf("session cleanup error: %v", err)
			}
			if err := authStore.DeleteExpiredVerificationTokens(ctx); err != nil {
				log.Printf("verification token cleanup error: %v", err)
			}
			if err := authStore.DeleteExpiredMFAChallenges(ctx); err != nil {
				log.Printf("MFA challenge cleanup error: %v", err)
			}
			if err := householdStore.DeleteExpiredInvites(ctx); err != nil {
				log.Printf("household invite cleanup error: %v", err)
			}
			log.Println("expired tokens cleaned up")
		}
	}()

	srv := server.New(db, emailSender, encryptionKey, appURL)

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

	if err := auth.ValidateEmail(email); err != nil {
		log.Fatalf("invalid email: %v", err)
	}
	if err := auth.ValidatePassword(password); err != nil {
		log.Fatalf("invalid password: %v", err)
	}

	hash, err := auth.HashPassword(password)
	if err != nil {
		log.Fatalf("hashing password: %v", err)
	}

	user, err := store.CreateUser(context.Background(), email, hash, auth.RoleAdmin, false)
	if err != nil {
		log.Fatalf("creating user: %v", err)
	}

	fmt.Printf("Created user: id=%d email=%s role=%s\n", user.ID, user.Email, user.Role)
}

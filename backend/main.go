package main

import (
	"log"
	"os"

	"github.com/bpfel/nafin-toolbox/internal/database"
	"github.com/bpfel/nafin-toolbox/internal/server"
)

func main() {
	db, err := database.Connect(os.Getenv("DATABASE_URL"))
	if err != nil {
		log.Fatalf("failed to connect to database: %v", err)
	}
	defer db.Close()

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

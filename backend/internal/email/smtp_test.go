package email

import (
	"context"
	"testing"
)

// --- LogSender tests ---

func TestLogSender_Send_AlwaysSucceeds(t *testing.T) {
	sender := &LogSender{}
	ctx := context.Background()

	err := sender.Send(ctx, "to@example.com", "Test Subject", "<p>HTML</p>", "Text body")
	if err != nil {
		t.Errorf("LogSender.Send returned error: %v", err)
	}
}

func TestLogSender_Send_WithEmptyFields(t *testing.T) {
	sender := &LogSender{}
	ctx := context.Background()

	tests := []struct {
		name     string
		to       string
		subject  string
		htmlBody string
		textBody string
	}{
		{
			name:     "all empty",
			to:       "",
			subject:  "",
			htmlBody: "",
			textBody: "",
		},
		{
			name:     "empty recipient",
			to:       "",
			subject:  "Subject",
			htmlBody: "<p>HTML</p>",
			textBody: "Text",
		},
		{
			name:     "empty subject",
			to:       "to@example.com",
			subject:  "",
			htmlBody: "<p>HTML</p>",
			textBody: "Text",
		},
		{
			name:     "empty bodies",
			to:       "to@example.com",
			subject:  "Subject",
			htmlBody: "",
			textBody: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := sender.Send(ctx, tt.to, tt.subject, tt.htmlBody, tt.textBody)
			if err != nil {
				t.Errorf("LogSender.Send returned error: %v", err)
			}
		})
	}
}

func TestLogSender_Send_WithSpecialCharacters(t *testing.T) {
	sender := &LogSender{}
	ctx := context.Background()

	tests := []struct {
		name     string
		to       string
		subject  string
		htmlBody string
		textBody string
	}{
		{
			name:     "unicode in subject",
			to:       "to@example.com",
			subject:  "Test émoji 🎉",
			htmlBody: "<p>HTML</p>",
			textBody: "Text",
		},
		{
			name:     "newlines in text",
			to:       "to@example.com",
			subject:  "Subject",
			htmlBody: "<p>HTML</p>",
			textBody: "Line 1\nLine 2\nLine 3",
		},
		{
			name:     "HTML tags in body",
			to:       "to@example.com",
			subject:  "Subject",
			htmlBody: "<html><body><h1>Title</h1><p>Content</p></body></html>",
			textBody: "Plain text",
		},
		{
			name:     "quotes and special chars",
			to:       "to@example.com",
			subject:  "Subject with \"quotes\" and <brackets>",
			htmlBody: "<p>HTML with 'quotes'</p>",
			textBody: "Text with \"quotes\" and 'apostrophes'",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := sender.Send(ctx, tt.to, tt.subject, tt.htmlBody, tt.textBody)
			if err != nil {
				t.Errorf("LogSender.Send returned error: %v", err)
			}
		})
	}
}

func TestLogSender_Send_WithLongContent(t *testing.T) {
	sender := &LogSender{}
	ctx := context.Background()

	// Very long email body
	longText := ""
	for i := 0; i < 10000; i++ {
		longText += "This is a very long email body. "
	}

	err := sender.Send(ctx, "to@example.com", "Long Email", longText, longText)
	if err != nil {
		t.Errorf("LogSender.Send with long content returned error: %v", err)
	}
}

func TestLogSender_Send_WithCanceledContext(t *testing.T) {
	sender := &LogSender{}
	ctx, cancel := context.WithCancel(context.Background())
	cancel() // Cancel immediately

	// LogSender doesn't check context, so this should still succeed
	err := sender.Send(ctx, "to@example.com", "Subject", "<p>HTML</p>", "Text")
	if err != nil {
		t.Errorf("LogSender.Send with canceled context returned error: %v", err)
	}
}

func TestLogSender_Send_MultipleRecipients(t *testing.T) {
	sender := &LogSender{}
	ctx := context.Background()

	// LogSender accepts "to" as a string, but it could be comma-separated
	err := sender.Send(ctx, "to1@example.com, to2@example.com", "Subject", "<p>HTML</p>", "Text")
	if err != nil {
		t.Errorf("LogSender.Send with multiple recipients returned error: %v", err)
	}
}

func TestLogSender_ImplementsSenderInterface(t *testing.T) {
	// Verify LogSender implements Sender interface
	var _ Sender = &LogSender{}
}

// --- NewSMTPSender tests ---

func TestNewSMTPSender_WithEmptyHost(t *testing.T) {
	cfg := SMTPConfig{
		Host:     "",
		Port:     "587",
		Username: "user",
		Password: "pass",
		From:     "sender@example.com",
	}

	sender := NewSMTPSender(cfg)
	if sender != nil {
		t.Error("NewSMTPSender with empty host should return nil")
	}
}

func TestNewSMTPSender_WithValidConfig(t *testing.T) {
	cfg := SMTPConfig{
		Host:     "smtp.example.com",
		Port:     "587",
		Username: "user",
		Password: "pass",
		From:     "sender@example.com",
	}

	sender := NewSMTPSender(cfg)
	if sender == nil {
		t.Fatal("NewSMTPSender returned nil")
	}

	if sender.host != "smtp.example.com" {
		t.Errorf("host = %q, want smtp.example.com", sender.host)
	}
	if sender.port != 587 {
		t.Errorf("port = %d, want 587", sender.port)
	}
	if sender.username != "user" {
		t.Errorf("username = %q, want user", sender.username)
	}
	if sender.password != "pass" {
		t.Errorf("password = %q, want pass", sender.password)
	}
	if sender.from != "sender@example.com" {
		t.Errorf("from = %q, want sender@example.com", sender.from)
	}
}

func TestNewSMTPSender_DefaultPort(t *testing.T) {
	cfg := SMTPConfig{
		Host:     "smtp.example.com",
		Port:     "", // empty, should default to 587
		Username: "user",
		Password: "pass",
	}

	sender := NewSMTPSender(cfg)
	if sender == nil {
		t.Fatal("NewSMTPSender returned nil")
	}

	if sender.port != 587 {
		t.Errorf("port = %d, want 587 (default)", sender.port)
	}
}

func TestNewSMTPSender_CustomPort(t *testing.T) {
	tests := []struct {
		portStr string
		wantInt int
	}{
		{"25", 25},
		{"465", 465},
		{"587", 587},
		{"1025", 1025},
		{"2525", 2525},
	}

	for _, tt := range tests {
		t.Run("port "+tt.portStr, func(t *testing.T) {
			cfg := SMTPConfig{
				Host:     "smtp.example.com",
				Port:     tt.portStr,
				Username: "user",
				Password: "pass",
			}

			sender := NewSMTPSender(cfg)
			if sender == nil {
				t.Fatal("NewSMTPSender returned nil")
			}

			if sender.port != tt.wantInt {
				t.Errorf("port = %d, want %d", sender.port, tt.wantInt)
			}
		})
	}
}

func TestNewSMTPSender_InvalidPort(t *testing.T) {
	cfg := SMTPConfig{
		Host:     "smtp.example.com",
		Port:     "not-a-number",
		Username: "user",
		Password: "pass",
	}

	sender := NewSMTPSender(cfg)
	if sender == nil {
		t.Fatal("NewSMTPSender returned nil")
	}

	// Should fall back to default 587
	if sender.port != 587 {
		t.Errorf("port = %d, want 587 (fallback for invalid port string)", sender.port)
	}
}

func TestNewSMTPSender_DefaultFrom(t *testing.T) {
	cfg := SMTPConfig{
		Host:     "smtp.example.com",
		Port:     "587",
		Username: "user",
		Password: "pass",
		From:     "", // empty, should default
	}

	sender := NewSMTPSender(cfg)
	if sender == nil {
		t.Fatal("NewSMTPSender returned nil")
	}

	if sender.from != "noreply@localhost" {
		t.Errorf("from = %q, want noreply@localhost (default)", sender.from)
	}
}

func TestNewSMTPSender_MinimalConfig(t *testing.T) {
	// Only host is required
	cfg := SMTPConfig{
		Host: "smtp.example.com",
	}

	sender := NewSMTPSender(cfg)
	if sender == nil {
		t.Fatal("NewSMTPSender returned nil")
	}

	if sender.host != "smtp.example.com" {
		t.Errorf("host = %q, want smtp.example.com", sender.host)
	}
	if sender.port != 587 {
		t.Errorf("port = %d, want 587 (default)", sender.port)
	}
	if sender.from != "noreply@localhost" {
		t.Errorf("from = %q, want noreply@localhost (default)", sender.from)
	}
	if sender.username != "" {
		t.Errorf("username = %q, want empty", sender.username)
	}
	if sender.password != "" {
		t.Errorf("password = %q, want empty", sender.password)
	}
}

func TestNewSMTPSender_NilWithEmptyHost(t *testing.T) {
	// Multiple test cases for empty host
	configs := []SMTPConfig{
		{Host: ""},
		{Host: "", Port: "587"},
		{Host: "", Port: "587", Username: "user", Password: "pass", From: "from@example.com"},
	}

	for i, cfg := range configs {
		sender := NewSMTPSender(cfg)
		if sender != nil {
			t.Errorf("config[%d]: NewSMTPSender with empty host should return nil, got %+v", i, sender)
		}
	}
}

func TestSMTPSender_ImplementsSenderInterface(t *testing.T) {
	// Verify SMTPSender implements Sender interface
	var _ Sender = &SMTPSender{}
}

// --- SMTPConfig struct tests ---

func TestSMTPConfig_FieldAccess(t *testing.T) {
	cfg := SMTPConfig{
		Host:     "smtp.example.com",
		Port:     "587",
		Username: "user",
		Password: "pass",
		From:     "from@example.com",
	}

	if cfg.Host != "smtp.example.com" {
		t.Errorf("Host = %q, want smtp.example.com", cfg.Host)
	}
	if cfg.Port != "587" {
		t.Errorf("Port = %q, want 587", cfg.Port)
	}
	if cfg.Username != "user" {
		t.Errorf("Username = %q, want user", cfg.Username)
	}
	if cfg.Password != "pass" {
		t.Errorf("Password = %q, want pass", cfg.Password)
	}
	if cfg.From != "from@example.com" {
		t.Errorf("From = %q, want from@example.com", cfg.From)
	}
}

// Note: SMTPSender.Send is NOT tested here because it requires a real SMTP server
// or extensive mocking of the go-mail library. Those tests belong in integration tests.

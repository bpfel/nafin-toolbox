package email

import (
	"context"
	"fmt"
	"log"
	"strconv"

	gomail "github.com/wneessen/go-mail"
)

// SMTPSender sends emails via SMTP.
type SMTPSender struct {
	host     string
	port     int
	username string
	password string
	from     string
}

// SMTPConfig holds SMTP configuration.
type SMTPConfig struct {
	Host     string
	Port     string // string to match env var parsing
	Username string
	Password string
	From     string
}

// NewSMTPSender creates a new SMTP email sender.
// Returns nil if host is empty (email disabled).
func NewSMTPSender(cfg SMTPConfig) *SMTPSender {
	if cfg.Host == "" {
		return nil
	}

	port := 587
	if cfg.Port != "" {
		if p, err := strconv.Atoi(cfg.Port); err == nil {
			port = p
		}
	}

	from := cfg.From
	if from == "" {
		from = "noreply@localhost"
	}

	return &SMTPSender{
		host:     cfg.Host,
		port:     port,
		username: cfg.Username,
		password: cfg.Password,
		from:     from,
	}
}

func (s *SMTPSender) Send(ctx context.Context, to, subject, htmlBody, textBody string) error {
	msg := gomail.NewMsg()
	if err := msg.From(s.from); err != nil {
		return fmt.Errorf("setting from: %w", err)
	}
	if err := msg.To(to); err != nil {
		return fmt.Errorf("setting to: %w", err)
	}
	msg.Subject(subject)
	msg.SetBodyString(gomail.TypeTextPlain, textBody)
	msg.AddAlternativeString(gomail.TypeTextHTML, htmlBody)

	var opts []gomail.Option
	opts = append(opts, gomail.WithPort(s.port))
	opts = append(opts, gomail.WithSMTPAuth(gomail.SMTPAuthPlain))

	// Port 1025 is typically mailpit/mailhog dev SMTP — skip TLS
	if s.port == 1025 || s.port == 25 {
		opts = append(opts, gomail.WithTLSPolicy(gomail.NoTLS))
	}

	if s.username != "" {
		opts = append(opts, gomail.WithUsername(s.username))
		opts = append(opts, gomail.WithPassword(s.password))
	} else {
		// No auth for local dev SMTP like mailpit
		opts = append(opts, gomail.WithSMTPAuth(gomail.SMTPAuthNoAuth))
	}

	client, err := gomail.NewClient(s.host, opts...)
	if err != nil {
		return fmt.Errorf("creating SMTP client: %w", err)
	}

	if err := client.DialAndSendWithContext(ctx, msg); err != nil {
		return fmt.Errorf("sending email: %w", err)
	}

	return nil
}

// LogSender logs emails instead of sending them. Used as fallback when SMTP is not configured.
type LogSender struct{}

func (l *LogSender) Send(ctx context.Context, to, subject, htmlBody, textBody string) error {
	log.Printf("[EMAIL-LOG] To: %s, Subject: %s\n%s", to, subject, textBody)
	return nil
}

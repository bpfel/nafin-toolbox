package email

import (
	"strings"
	"testing"
)

// --- RenderInviteEmail tests ---

func TestRenderInviteEmail_ValidInputs(t *testing.T) {
	appURL := "https://app.example.com"
	token := "abc123xyz"

	html, text, err := RenderInviteEmail(appURL, token)
	if err != nil {
		t.Fatalf("RenderInviteEmail failed: %v", err)
	}

	expectedURL := appURL + "/verify?token=" + token

	// Check HTML output
	if !strings.Contains(html, expectedURL) {
		t.Errorf("HTML does not contain expected URL %q", expectedURL)
	}
	if !strings.Contains(html, "<!DOCTYPE html>") {
		t.Error("HTML missing DOCTYPE")
	}
	if !strings.Contains(html, "</html>") {
		t.Error("HTML missing closing tag")
	}
	if !strings.Contains(html, "Set Up Your Account") {
		t.Error("HTML missing button text")
	}

	// Check text output
	if !strings.Contains(text, expectedURL) {
		t.Errorf("text does not contain expected URL %q", expectedURL)
	}
	if !strings.Contains(text, "Finance Tracker") {
		t.Error("text missing app name")
	}
	if !strings.Contains(text, "48 hours") {
		t.Error("text missing expiration info")
	}
}

func TestRenderInviteEmail_URLConstruction(t *testing.T) {
	tests := []struct {
		name        string
		appURL      string
		token       string
		expectedURL string
	}{
		{
			name:        "standard HTTPS",
			appURL:      "https://finance.example.com",
			token:       "token123",
			expectedURL: "https://finance.example.com/verify?token=token123",
		},
		{
			name:        "localhost",
			appURL:      "http://localhost:3000",
			token:       "localtoken",
			expectedURL: "http://localhost:3000/verify?token=localtoken",
		},
		{
			name:        "with trailing slash",
			appURL:      "https://app.com/",
			token:       "tok",
			expectedURL: "https://app.com//verify?token=tok", // current behavior
		},
		{
			name:        "long token",
			appURL:      "https://app.com",
			token:       "very-long-token-with-many-characters-and-hyphens-12345",
			expectedURL: "https://app.com/verify?token=very-long-token-with-many-characters-and-hyphens-12345",
		},
		{
			name:        "empty token",
			appURL:      "https://app.com",
			token:       "",
			expectedURL: "https://app.com/verify?token=",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			html, text, err := RenderInviteEmail(tt.appURL, tt.token)
			if err != nil {
				t.Fatalf("RenderInviteEmail failed: %v", err)
			}

			if !strings.Contains(html, tt.expectedURL) {
				t.Errorf("HTML does not contain expected URL %q", tt.expectedURL)
			}
			if !strings.Contains(text, tt.expectedURL) {
				t.Errorf("text does not contain expected URL %q", tt.expectedURL)
			}
		})
	}
}

func TestRenderInviteEmail_HTMLStructure(t *testing.T) {
	html, _, err := RenderInviteEmail("https://app.com", "token")
	if err != nil {
		t.Fatalf("RenderInviteEmail failed: %v", err)
	}

	requiredElements := []string{
		"<!DOCTYPE html>",
		"<html>",
		"</html>",
		"<head>",
		"<meta charset=\"utf-8\">",
		"</head>",
		"<body",
		"</body>",
		"<h2",
		"<a href=",
		"<p",
	}

	for _, elem := range requiredElements {
		if !strings.Contains(html, elem) {
			t.Errorf("HTML missing required element: %q", elem)
		}
	}
}

func TestRenderInviteEmail_HTMLStyling(t *testing.T) {
	html, _, err := RenderInviteEmail("https://app.com", "token")
	if err != nil {
		t.Fatalf("RenderInviteEmail failed: %v", err)
	}

	// Check for inline styles (email clients need inline styles)
	if !strings.Contains(html, "style=") {
		t.Error("HTML missing inline styles")
	}

	// Check for specific styling elements
	expectedStyles := []string{
		"font-family",
		"max-width",
		"margin",
		"padding",
		"background",
		"color",
	}

	for _, style := range expectedStyles {
		if !strings.Contains(html, style) {
			t.Errorf("HTML missing style property: %q", style)
		}
	}
}

func TestRenderInviteEmail_TextPlainFormat(t *testing.T) {
	_, text, err := RenderInviteEmail("https://app.com", "token")
	if err != nil {
		t.Fatalf("RenderInviteEmail failed: %v", err)
	}

	// Text should NOT contain HTML tags
	htmlTags := []string{"<html>", "<body>", "<a href=", "<p>", "<h2>", "</"}
	for _, tag := range htmlTags {
		if strings.Contains(text, tag) {
			t.Errorf("text output contains HTML tag: %q", tag)
		}
	}

	// Text should be readable plain text
	if !strings.Contains(text, "\n\n") {
		t.Error("text output missing paragraph breaks")
	}
}

func TestRenderInviteEmail_SecurityConsiderations(t *testing.T) {
	// Test with special characters that could cause XSS or template injection
	tests := []struct {
		name   string
		appURL string
		token  string
	}{
		{
			name:   "token with HTML",
			appURL: "https://app.com",
			token:  "<script>alert('xss')</script>",
		},
		{
			name:   "appURL with quotes",
			appURL: "https://app.com\"onclick=\"alert('xss')\"",
			token:  "normal",
		},
		{
			name:   "token with template syntax",
			appURL: "https://app.com",
			token:  "{{.Malicious}}",
		},
		{
			name:   "URL with special chars",
			appURL: "https://app.com/path?existing=param&other=val",
			token:  "token123",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			html, text, err := RenderInviteEmail(tt.appURL, tt.token)
			if err != nil {
				t.Fatalf("RenderInviteEmail failed: %v", err)
			}

			// HTML template should auto-escape dangerous content
			if strings.Contains(html, "<script>") {
				t.Error("HTML contains unescaped script tag")
			}

			// Both outputs should be non-empty
			if len(html) == 0 {
				t.Error("HTML output is empty")
			}
			if len(text) == 0 {
				t.Error("text output is empty")
			}
		})
	}
}

func TestRenderInviteEmail_ContentMessages(t *testing.T) {
	html, text, err := RenderInviteEmail("https://app.com", "token")
	if err != nil {
		t.Fatalf("RenderInviteEmail failed: %v", err)
	}

	// Key messages that should appear in both HTML and text
	messages := []string{
		"Finance Tracker",
		"invited",
		"set up your account",
		"48 hours",
	}

	for _, msg := range messages {
		if !strings.Contains(strings.ToLower(html), strings.ToLower(msg)) {
			t.Errorf("HTML missing message: %q", msg)
		}
		if !strings.Contains(strings.ToLower(text), strings.ToLower(msg)) {
			t.Errorf("text missing message: %q", msg)
		}
	}
}

func TestRenderInviteEmail_NoErrors(t *testing.T) {
	// Test that rendering never returns an error with valid inputs
	// (template.Must would have panicked at package init if templates were invalid)
	tests := []struct {
		appURL string
		token  string
	}{
		{"https://app.com", "token"},
		{"http://localhost:3000", "test123"},
		{"", ""},                                       // even with empty strings, should not error
		{"https://app.com", strings.Repeat("a", 1000)}, // very long token
	}

	for _, tt := range tests {
		_, _, err := RenderInviteEmail(tt.appURL, tt.token)
		if err != nil {
			t.Errorf("RenderInviteEmail(%q, %q) returned error: %v", tt.appURL, tt.token, err)
		}
	}
}

// --- InviteEmailData struct tests ---

func TestInviteEmailData_FieldAccess(t *testing.T) {
	data := InviteEmailData{
		VerifyURL: "https://app.com/verify?token=abc",
	}

	if data.VerifyURL != "https://app.com/verify?token=abc" {
		t.Errorf("VerifyURL = %q, want https://app.com/verify?token=abc", data.VerifyURL)
	}
}

// --- Template compilation tests ---

func TestTemplates_CompileSuccessfully(t *testing.T) {
	// If templates failed to compile, template.Must would panic at package init
	// This test verifies we got here without panicking
	if inviteHTMLTmpl == nil {
		t.Error("inviteHTMLTmpl is nil")
	}
	if inviteTextTmpl == nil {
		t.Error("inviteTextTmpl is nil")
	}
}

func TestTemplates_Names(t *testing.T) {
	if name := inviteHTMLTmpl.Name(); name != "invite_html" {
		t.Errorf("HTML template name = %q, want invite_html", name)
	}
	if name := inviteTextTmpl.Name(); name != "invite_text" {
		t.Errorf("text template name = %q, want invite_text", name)
	}
}

// --- Edge case tests ---

func TestRenderInviteEmail_UnicodeToken(t *testing.T) {
	// Tokens with Unicode characters (unlikely but possible)
	html, text, err := RenderInviteEmail("https://app.com", "token-with-émoji-🎉")
	if err != nil {
		t.Fatalf("RenderInviteEmail with Unicode failed: %v", err)
	}

	if !strings.Contains(html, "token-with-émoji-🎉") {
		t.Error("HTML missing Unicode token")
	}
	if !strings.Contains(text, "token-with-émoji-🎉") {
		t.Error("text missing Unicode token")
	}
}

func TestRenderInviteEmail_VeryLongURL(t *testing.T) {
	// Test with very long app URL
	longURL := "https://" + strings.Repeat("subdomain.", 50) + "example.com"
	html, text, err := RenderInviteEmail(longURL, "token")
	if err != nil {
		t.Fatalf("RenderInviteEmail with long URL failed: %v", err)
	}

	if !strings.Contains(html, longURL) {
		t.Error("HTML missing long URL")
	}
	if !strings.Contains(text, longURL) {
		t.Error("text missing long URL")
	}
}

func TestRenderInviteEmail_OutputNonEmpty(t *testing.T) {
	// Ensure outputs are never empty with valid inputs
	html, text, err := RenderInviteEmail("https://app.com", "token")
	if err != nil {
		t.Fatalf("RenderInviteEmail failed: %v", err)
	}

	if len(html) == 0 {
		t.Error("HTML output is empty")
	}
	if len(text) == 0 {
		t.Error("text output is empty")
	}

	// Outputs should be reasonably sized (at least 100 chars)
	if len(html) < 100 {
		t.Errorf("HTML output too short: %d chars", len(html))
	}
	if len(text) < 50 {
		t.Errorf("text output too short: %d chars", len(text))
	}
}

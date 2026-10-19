// Package apierror gives every error the API returns a stable, quotable code.
//
// The messages stay in English by decision, so a user running the app in
// Rumantsch cannot describe a failure back to whoever runs the server. A code
// they can read out — "AUTH-014" — closes that gap without translating forty
// strings into five languages and keeping them in step.
//
// Codes are keyed by area and message rather than by call site: "internal
// error" happens in fifty places, and a single code for all of them would say
// nothing, while a code per line would need a table nobody could maintain. Area
// plus message is the coarsest split that still tells you where to look.
//
// Codes are append-only. Renumbering one breaks every note a user has written
// down and every log line already shipped, so a message that changes wording
// keeps its code, and a message that disappears leaves its number retired.
package apierror

import (
	"encoding/json"
	"net/http"
)

// Areas. These prefix every code and are the only place a new one is declared.
const (
	Auth   = "AUTH"
	Vault  = "VAULT"
	Module = "MOD"
	Server = "SRV"
	Upkeep = "UPK"
)

// codes maps "AREA|message" to the code the user sees.
//
// Deliberately explicit rather than generated: a derived code would move when
// the table was reordered, which is the one thing a code must never do.
var codes = map[string]string{
	// --- Cross-cutting, per area so the code still says where ---
	Auth + "|internal error":         "AUTH-001",
	Auth + "|unauthorized":           "AUTH-002",
	Auth + "|invalid request body":   "AUTH-003",
	Auth + "|admin access required":  "AUTH-004",
	Vault + "|internal error":        "VAULT-001",
	Vault + "|unauthorized":          "VAULT-002",
	Vault + "|invalid request body":  "VAULT-003",
	Module + "|internal error":       "MOD-001",
	Module + "|invalid request body": "MOD-002",
	Module + "|invalid JSON":         "MOD-003",

	// --- Signing in ---
	Auth + "|invalid credentials":               "AUTH-010",
	Auth + "|email and password required":       "AUTH-011",
	Auth + "|too many login attempts":           "AUTH-012",
	Auth + "|too many attempts":                 "AUTH-013",
	Auth + "|email not verified":                "AUTH-014",
	Auth + "|incorrect password":                "AUTH-015",
	Auth + "|current password is incorrect":     "AUTH-016",
	Auth + "|password required":                 "AUTH-017",
	Auth + "|current and new password required": "AUTH-018",
	Auth + "|email required":                    "AUTH-019",

	// --- Invitations and verification ---
	Auth + "|invalid or expired token":                 "AUTH-020",
	Auth + "|token and password required":              "AUTH-021",
	Auth + "|user already verified":                    "AUTH-022",
	Auth + "|user already exists":                      "AUTH-023",
	Auth + "|user not found":                           "AUTH-024",
	Auth + "|invalid user ID":                          "AUTH-025",
	Auth + "|setup already completed":                  "AUTH-026",
	Auth + "|failed to send invite email":              "AUTH-027",
	Auth + "|failed to send email":                     "AUTH-028",
	Auth + "|password required (email not configured)": "AUTH-029",

	// --- Two-factor ---
	Auth + "|invalid code":                                      "AUTH-030",
	Auth + "|code required":                                     "AUTH-031",
	Auth + "|mfa_token and code required":                       "AUTH-032",
	Auth + "|invalid or expired MFA token":                      "AUTH-033",
	Auth + "|2FA is already enabled":                            "AUTH-034",
	Auth + "|2FA is not enabled":                                "AUTH-035",
	Auth + "|2FA not available (encryption key not configured)": "AUTH-036",

	// --- Administering other users ---
	Auth + "|cannot delete yourself via admin endpoint":         "AUTH-040",
	Auth + "|cannot reset your own password via admin endpoint": "AUTH-041",
	Auth + "|cannot delete the last administrator":              "AUTH-042",

	// --- Passkeys ---
	Auth + "|passkeys are not enabled":             "AUTH-060",
	Auth + "|invalid or expired passkey challenge": "AUTH-061",
	Auth + "|passkey not recognised":               "AUTH-062",
	Auth + "|passkey not found":                    "AUTH-063",
	Auth + "|too many passkeys":                    "AUTH-064",
	Auth + "|vault key required":                   "AUTH-065",

	// --- Validation of what was typed ---
	// AUTH-050 is retired. It stood for every rule at once, so a user reading
	// it out could not say which one their input broke; each rule has its own
	// code now. The frontend checks the same rules before sending and reports
	// them under these codes — see lib/auth/rules.ts.
	Auth + "|validation":                             "AUTH-050",
	Auth + "|password must be at least 8 characters": "AUTH-051",
	Auth + "|invalid email address":                  "AUTH-052",

	// --- The vault ---
	Vault + "|invalid JSON":                "VAULT-010",
	Vault + "|failed to save vault":        "VAULT-011",
	Vault + "|failed to save keys":         "VAULT-012",
	Vault + "|failed to update keys":       "VAULT-013",
	Vault + "|failed to hash recovery key": "VAULT-014",

	// --- Households, which are vaults with more than one person in them ---
	Vault + "|failed to list households":  "VAULT-020",
	Vault + "|failed to create household": "VAULT-021",
	Vault + "|failed to read household":   "VAULT-022",
	Vault + "|failed to save household":   "VAULT-023",
	Vault + "|failed to rename household": "VAULT-024",
	Vault + "|failed to delete household": "VAULT-025",

	// --- Inviting somebody into a household ---
	Vault + "|failed to create invitation":   "VAULT-030",
	Vault + "|failed to list invitations":    "VAULT-031",
	Vault + "|failed to withdraw invitation": "VAULT-032",
	Vault + "|failed to accept invitation":   "VAULT-033",
	Vault + "|failed to confirm invitation":  "VAULT-034",
	Vault + "|failed to list members":        "VAULT-035",
	Vault + "|failed to remove member":       "VAULT-036",
	Vault + "|failed to rekey household":     "VAULT-037",
	Vault + "|failed to change role":         "VAULT-038",
	Vault + "|failed to save identity":       "VAULT-039",

	// --- Upkeep reminders ---
	Upkeep + "|invalid request body":    "UPK-001",
	Upkeep + "|admin access required":   "UPK-002",
	Upkeep + "|nothing to remind about": "UPK-003",
	Upkeep + "|too many entries":        "UPK-004",
	Upkeep + "|an entry has no subject": "UPK-005",
	Upkeep + "|failed to send reminder": "UPK-006",
	Upkeep + "|too many reminders":      "UPK-007",

	// --- Request handling ---
	Server + "|origin not allowed": "SRV-001",
}

// Unknown is returned for a message with no entry. Visible on purpose: a code
// ending 000 says the table has fallen behind the handlers.
const unknownSuffix = "-000"

// CodeFor returns the code for an area and message, or the area's 000 code.
func CodeFor(area, message string) string {
	if code, ok := codes[area+"|"+message]; ok {
		return code
	}
	return area + unknownSuffix
}

// Codes exposes the table for tests. Callers must not mutate it.
func Codes() map[string]string {
	return codes
}

type body struct {
	Error string `json:"error"`
	Code  string `json:"code"`
}

// Write sends a JSON error carrying its code.
func Write(w http.ResponseWriter, area string, status int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body{Error: message, Code: CodeFor(area, message)})
}

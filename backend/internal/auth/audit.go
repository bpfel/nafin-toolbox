package auth

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"strings"
)

type AuditEvent string

const (
	AuditLoginSuccess     AuditEvent = "login_success"
	AuditLoginFailed      AuditEvent = "login_failed"
	AuditLogout           AuditEvent = "logout"
	AuditLogoutEverywhere AuditEvent = "logout_everywhere"
	AuditPasswordChanged  AuditEvent = "password_changed"
	Audit2FAEnabled       AuditEvent = "2fa_enabled"
	Audit2FADisabled      AuditEvent = "2fa_disabled"
	Audit2FAVerified      AuditEvent = "2fa_verified"
	Audit2FAFailed        AuditEvent = "2fa_failed"
	AuditRecoveryCodeUsed AuditEvent = "recovery_code_used"
	AuditUserInvited      AuditEvent = "user_invited"
	AuditEmailVerified    AuditEvent = "email_verified"
	AuditUserDeleted      AuditEvent = "user_deleted"
	AuditPasswordReset    AuditEvent = "password_reset"
	// An administrator removed a user's second factor.
	Audit2FARemoved     AuditEvent = "2fa_removed"
	AuditLockoutCleared AuditEvent = "lockout_cleared"
	// An account moved to separate keys for signing in and for the vault.
	AuditCredentialsUpgraded AuditEvent = "credentials_upgraded"
	// An account renewed its vault key, recovery key and password together.
	AuditKeysRenewed AuditEvent = "keys_renewed"
)

// LogAudit records a security event in the audit_log table.
func (s *Store) LogAudit(ctx context.Context, userID *int, event AuditEvent, r *http.Request, metadata map[string]any) error {
	var ip, ua string
	if r != nil {
		ip = auditText(clientIP(r, s.trustedProxies), 64)
		ua = auditText(r.UserAgent(), 512)
	}

	var metaJSON []byte
	if metadata != nil {
		var err error
		metaJSON, err = json.Marshal(metadata)
		if err != nil {
			metaJSON = nil
		}
	}

	_, err := s.db.ExecContext(ctx,
		`INSERT INTO audit_log (user_id, event, ip_address, user_agent, metadata) VALUES ($1, $2, $3, $4, $5)`,
		userID, string(event), ip, ua, metaJSON,
	)
	if err != nil {
		// Most callers go on regardless — a sign-in is not refused because
		// it could not be logged — so this is where a lost entry is noticed.
		log.Printf("audit: could not record %s: %v", event, err)
	}
	return err
}

// auditText makes a request-supplied string fit to store: valid UTF-8, which
// PostgreSQL insists on for text and would otherwise refuse the whole entry
// over, and no longer than max bytes, cut on a character boundary.
func auditText(s string, max int) string {
	s = strings.ToValidUTF8(s, "\uFFFD")
	if len(s) <= max {
		return s
	}
	return strings.ToValidUTF8(s[:max], "")
}

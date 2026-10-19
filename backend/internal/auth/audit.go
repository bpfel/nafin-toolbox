package auth

import (
	"context"
	"encoding/json"
	"net/http"
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
	AuditPasskeyAdded     AuditEvent = "passkey_added"
	AuditPasskeyRemoved   AuditEvent = "passkey_removed"
	AuditSettingChanged   AuditEvent = "setting_changed"
)

// LogAudit records a security event in the audit_log table.
func (s *Store) LogAudit(ctx context.Context, userID *int, event AuditEvent, r *http.Request, metadata map[string]any) error {
	var ip, ua string
	if r != nil {
		ip = clientIP(r, s.trustedProxies)
		ua = r.UserAgent()
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
	return err
}

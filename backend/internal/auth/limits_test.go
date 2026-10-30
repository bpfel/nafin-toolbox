package auth

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"unicode/utf8"
)

// An address longer than SMTP allows is refused before it is looked up,
// counted or logged. It was once kept as a sign-in limiter key and written to
// the audit log at whatever size a stranger sent, up to the 1 MiB body cap.
// The store here has no database: reaching it would panic.
func TestAnOversizedEmailIsRefusedBeforeAnythingElse(t *testing.T) {
	long := strings.Repeat("a", MaxEmailLength) + "@example.ch"
	for name, handler := range map[string]http.HandlerFunc{
		"login":    HandleLogin(testDeps()),
		"prelogin": HandlePrelogin(testDeps()),
	} {
		body := `{"email":"` + long + `","auth_key":"` + testAuthKey + `"}`
		req := httptest.NewRequest(http.MethodPost, "/api/auth/"+name, strings.NewReader(body))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		if w.Code != http.StatusBadRequest || !strings.Contains(w.Body.String(), "AUTH-052") {
			t.Errorf("%s: status %d, body %s; want 400 with AUTH-052", name, w.Code, w.Body.String())
		}
	}
}

func TestValidateEmailRefusesAnOversizedAddress(t *testing.T) {
	if ValidateEmail(strings.Repeat("a", MaxEmailLength)+"@example.ch") == nil {
		t.Error("an address over 254 bytes was accepted")
	}
	if ValidateEmail("anna@example.ch") != nil {
		t.Error("an ordinary address was refused")
	}
}

// PostgreSQL refuses text that is not UTF-8, and the whole audit entry with
// it: one byte in a User-Agent kept failed sign-ins out of the audit log.
func TestAuditTextIsValidUTF8AndBounded(t *testing.T) {
	if got := auditText("a\xffb", 512); !utf8.ValidString(got) || !strings.HasPrefix(got, "a") || !strings.HasSuffix(got, "b") {
		t.Errorf("auditText(a\\xffb) = %q, want valid UTF-8 keeping the rest", got)
	}
	// Cut inside a two-byte character: the half is dropped, not kept broken.
	got := auditText(strings.Repeat("ä", 300), 511)
	if !utf8.ValidString(got) || len(got) > 511 {
		t.Errorf("cut text: valid %v, %d bytes; want valid and at most 511", utf8.ValidString(got), len(got))
	}
}

package upkeep

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/bpfel/nafin-toolbox/internal/auth"
)

// recorder stands in for SMTP and keeps what it was asked to send.
type recorder struct {
	to, subject, html, text string
	calls                   int
	err                     error
}

func (r *recorder) Send(ctx context.Context, to, subject, html, text string) error {
	r.calls++
	if r.err != nil {
		return r.err
	}
	r.to, r.subject, r.html, r.text = to, subject, html, text
	return nil
}

func request(t *testing.T, user *auth.User, body any) *http.Request {
	t.Helper()
	raw, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshalling body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/api/upkeep/remind", bytes.NewReader(raw))
	req.RemoteAddr = "192.0.2.1:1234"
	if user != nil {
		req = req.WithContext(auth.ContextWithUser(req.Context(), user))
	}
	return req
}

func serve(t *testing.T, user *auth.User, body any) (*httptest.ResponseRecorder, *recorder) {
	t.Helper()
	mail := &recorder{}
	deps := &auth.HandlerDeps{EmailSender: mail}
	rec := httptest.NewRecorder()
	Handle(deps, auth.NewLoginRateLimiter(100, time.Hour))(rec, request(t, user, body))
	return rec, mail
}

func admin() *auth.User  { return &auth.User{ID: 1, Email: "admin@example.ch", Role: "admin"} }
func member() *auth.User { return &auth.User{ID: 2, Email: "user@example.ch", Role: "user"} }

var oneEntry = Request{Entries: []Entry{{
	Subject:   "Serafe household levy",
	Current:   "CHF 335.00 a year",
	Becomes:   "CHF 312.00 a year",
	ChangesOn: "2027-01-01",
	Where:     "lib/budget/budgetEngine.ts",
	Source:    "BAKOM",
	SourceURL: "https://www.bakom.admin.ch/de/abgabe",
}}}

func TestAdminGetsTheReminder(t *testing.T) {
	rec, mail := serve(t, admin(), oneEntry)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}
	if mail.calls != 1 {
		t.Fatalf("sent %d mails, want 1", mail.calls)
	}
	if !strings.Contains(mail.text, "Serafe household levy") {
		t.Errorf("the subject of the entry is missing from the text body:\n%s", mail.text)
	}
	if !strings.Contains(mail.html, "312.00") {
		t.Errorf("what the figure becomes is missing from the HTML body:\n%s", mail.html)
	}
}

// The whole security shape of this endpoint in one test: the address comes from
// the session. A request that names someone else must not reach them, or an
// admin account becomes a way to mail arbitrary text to arbitrary people.
func TestTheRecipientIsTheSignedInAdminAndNothingElse(t *testing.T) {
	body := map[string]any{
		"entries": oneEntry.Entries,
		"to":      "victim@example.com",
		"email":   "victim@example.com",
	}

	rec, mail := serve(t, admin(), body)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}
	if mail.to != "admin@example.ch" {
		t.Fatalf("mailed %q; the request must not be able to choose a recipient", mail.to)
	}
}

func TestANonAdminIsRefusedAndNoMailIsSent(t *testing.T) {
	rec, mail := serve(t, member(), oneEntry)

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", rec.Code)
	}
	if mail.calls != 0 {
		t.Errorf("a non-admin caused %d mails to be sent", mail.calls)
	}
}

func TestNoSessionIsRefused(t *testing.T) {
	rec, mail := serve(t, nil, oneEntry)

	if rec.Code != http.StatusForbidden {
		t.Errorf("status = %d, want 403", rec.Code)
	}
	if mail.calls != 0 {
		t.Errorf("an unauthenticated request caused %d mails", mail.calls)
	}
}

func TestAnEmptyRegisterSendsNothing(t *testing.T) {
	rec, mail := serve(t, admin(), Request{Entries: []Entry{}})

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if mail.calls != 0 {
		t.Errorf("sent %d mails for an empty register", mail.calls)
	}
}

func TestTooManyEntriesIsRefused(t *testing.T) {
	entries := make([]Entry, maxEntries+1)
	for i := range entries {
		entries[i] = Entry{Subject: "s", Current: "c"}
	}

	rec, mail := serve(t, admin(), Request{Entries: entries})

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if mail.calls != 0 {
		t.Errorf("sent %d mails", mail.calls)
	}
}

func TestAnEntryWithoutASubjectIsRefused(t *testing.T) {
	rec, _ := serve(t, admin(), Request{Entries: []Entry{{Subject: "   ", Current: "c"}}})

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
}

// The body is rendered from text that arrived over the wire. It comes from our
// own screen today, but the handler cannot know that.
func TestFieldsAreEscapedIntoTheHTMLBody(t *testing.T) {
	_, mail := serve(t, admin(), Request{Entries: []Entry{{
		Subject: `<script>alert(1)</script>`,
		Current: `a & b`,
	}}})

	if strings.Contains(mail.html, "<script>") {
		t.Errorf("unescaped markup reached the HTML body:\n%s", mail.html)
	}
	if !strings.Contains(mail.html, "&amp;") {
		t.Errorf("an ampersand was not escaped:\n%s", mail.html)
	}
}

func TestOnlyHTTPSourcesBecomeLinks(t *testing.T) {
	_, mail := serve(t, admin(), Request{Entries: []Entry{{
		Subject:   "s",
		Current:   "c",
		Source:    "somewhere",
		SourceURL: "javascript:alert(1)",
	}}})

	if strings.Contains(mail.html, "href=") {
		t.Errorf("a non-http URL was written as a link:\n%s", mail.html)
	}
	if !strings.Contains(mail.html, "somewhere") {
		t.Errorf("the label was dropped along with the link:\n%s", mail.html)
	}
}

func TestAnOverlongFieldIsCutRatherThanRefused(t *testing.T) {
	long := strings.Repeat("x", maxField*3)

	rec, mail := serve(t, admin(), Request{Entries: []Entry{{Subject: "s", Current: long}}})

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d; a long field should be trimmed, not rejected", rec.Code)
	}
	if strings.Count(mail.text, "x") > maxField {
		t.Errorf("%d characters got through, want at most %d", strings.Count(mail.text, "x"), maxField)
	}
}

func TestAFailedSendIsReportedAndNotSwallowed(t *testing.T) {
	mail := &recorder{err: context.DeadlineExceeded}
	deps := &auth.HandlerDeps{EmailSender: mail}
	rec := httptest.NewRecorder()

	Handle(deps, auth.NewLoginRateLimiter(100, time.Hour))(rec, request(t, admin(), oneEntry))

	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502", rec.Code)
	}
}

func TestPressingTheButtonRepeatedlyIsLimited(t *testing.T) {
	mail := &recorder{}
	deps := &auth.HandlerDeps{EmailSender: mail}
	handler := Handle(deps, auth.NewLoginRateLimiter(2, time.Hour))

	var last *httptest.ResponseRecorder
	for i := 0; i < 3; i++ {
		last = httptest.NewRecorder()
		handler(last, request(t, admin(), oneEntry))
	}

	if last.Code != http.StatusTooManyRequests {
		t.Errorf("third send returned %d, want 429", last.Code)
	}
	if mail.calls != 2 {
		t.Errorf("sent %d mails, want 2", mail.calls)
	}
}

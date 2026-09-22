// Package upkeep mails an administrator the figures in this build that are
// about to stop being true.
//
// It holds no register of its own. The register is compiled into the
// frontend, beside the figures it is about, and the request carries the
// entries it wants sent. That is deliberate: content stays build-only, and a
// second copy of these facts in Go — or worse, in the database — would be one
// more place for them to fall out of step with the seeds they describe.
//
// The cost of that choice is that this endpoint renders text supplied by the
// caller, which makes the recipient the thing to get right. See Handle.
package upkeep

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"strings"

	"github.com/bpfel/nafin-toolbox/internal/apierror"
	"github.com/bpfel/nafin-toolbox/internal/auth"
)

// Bounds on what one reminder may carry. Generous for the register as it
// stands, and small enough that the endpoint cannot be turned into a way to
// push a large body of text through the app's mail server.
const (
	maxEntries = 50
	maxField   = 500
)

// Entry is one figure, as the frontend's register holds it.
type Entry struct {
	Subject   string `json:"subject"`
	Current   string `json:"current"`
	Becomes   string `json:"becomes,omitempty"`
	ChangesOn string `json:"changesOn,omitempty"`
	Cadence   string `json:"cadence,omitempty"`
	Where     string `json:"where,omitempty"`
	Source    string `json:"source,omitempty"`
	SourceURL string `json:"sourceUrl,omitempty"`
}

type Request struct {
	Entries []Entry `json:"entries"`
}

// Handle sends the reminder to the administrator who asked for it.
//
// **The recipient is never taken from the request.** It is read from the
// session, so the only address this endpoint can reach is the one already
// signed in. An endpoint that accepted a recipient and a body of text would
// be an open relay wearing an admin check, and an admin check is not much of
// a defence once one account is borrowed.
//
// Admin-only for the same reason the screen is: an ordinary user has no seeds
// to maintain and no business making the server send mail.
//
// Rate limited even so. The recipient is fixed, so the worst an admin can do to
// somebody else is nothing — but a button that mails on every press is still a
// button that can exhaust a sending quota, and the register changes about four
// times a year.
func Handle(deps *auth.HandlerDeps, limiter *auth.LoginRateLimiter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		caller := auth.UserFromContext(r.Context())
		if caller == nil || !caller.IsAdmin() {
			apierror.Write(w, apierror.Upkeep, http.StatusForbidden, "admin access required")
			return
		}

		if !limiter.Allow(r) {
			w.Header().Set("Retry-After", "3600")
			apierror.Write(w, apierror.Upkeep, http.StatusTooManyRequests, "too many reminders")
			return
		}

		var req Request
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			apierror.Write(w, apierror.Upkeep, http.StatusBadRequest, "invalid request body")
			return
		}

		if len(req.Entries) == 0 {
			apierror.Write(w, apierror.Upkeep, http.StatusBadRequest, "nothing to remind about")
			return
		}
		if len(req.Entries) > maxEntries {
			apierror.Write(w, apierror.Upkeep, http.StatusBadRequest, "too many entries")
			return
		}

		entries := make([]Entry, 0, len(req.Entries))
		for _, e := range req.Entries {
			if strings.TrimSpace(e.Subject) == "" {
				apierror.Write(w, apierror.Upkeep, http.StatusBadRequest, "an entry has no subject")
				return
			}
			entries = append(entries, clamp(e))
		}

		subject := fmt.Sprintf("nafin: %s to review", plural(len(entries), "figure", "figures"))
		htmlBody, textBody := render(entries)

		if err := deps.EmailSender.Send(r.Context(), caller.Email, subject, htmlBody, textBody); err != nil {
			apierror.Write(w, apierror.Upkeep, http.StatusBadGateway, "failed to send reminder")
			return
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]any{"sent_to": caller.Email, "entries": len(entries)})
	}
}

// clamp truncates rather than rejects: a register entry that has grown a long
// cadence sentence should still produce a reminder, just not an unbounded one.
func clamp(e Entry) Entry {
	e.Subject = cut(e.Subject)
	e.Current = cut(e.Current)
	e.Becomes = cut(e.Becomes)
	e.ChangesOn = cut(e.ChangesOn)
	e.Cadence = cut(e.Cadence)
	e.Where = cut(e.Where)
	e.Source = cut(e.Source)
	e.SourceURL = cut(e.SourceURL)
	return e
}

func cut(s string) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxField {
		return s
	}
	return s[:maxField]
}

func plural(n int, one, many string) string {
	if n == 1 {
		return fmt.Sprintf("%d %s", n, one)
	}
	return fmt.Sprintf("%d %s", n, many)
}

// render builds both bodies. Every field is escaped for the HTML one, because
// all of it arrived over the wire — from our own screen today, but the handler
// cannot know that and should not have to.
func render(entries []Entry) (htmlBody, textBody string) {
	var h, t strings.Builder

	h.WriteString(`<div style="font-family:system-ui,sans-serif;max-width:32rem">`)
	h.WriteString(`<p>These figures are compiled into the build and are due for a look.</p>`)
	t.WriteString("These figures are compiled into the build and are due for a look.\n")

	for _, e := range entries {
		h.WriteString(`<h3 style="margin:1.25rem 0 .25rem">` + html.EscapeString(e.Subject) + `</h3><p style="margin:0">`)
		t.WriteString("\n" + e.Subject + "\n  now: " + e.Current + "\n")
		h.WriteString(`Now: ` + html.EscapeString(e.Current))

		if e.Becomes != "" {
			h.WriteString(`<br>Becomes: ` + html.EscapeString(e.Becomes))
			t.WriteString("  becomes: " + e.Becomes + "\n")
		}
		if e.ChangesOn != "" {
			h.WriteString(`<br>From: ` + html.EscapeString(e.ChangesOn))
			t.WriteString("  from: " + e.ChangesOn + "\n")
		}
		if e.Cadence != "" {
			h.WriteString(`<br>` + html.EscapeString(e.Cadence))
			t.WriteString("  " + e.Cadence + "\n")
		}
		if e.Where != "" {
			h.WriteString(`<br><code>` + html.EscapeString(e.Where) + `</code>`)
			t.WriteString("  in: " + e.Where + "\n")
		}
		if e.SourceURL != "" {
			label := e.Source
			if label == "" {
				label = e.SourceURL
			}
			// Only the escaped URL goes in href, and only http(s) ones: a
			// javascript: URL in a mail client is somebody else's bug, but it
			// would be this handler that wrote it.
			if strings.HasPrefix(e.SourceURL, "https://") || strings.HasPrefix(e.SourceURL, "http://") {
				h.WriteString(`<br><a href="` + html.EscapeString(e.SourceURL) + `">` + html.EscapeString(label) + `</a>`)
			} else {
				h.WriteString(`<br>` + html.EscapeString(label))
			}
			t.WriteString("  see: " + e.SourceURL + "\n")
		}
		h.WriteString(`</p>`)
	}

	h.WriteString(`<p style="margin-top:1.5rem;color:#666;font-size:.9em">` +
		`Nothing has changed in the app. Editing these means editing the build.</p></div>`)
	t.WriteString("\nNothing has changed in the app. Editing these means editing the build.\n")

	return h.String(), t.String()
}

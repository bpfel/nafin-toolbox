package email

import (
	"bytes"
	"fmt"
	"html/template"
	texttemplate "text/template"
)

var inviteHTMLTmpl = template.Must(template.New("invite_html").Parse(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h2 style="color: #2d6a4f;">You've been invited to Finance Tracker</h2>
  <p>You've been invited to set up your account. Click the link below to set your password and get started:</p>
  <p style="margin: 24px 0;">
    <a href="{{.VerifyURL}}" style="background: #2d6a4f; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; display: inline-block;">Set Up Your Account</a>
  </p>
  <p style="color: #666; font-size: 14px;">Or copy this link: <code>{{.VerifyURL}}</code></p>
  <p style="color: #999; font-size: 12px;">This link expires in 48 hours. If you didn't expect this invitation, you can ignore this email.</p>
</body>
</html>`))

var inviteTextTmpl = texttemplate.Must(texttemplate.New("invite_text").Parse(`You've been invited to Finance Tracker

You've been invited to set up your account. Visit the link below to set your password:

{{.VerifyURL}}

This link expires in 48 hours. If you didn't expect this invitation, you can ignore this email.`))

type InviteEmailData struct {
	VerifyURL string
}

// RenderInviteEmail renders the invite email HTML and text bodies.
func RenderInviteEmail(appURL, token string) (html, text string, err error) {
	data := InviteEmailData{
		VerifyURL: fmt.Sprintf("%s/verify?token=%s", appURL, token),
	}

	var htmlBuf bytes.Buffer
	if err := inviteHTMLTmpl.Execute(&htmlBuf, data); err != nil {
		return "", "", fmt.Errorf("rendering invite HTML: %w", err)
	}

	var textBuf bytes.Buffer
	if err := inviteTextTmpl.Execute(&textBuf, data); err != nil {
		return "", "", fmt.Errorf("rendering invite text: %w", err)
	}

	return htmlBuf.String(), textBuf.String(), nil
}

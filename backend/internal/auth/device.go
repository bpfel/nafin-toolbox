package auth

import (
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Trusted-device cookies: the answer to the lockout an attacker can cause on
// purpose.
//
// Thirty wrong passwords an hour from anywhere shut an address out of signing
// in (LoginEmailLimiter), and anyone who knows the address can send them. A
// browser that has signed in to the account before carries a cookie saying
// so, and an attempt that carries a valid one is counted against that device
// alone (DeviceLimiter) instead of against the address and the client. The
// attacker has no such cookie, so they fill the address's limit for strangers
// only; the owner, on a device they have used before, signs in as usual.
//
// The cookie grants nothing. It decides which limit an attempt is counted
// against, and the password and the second factor are still required. See
// plans/attack-response-plan.md §1 and the OWASP note on device cookies.
//
// Its value is "v1.<nonce>.<user id>.<epoch>.<mac>":
//
//   - nonce: 16 random bytes naming this device, for its own limit and in the
//     audit log;
//   - epoch: users.device_epoch when it was issued. An admin reset and "sign
//     out everywhere" increment it, which retires every device cookie of the
//     account at once — both are answers to "someone else may have this";
//   - mac: HMAC-SHA256 over the rest, under a key derived from ENCRYPTION_KEY.
//
// Nothing is stored server-side. Without ENCRYPTION_KEY there is no key, and
// no cookie is issued or believed.

const (
	deviceCookiePrefix = "nafin_device_"
	deviceCookieMaxAge = 365 * 24 * time.Hour
	deviceCookieV      = "v1"
)

// TrustedDevice is a device cookie that checked out for one account.
type TrustedDevice struct {
	Nonce  string
	UserID int
}

// Short is the nonce's first 8 characters, enough to tell devices apart in
// the audit log without writing the whole cookie there.
func (d *TrustedDevice) Short() string {
	if len(d.Nonce) < 8 {
		return d.Nonce
	}
	return d.Nonce[:8]
}

func (deps *HandlerDeps) deviceKey() []byte {
	if deps.EncryptionKey == nil {
		return nil
	}
	key, err := hkdf.Key(sha256.New, deps.EncryptionKey, nil, "nafin device cookie", 32)
	if err != nil {
		return nil
	}
	return key
}

func deviceMAC(key []byte, nonce string, userID, epoch int) string {
	m := hmac.New(sha256.New, key)
	fmt.Fprintf(m, "%s|%s|%d|%d", deviceCookieV, nonce, userID, epoch)
	return base64.RawURLEncoding.EncodeToString(m.Sum(nil))
}

// mintDevice returns a cookie value for a device of user, keeping nonce when
// the device already has one so that its limit and its audit trail carry on.
func mintDevice(key []byte, nonce string, user *User) (string, string, error) {
	if nonce == "" {
		b := make([]byte, 16)
		if _, err := rand.Read(b); err != nil {
			return "", "", err
		}
		nonce = base64.RawURLEncoding.EncodeToString(b)
	}
	mac := deviceMAC(key, nonce, user.ID, user.DeviceEpoch)
	return strings.Join([]string{deviceCookieV, nonce, strconv.Itoa(user.ID), strconv.Itoa(user.DeviceEpoch), mac}, "."), nonce, nil
}

// verifyDevice checks a cookie value against user as they are now.
func verifyDevice(key []byte, value string, user *User) (*TrustedDevice, bool) {
	parts := strings.Split(value, ".")
	if len(parts) != 5 || parts[0] != deviceCookieV {
		return nil, false
	}
	uid, err1 := strconv.Atoi(parts[2])
	epoch, err2 := strconv.Atoi(parts[3])
	if err1 != nil || err2 != nil || uid != user.ID || epoch != user.DeviceEpoch {
		return nil, false
	}
	want := deviceMAC(key, parts[1], uid, epoch)
	if !hmac.Equal([]byte(want), []byte(parts[4])) {
		return nil, false
	}
	return &TrustedDevice{Nonce: parts[1], UserID: uid}, true
}

// trustedDevice reports whether r comes from a device user has signed in on
// before. nil when it does not, when user is nil, or when there is no key.
func (deps *HandlerDeps) trustedDevice(r *http.Request, user *User) *TrustedDevice {
	key := deps.deviceKey()
	if key == nil || user == nil || deps.DeviceLimiter == nil {
		return nil
	}
	c, err := r.Cookie(deviceCookiePrefix + strconv.Itoa(user.ID))
	if err != nil {
		return nil
	}
	d, ok := verifyDevice(key, c.Value, user)
	if !ok {
		return nil
	}
	return d
}

// rememberDevice sets, or renews, the cookie that makes this browser a
// trusted device of user. Called when a sign-in is complete — after the second
// factor, where there is one — and never on the strength of a password alone
// on an account that has a second factor.
func (deps *HandlerDeps) rememberDevice(w http.ResponseWriter, r *http.Request, user *User) {
	key := deps.deviceKey()
	if key == nil || deps.DeviceLimiter == nil {
		return
	}
	nonce := ""
	if d := deps.trustedDevice(r, user); d != nil {
		nonce = d.Nonce
	}
	value, _, err := mintDevice(key, nonce, user)
	if err != nil {
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name:  deviceCookiePrefix + strconv.Itoa(user.ID),
		Value: value,
		// Sent with sign-in requests only; nothing else reads it.
		Path:     "/api/auth",
		HttpOnly: true,
		Secure:   isSecureCookie(),
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(deviceCookieMaxAge / time.Second),
	})
}

// deviceAudit is what a sign-in's audit row says about the device it came
// from.
func deviceAudit(d *TrustedDevice, meta map[string]any) map[string]any {
	if meta == nil {
		meta = map[string]any{}
	}
	if d == nil {
		meta["device"] = "unknown"
	} else {
		meta["device"] = "known"
		meta["device_id"] = d.Short()
	}
	return meta
}

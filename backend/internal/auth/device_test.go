package auth

import (
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDeviceCookie_RoundTrip(t *testing.T) {
	key := testDepsWithKey().deviceKey()
	user := &User{ID: 7, DeviceEpoch: 2}

	value, nonce, err := mintDevice(key, "", user)
	if err != nil {
		t.Fatal(err)
	}
	d, ok := verifyDevice(key, value, user)
	if !ok || d.Nonce != nonce || d.UserID != 7 {
		t.Fatalf("verify = %+v %v, want nonce %s for user 7", d, ok, nonce)
	}

	// Renewing keeps the nonce, so the device keeps its limit and its name.
	again, kept, _ := mintDevice(key, nonce, user)
	if kept != nonce || again != value {
		t.Errorf("renewal changed the device: %s -> %s", nonce, kept)
	}
}

func TestDeviceCookie_RefusedWhenAnythingIsOff(t *testing.T) {
	key := testDepsWithKey().deviceKey()
	user := &User{ID: 7, DeviceEpoch: 2}
	value, _, _ := mintDevice(key, "", user)
	parts := strings.Split(value, ".")

	for name, tc := range map[string]struct {
		value string
		user  *User
	}{
		"another account":     {value, &User{ID: 8, DeviceEpoch: 2}},
		"a newer epoch":       {value, &User{ID: 7, DeviceEpoch: 3}},
		"a forged user id":    {strings.Join([]string{parts[0], parts[1], "8", parts[3], parts[4]}, "."), &User{ID: 8, DeviceEpoch: 2}},
		"a tampered mac":      {value[:len(value)-2] + "AA", user},
		"another key":         {func() string { v, _, _ := mintDevice([]byte("another key, 32 bytes long......"), "", user); return v }(), user},
		"not a device cookie": {"session-token", user},
	} {
		if _, ok := verifyDevice(key, tc.value, tc.user); ok {
			t.Errorf("%s: accepted", name)
		}
	}
}

func TestTrustedDevice_NoneWithoutAKey(t *testing.T) {
	deps := testDeps() // no ENCRYPTION_KEY
	if deps.deviceKey() != nil {
		t.Fatal("a device key without ENCRYPTION_KEY")
	}
	r := httptest.NewRequest("POST", "/api/auth/login", nil)
	if deps.trustedDevice(r, &User{ID: 1}) != nil {
		t.Error("a device was trusted without a key")
	}
}

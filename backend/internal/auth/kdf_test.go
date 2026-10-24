package auth

import "testing"

// Computed independently with Python's hashlib and hmac, not with this code or
// the browser's; keys.test.ts checks the browser against the same values.
func TestDeriveAuthKey_MatchesTheVectors(t *testing.T) {
	for _, tc := range []struct{ password, email, want string }{
		{"correct horse battery staple", "Anna@Example.ch", "9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo="},
		{"Grüezi-Chuchichäschtli", "ben@example.ch", "nnohXZbg/yNYvts4BMMgG5b3N6n4SRd8UFt2kzxl6eI="},
	} {
		got, err := DeriveAuthKey(tc.password, tc.email, 1000)
		if err != nil || got != tc.want {
			t.Errorf("DeriveAuthKey(%q, %q) = %s, %v; want %s", tc.password, tc.email, got, err, tc.want)
		}
	}
}

func TestValidAuthKey(t *testing.T) {
	for s, want := range map[string]bool{
		"9Zfg+s4rJYaiivhdlz/u8GOazhAx/PispqJSaPQalfo=": true,
		"correct horse battery staple":                 false, // a password is not an auth key
		"9Zfg+s4rJYaiivhdlz/u8GOazhAx/Pisp":            false,
		"":                                             false,
	} {
		if got := ValidAuthKey(s); got != want {
			t.Errorf("ValidAuthKey(%q) = %v, want %v", s, got, want)
		}
	}
}

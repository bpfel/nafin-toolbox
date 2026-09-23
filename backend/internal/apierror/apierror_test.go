package apierror

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

func TestWriteCarriesTheCode(t *testing.T) {
	rec := httptest.NewRecorder()

	Write(rec, Auth, http.StatusBadRequest, "invalid or expired token")

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	var got struct{ Error, Code string }
	if err := json.NewDecoder(rec.Body).Decode(&got); err != nil {
		t.Fatalf("body is not JSON: %v", err)
	}
	if got.Error != "invalid or expired token" {
		t.Errorf("error = %q", got.Error)
	}
	if got.Code != "AUTH-020" {
		t.Errorf("code = %q, want AUTH-020", got.Code)
	}
}

// The same message in different areas must not share a code, or the code stops
// saying where to look — which is the only reason it exists.
func TestSameMessageDiffersByArea(t *testing.T) {
	if CodeFor(Auth, "internal error") == CodeFor(Vault, "internal error") {
		t.Error("auth and vault share a code for 'internal error'")
	}
}

func TestUnknownMessageIsVisiblyUnknown(t *testing.T) {
	got := CodeFor(Auth, "something nobody registered")

	if got != "AUTH-000" {
		t.Errorf("got %q, want AUTH-000 so the gap is obvious", got)
	}
}

func TestCodesAreUnique(t *testing.T) {
	seen := map[string]string{}
	for key, code := range Codes() {
		if prev, dup := seen[code]; dup {
			t.Errorf("code %s used by both %q and %q", code, prev, key)
		}
		seen[code] = key
	}
}

func TestCodesLookLikeCodes(t *testing.T) {
	shape := regexp.MustCompile(`^[A-Z]+-\d{3}$`)
	for key, code := range Codes() {
		if !shape.MatchString(code) {
			t.Errorf("%q has code %q, which is not AREA-NNN", key, code)
		}
	}
}

// The point of the table: every message a handler actually returns has to be in
// it, or a user reads out AUTH-000 and we learn nothing.
func TestEveryHandlerMessageHasACode(t *testing.T) {
	areaOf := map[string]string{
		"Auth": Auth, "Vault": Vault, "Module": Module, "Server": Server, "Upkeep": Upkeep,
	}
	call := regexp.MustCompile(`apierror\.Write\(w, apierror\.(\w+), [^,]+, "([^"]*)"\)`)

	root := filepath.Join("..", "..", "internal")
	err := filepath.Walk(root, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() || !strings.HasSuffix(path, ".go") {
			return err
		}
		src, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		for _, m := range call.FindAllStringSubmatch(string(src), -1) {
			areaConst, message := m[1], m[2]
			area, known := areaOf[areaConst]
			if !known {
				t.Errorf("%s uses an area constant this test does not know: %s", path, areaConst)
				continue
			}
			if got := CodeFor(area, message); strings.HasSuffix(got, unknownSuffix) {
				t.Errorf("%s returns %q with no code registered", path, message)
			}
		}
		return nil
	})
	if err != nil {
		t.Fatalf("walking sources: %v", err)
	}
}

# QR Bill Feature — In-Progress Snapshot

This document preserves the in-progress QR Bill feature work that was found uncommitted.
It can be used to recreate the feature on a dedicated branch.

## Overview

A Swiss QR Bill generator endpoint (`POST /api/qrbill/generate`) that:
1. Accepts a JSON request with creditor/debtor info, IBAN, amount, reference
2. Validates all fields per Swiss Payment Standards (SPC v2.3)
3. Builds the 31-line SPC payload
4. Generates an SVG QR code and returns it as `image/svg+xml`

## Dependencies Added

### Backend (go.mod)
```
github.com/skip2/go-qrcode v0.0.0-20200617195104-da1b6568686e
```

### Frontend (package.json)
```json
"dependencies": {
  "swissqrbill": "^4.2.1"
}
```

## Files Created

### backend/internal/qrbill/model.go

```go
package qrbill

type Address struct {
	Name           string `json:"name"`
	Street         string `json:"street"`
	BuildingNumber string `json:"building_number"`
	PostalCode     string `json:"postal_code"`
	City           string `json:"city"`
	Country        string `json:"country"`
}

type QRBillRequest struct {
	// Required
	IBAN     string  `json:"iban"`
	Creditor Address `json:"creditor"`
	Currency string  `json:"currency"`

	// Optional
	Amount         *string  `json:"amount,omitempty"`
	Debtor         *Address `json:"debtor,omitempty"`
	ReferenceType  string   `json:"reference_type,omitempty"`
	Reference      string   `json:"reference,omitempty"`
	AdditionalInfo string   `json:"additional_info,omitempty"`
}

type ValidationError struct {
	Field   string `json:"field"`
	Message string `json:"message"`
}

type ErrorResponse struct {
	Errors []ValidationError `json:"errors"`
}
```

### backend/internal/qrbill/validate.go

```go
package qrbill

import (
	"math/big"
	"regexp"
	"strings"
)

var (
	amountRegex = regexp.MustCompile(`^\d{1,9}(\.\d{1,2})?$`)
	ibanRegex   = regexp.MustCompile(`^(CH|LI)\d{19}$`)
)

func Validate(req *QRBillRequest) []ValidationError {
	var errs []ValidationError

	errs = validateIBAN(req.IBAN, errs)
	errs = validateCurrency(req.Currency, errs)
	errs = validateAddress(req.Creditor, "creditor", true, errs)

	if req.Amount != nil {
		if !amountRegex.MatchString(*req.Amount) {
			errs = append(errs, ValidationError{
				Field:   "amount",
				Message: "must be a decimal number with up to 9 integer digits and up to 2 decimal places",
			})
		}
	}

	if req.Debtor != nil {
		errs = validateAddress(*req.Debtor, "debtor", true, errs)
	}

	errs = validateReference(req.ReferenceType, req.Reference, errs)

	if len(req.AdditionalInfo) > 140 {
		errs = append(errs, ValidationError{
			Field:   "additional_info",
			Message: "must be at most 140 characters",
		})
	}

	return errs
}

func validateIBAN(iban string, errs []ValidationError) []ValidationError {
	cleaned := strings.ReplaceAll(iban, " ", "")
	if cleaned == "" {
		return append(errs, ValidationError{
			Field:   "iban",
			Message: "is required",
		})
	}
	if !ibanRegex.MatchString(cleaned) {
		return append(errs, ValidationError{
			Field:   "iban",
			Message: "must be a valid Swiss or Liechtenstein IBAN (CH/LI followed by 19 digits)",
		})
	}
	if !validIBANChecksum(cleaned) {
		return append(errs, ValidationError{
			Field:   "iban",
			Message: "has an invalid checksum",
		})
	}
	return errs
}

// validIBANChecksum verifies the IBAN mod-97 checksum.
// Move first 4 chars to end, convert letters to digits (A=10..Z=35), check mod 97 == 1.
func validIBANChecksum(iban string) bool {
	rearranged := iban[4:] + iban[:4]
	var digits strings.Builder
	for _, ch := range rearranged {
		if ch >= 'A' && ch <= 'Z' {
			digits.WriteString(big.NewInt(int64(ch - 'A' + 10)).String())
		} else {
			digits.WriteRune(ch)
		}
	}
	n := new(big.Int)
	n.SetString(digits.String(), 10)
	mod := new(big.Int)
	mod.Mod(n, big.NewInt(97))
	return mod.Int64() == 1
}

func validateCurrency(currency string, errs []ValidationError) []ValidationError {
	if currency != "CHF" && currency != "EUR" {
		return append(errs, ValidationError{
			Field:   "currency",
			Message: "must be CHF or EUR",
		})
	}
	return errs
}

func validateAddress(addr Address, prefix string, required bool, errs []ValidationError) []ValidationError {
	if required {
		if addr.Name == "" {
			errs = append(errs, ValidationError{Field: prefix + ".name", Message: "is required"})
		}
		if addr.Street == "" {
			errs = append(errs, ValidationError{Field: prefix + ".street", Message: "is required"})
		}
		if addr.PostalCode == "" {
			errs = append(errs, ValidationError{Field: prefix + ".postal_code", Message: "is required"})
		}
		if addr.City == "" {
			errs = append(errs, ValidationError{Field: prefix + ".city", Message: "is required"})
		}
		if addr.Country == "" {
			errs = append(errs, ValidationError{Field: prefix + ".country", Message: "is required"})
		}
	}
	if len(addr.Name) > 70 {
		errs = append(errs, ValidationError{Field: prefix + ".name", Message: "must be at most 70 characters"})
	}
	if len(addr.Country) != 0 && len(addr.Country) != 2 {
		errs = append(errs, ValidationError{Field: prefix + ".country", Message: "must be a 2-letter country code"})
	}
	return errs
}

func validateReference(refType, ref string, errs []ValidationError) []ValidationError {
	switch refType {
	case "", "NON":
		if ref != "" {
			errs = append(errs, ValidationError{
				Field:   "reference",
				Message: "must be empty when reference_type is NON",
			})
		}
	case "QRR":
		if !regexp.MustCompile(`^\d{27}$`).MatchString(ref) {
			errs = append(errs, ValidationError{
				Field:   "reference",
				Message: "must be exactly 27 digits for QRR reference type",
			})
		}
	case "SCOR":
		if len(ref) < 5 || len(ref) > 25 {
			errs = append(errs, ValidationError{
				Field:   "reference",
				Message: "must be 5-25 characters for SCOR reference type (ISO 11649)",
			})
		}
	default:
		errs = append(errs, ValidationError{
			Field:   "reference_type",
			Message: "must be QRR, SCOR, or NON",
		})
	}
	return errs
}
```

### backend/internal/qrbill/payload.go

```go
package qrbill

import (
	"strings"
)

// BuildPayload constructs the SPC v2.3 payload: a 31-line newline-delimited string.
//
// Line layout:
//
//	 0: SPC (header)
//	 1: 0200 (version)
//	 2: 1 (coding type = UTF-8)
//	 3: Creditor IBAN
//	 4-10: Creditor address (type S + 6 fields)
//	11-17: Ultimate creditor (7 empty lines — reserved)
//	18: Amount (or empty)
//	19: Currency
//	20-26: Debtor address (type S + 6 fields, or 7 empty lines)
//	27: Reference type
//	28: Reference
//	29: Additional info
//	30: EPD (trailer)
func BuildPayload(req *QRBillRequest) string {
	lines := make([]string, 31)

	// Header
	lines[0] = "SPC"
	lines[1] = "0200"
	lines[2] = "1"

	// Creditor IBAN (strip spaces)
	lines[3] = strings.ReplaceAll(req.IBAN, " ", "")

	// Creditor address (structured: type S)
	lines[4] = "S"
	lines[5] = req.Creditor.Name
	lines[6] = req.Creditor.Street
	lines[7] = req.Creditor.BuildingNumber
	lines[8] = req.Creditor.PostalCode
	lines[9] = req.Creditor.City
	lines[10] = req.Creditor.Country

	// Ultimate creditor — reserved, 7 empty lines
	for i := 11; i <= 17; i++ {
		lines[i] = ""
	}

	// Amount + Currency
	if req.Amount != nil {
		lines[18] = *req.Amount
	} else {
		lines[18] = ""
	}
	lines[19] = req.Currency

	// Debtor address
	if req.Debtor != nil {
		lines[20] = "S"
		lines[21] = req.Debtor.Name
		lines[22] = req.Debtor.Street
		lines[23] = req.Debtor.BuildingNumber
		lines[24] = req.Debtor.PostalCode
		lines[25] = req.Debtor.City
		lines[26] = req.Debtor.Country
	} else {
		for i := 20; i <= 26; i++ {
			lines[i] = ""
		}
	}

	// Reference
	refType := req.ReferenceType
	if refType == "" {
		refType = "NON"
	}
	lines[27] = refType
	lines[28] = req.Reference

	// Additional info
	lines[29] = req.AdditionalInfo

	// Trailer
	lines[30] = "EPD"

	return strings.Join(lines, "\n")
}
```

### backend/internal/qrbill/svg.go

```go
package qrbill

import (
	"fmt"
	"strings"

	qrcode "github.com/skip2/go-qrcode"
)

const blockSize = 10 // pixels per QR module

// GenerateSVG encodes the payload as a QR code and returns an SVG string.
func GenerateSVG(payload string) (string, error) {
	qr, err := qrcode.New(payload, qrcode.Medium)
	if err != nil {
		return "", fmt.Errorf("qr encode: %w", err)
	}
	qr.DisableBorder = true
	bitmap := qr.Bitmap()

	modules := len(bitmap)
	quietZone := 4 // modules of white border
	totalModules := modules + 2*quietZone
	size := totalModules * blockSize

	var b strings.Builder
	fmt.Fprintf(&b, `<svg xmlns="http://www.w3.org/2000/svg" width="%d" height="%d" viewBox="0 0 %d %d">`, size, size, size, size)
	fmt.Fprintf(&b, `<rect width="%d" height="%d" fill="white"/>`, size, size)

	for y, row := range bitmap {
		for x, black := range row {
			if black {
				px := (x + quietZone) * blockSize
				py := (y + quietZone) * blockSize
				fmt.Fprintf(&b, `<rect x="%d" y="%d" width="%d" height="%d" fill="black"/>`, px, py, blockSize, blockSize)
			}
		}
	}

	b.WriteString(`</svg>`)
	return b.String(), nil
}
```

### backend/internal/qrbill/handler.go

```go
package qrbill

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
)

func Routes() func(r chi.Router) {
	return func(r chi.Router) {
		r.Post("/generate", handleGenerate)
	}
}

func handleGenerate(w http.ResponseWriter, r *http.Request) {
	var req QRBillRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{
			Errors: []ValidationError{{Field: "body", Message: "invalid JSON"}},
		})
		return
	}

	if errs := Validate(&req); len(errs) > 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnprocessableEntity)
		json.NewEncoder(w).Encode(ErrorResponse{Errors: errs})
		return
	}

	payload := BuildPayload(&req)

	svg, err := GenerateSVG(payload)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "image/svg+xml")
	w.Write([]byte(svg))
}
```

## Route Registration (server.go change)

```go
// In routes(), inside the /api group:
r.Route("/qrbill", qrbill.Routes())
```

## To Recreate

1. Create a branch `feature/qrbill`
2. Add the 5 files under `backend/internal/qrbill/`
3. Add `github.com/skip2/go-qrcode` to go.mod: `go get github.com/skip2/go-qrcode`
4. Add `swissqrbill` to frontend: `npm install swissqrbill`
5. Register the route in `server.go`

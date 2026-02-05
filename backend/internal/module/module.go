package module

import "time"

// Module represents an enabled feature module in the app.
type Module struct {
	ID        string    `json:"id"`
	Name      string    `json:"name"`
	EnabledAt time.Time `json:"enabled_at"`
}

// Available module IDs.
const (
	Accounts    = "accounts"
	Budget      = "budget"
	Allocations = "allocations"
	Provision3a = "provision3a"
	Investments = "investments"
)

// NetWorthContributor is implemented by modules that contribute to the net worth calculation.
type NetWorthContributor interface {
	// NetWorth returns the total value this module contributes in base currency (CHF).
	NetWorth() (float64, error)
}

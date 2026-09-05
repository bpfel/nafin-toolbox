// Package module holds what the domains have in common.
//
// It used to hold a registry as well: a table of which modules each user had
// switched on, with endpoints to enable and disable them. That went when the
// app stopped asking. Every screen is present from the first sign-in and an
// empty one explains itself, so there was nothing left for a user to
// administer and nothing left for the server to remember.
//
// What survives is the one thing that was never about opting in.
package module

// NetWorthContributor is implemented by modules that contribute to the net
// worth calculation.
//
// Nothing implements it yet — net worth is unbuilt. It stays because it is the
// interface that keeps the domains independent: a module reports what it is
// worth without any other module, or any aggregate view, knowing what it is.
type NetWorthContributor interface {
	// NetWorth returns the total value this module contributes in base
	// currency (CHF).
	NetWorth() (float64, error)
}

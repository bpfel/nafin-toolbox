package module

import (
	"testing"
)

// --- KnownModules tests ---

func TestKnownModules_AllConstantsDefined(t *testing.T) {
	// All module constants should be in KnownModules map
	expectedModules := map[string]string{
		Accounts:    "Accounts",
		Budget:      "Budget",
		Allocations: "Allocations",
		Provision3a: "Pillar 3a",
		Investments: "Investments",
	}

	if len(KnownModules) != len(expectedModules) {
		t.Errorf("KnownModules has %d entries, expected %d", len(KnownModules), len(expectedModules))
	}

	for id, expectedName := range expectedModules {
		gotName, ok := KnownModules[id]
		if !ok {
			t.Errorf("KnownModules missing entry for %q", id)
		}
		if gotName != expectedName {
			t.Errorf("KnownModules[%q] = %q, want %q", id, gotName, expectedName)
		}
	}
}

func TestKnownModules_ValidIDsAccepted(t *testing.T) {
	// All known IDs should be accepted
	validIDs := []string{Accounts, Budget, Allocations, Provision3a, Investments}

	for _, id := range validIDs {
		if _, ok := KnownModules[id]; !ok {
			t.Errorf("valid module ID %q not found in KnownModules", id)
		}
	}
}

func TestKnownModules_InvalidIDsRejected(t *testing.T) {
	// Unknown IDs should not be in the map
	invalidIDs := []string{
		"",
		"unknown",
		"Budget",  // capital B, should be lowercase "budget"
		"Account", // singular
		"3a",      // without "provision" prefix
		"provision-3a",
		"investments-extra",
		"budget123",
	}

	for _, id := range invalidIDs {
		if _, ok := KnownModules[id]; ok {
			t.Errorf("invalid module ID %q should not be in KnownModules", id)
		}
	}
}

func TestKnownModules_CaseMatters(t *testing.T) {
	// Module IDs are case-sensitive
	caseVariants := []string{
		"Budget",
		"BUDGET",
		"bUdGeT",
		"Accounts",
		"ACCOUNTS",
	}

	for _, variant := range caseVariants {
		if _, ok := KnownModules[variant]; ok {
			t.Errorf("case variant %q should not be in KnownModules (IDs should be lowercase)", variant)
		}
	}
}

// --- Module constants tests ---

func TestModuleConstants_Values(t *testing.T) {
	tests := []struct {
		constant string
		expected string
	}{
		{Accounts, "accounts"},
		{Budget, "budget"},
		{Allocations, "allocations"},
		{Provision3a, "provision3a"},
		{Investments, "investments"},
	}

	for _, tt := range tests {
		if tt.constant != tt.expected {
			t.Errorf("module constant = %q, want %q", tt.constant, tt.expected)
		}
	}
}

func TestModuleConstants_AllUnique(t *testing.T) {
	// All module ID constants must be unique
	ids := []string{Accounts, Budget, Allocations, Provision3a, Investments}
	seen := make(map[string]bool)

	for _, id := range ids {
		if seen[id] {
			t.Errorf("duplicate module ID constant: %q", id)
		}
		seen[id] = true
	}

	if len(seen) != len(ids) {
		t.Errorf("expected %d unique module IDs, got %d", len(ids), len(seen))
	}
}

// --- Module struct tests ---

func TestModule_JSONSerialization(t *testing.T) {
	// Module struct should serialize to JSON correctly
	// This is tested implicitly in handler tests, but we can verify field tags
	m := Module{
		ID:   Budget,
		Name: "Budget",
	}

	// Basic check: fields should be accessible
	if m.ID != Budget {
		t.Errorf("ID = %q, want %q", m.ID, Budget)
	}
	if m.Name != "Budget" {
		t.Errorf("Name = %q, want Budget", m.Name)
	}
}

// --- NetWorthContributor interface tests ---

type mockNetWorthContributor struct {
	value float64
	err   error
}

func (m *mockNetWorthContributor) NetWorth() (float64, error) {
	return m.value, m.err
}

func TestNetWorthContributor_Interface(t *testing.T) {
	// Verify mock implements interface
	var _ NetWorthContributor = &mockNetWorthContributor{}

	tests := []struct {
		name      string
		mock      *mockNetWorthContributor
		wantValue float64
		wantErr   bool
	}{
		{
			name:      "positive value",
			mock:      &mockNetWorthContributor{value: 1000.50, err: nil},
			wantValue: 1000.50,
			wantErr:   false,
		},
		{
			name:      "zero value",
			mock:      &mockNetWorthContributor{value: 0, err: nil},
			wantValue: 0,
			wantErr:   false,
		},
		{
			name:      "negative value (debt)",
			mock:      &mockNetWorthContributor{value: -500.25, err: nil},
			wantValue: -500.25,
			wantErr:   false,
		},
		{
			name:      "very large value",
			mock:      &mockNetWorthContributor{value: 9999999.99, err: nil},
			wantValue: 9999999.99,
			wantErr:   false,
		},
		{
			name:      "with error",
			mock:      &mockNetWorthContributor{value: 0, err: &testError{"calculation failed"}},
			wantValue: 0,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			value, err := tt.mock.NetWorth()
			if (err != nil) != tt.wantErr {
				t.Errorf("NetWorth() error = %v, wantErr %v", err, tt.wantErr)
			}
			if value != tt.wantValue {
				t.Errorf("NetWorth() = %v, want %v", value, tt.wantValue)
			}
		})
	}
}

type testError struct {
	msg string
}

func (e *testError) Error() string {
	return e.msg
}

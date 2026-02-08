package budget

import (
	"testing"
)

func TestFormatAmount(t *testing.T) {
	tests := []struct {
		name  string
		input float64
		want  string
	}{
		{name: "zero", input: 0, want: "0.00"},
		{name: "positive", input: 123.456, want: "123.46"},
		{name: "negative", input: -50.005, want: "-50.01"},
		{name: "rounds down", input: 99.994, want: "99.99"},
		{name: "rounds up", input: 99.995, want: "100.00"},
		{name: "large number", input: 9999999999.99, want: "9999999999.99"},
		{name: "small fraction", input: 0.01, want: "0.01"},
		{name: "whole number", input: 500, want: "500.00"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatAmount(tt.input)
			if got != tt.want {
				t.Errorf("formatAmount(%f) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

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
		{name: "zero", input: 0, want: "0.0000"},
		{name: "positive", input: 123.456, want: "123.4560"},
		{name: "negative", input: -50.005, want: "-50.0050"},
		{name: "rounds down at 4dp", input: 99.99994, want: "99.9999"},
		{name: "rounds up at 4dp", input: 99.99995, want: "100.0000"},
		{name: "large number", input: 9999999999.9999, want: "9999999999.9999"},
		{name: "small fraction", input: 0.0001, want: "0.0001"},
		{name: "whole number", input: 500, want: "500.0000"},
		{name: "yearly div12 precision", input: 10000.0 / 12, want: "833.3333"},
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

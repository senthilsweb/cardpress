//go:build windows

package service

// DiskPercent is not worked out on Windows.
func DiskPercent(string) (int, bool) { return 0, false }

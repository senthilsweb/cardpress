//go:build !windows

package service

import "syscall"

// DiskPercent says how full the disk holding path is.
func DiskPercent(path string) (int, bool) {
	var s syscall.Statfs_t
	if err := syscall.Statfs(path, &s); err != nil || s.Blocks == 0 {
		return 0, false
	}
	used := uint64(s.Blocks) - uint64(s.Bfree)
	// of what can be used at all, as df counts it
	room := used + uint64(s.Bavail)
	if room == 0 {
		return 0, false
	}
	return int(used * 100 / room), true
}

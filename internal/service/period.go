package service

import "time"

// Days is a stretch of whole days in someone's time zone, from the first day's start to the end of the last. A zero
// From or Until leaves that end open.
type Days struct {
	From, Until time.Time // Until is the start of the day after the last one
}

// Holds says whether a moment, as stored (RFC 3339), falls in the days. With both ends open everything does, even a
// time that cannot be read.
func (d Days) Holds(stored string) bool {
	if d.From.IsZero() && d.Until.IsZero() {
		return true
	}
	at, err := time.Parse(time.RFC3339, stored)
	if err != nil {
		return false
	}
	return !at.Before(d.From) && (d.Until.IsZero() || at.Before(d.Until))
}

// maxRangeDays keeps a chosen range, and so the chart over it, to a sensible length.
const maxRangeDays = 5*366 + 1

// timeZone is the named zone; none is UTC.
func timeZone(name string) (*time.Location, error) {
	if name == "" {
		return time.UTC, nil
	}
	z, err := time.LoadLocation(name)
	if err != nil || name == "Local" {
		return nil, invalid("that is not a time zone")
	}
	return z, nil
}

// dayRange reads a first and a last day (YYYY-MM-DD), given together or not at all.
func dayRange(from, to string, zone *time.Location) (Days, error) {
	if from == "" && to == "" {
		return Days{}, nil
	}
	a, errA := time.ParseInLocation(time.DateOnly, from, zone)
	b, errB := time.ParseInLocation(time.DateOnly, to, zone)
	switch {
	case errA != nil || errB != nil || a.Year() < 2000 || b.Year() > 9000:
		return Days{}, invalid("from and to must both be days, such as 2026-11-01")
	case b.Before(a):
		return Days{}, invalid("the first day must not be after the last")
	case b.After(a.AddDate(0, 0, maxRangeDays-1)):
		return Days{}, invalid("choose at most five years")
	}
	return Days{From: a, Until: b.AddDate(0, 0, 1)}, nil
}

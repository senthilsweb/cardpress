package service

import (
	"context"
	"errors"
	"testing"
	"time"
)

func TestASessionEndsWithoutUseAndInAll(t *testing.T) {
	a, _ := newAccounts(t, AccountsOptions{SessionIdle: 20 * time.Minute, SessionMax: time.Hour})
	ctx := context.Background()
	clock := time.Date(2026, 11, 28, 9, 0, 0, 0, time.UTC)
	a.now = func() time.Time { return clock }
	u, err := a.Signup(ctx, signup("ada@example.com"))
	if err != nil {
		t.Fatal(err)
	}
	start := func() string {
		token, err := a.StartSession(ctx, u.ID)
		if err != nil {
			t.Fatal(err)
		}
		return token
	}
	at := func(token string, use bool) (SessionTimes, error) {
		_, times, err := a.Session(ctx, token, use)
		return times, err
	}

	// use starts the idle time again
	token := start()
	clock = clock.Add(19 * time.Minute)
	if times, err := at(token, true); err != nil || times.Remaining != 20*time.Minute || times.Limit != "idle" {
		t.Fatalf("%+v %v", times, err)
	}
	clock = clock.Add(20 * time.Minute)
	if _, err := at(token, true); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("20 minutes without use ends it: %v", err)
	}

	// a look that is not use extends nothing
	token = start()
	clock = clock.Add(15 * time.Minute)
	if times, err := at(token, false); err != nil || times.Remaining != 5*time.Minute {
		t.Fatalf("%+v %v", times, err)
	}
	clock = clock.Add(5 * time.Minute)
	if _, err := at(token, false); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("background requests must not keep it: %v", err)
	}

	// however much it is used, it ends after the longest time
	token = start()
	for range 3 {
		clock = clock.Add(15 * time.Minute)
		if _, err := at(token, true); err != nil {
			t.Fatal(err)
		}
	}
	if times, _ := at(token, true); times.Limit != "max" || times.Remaining != 15*time.Minute {
		t.Fatalf("%+v", times)
	}
	clock = clock.Add(15 * time.Minute)
	if _, err := at(token, true); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("an hour ends it: %v", err)
	}
}

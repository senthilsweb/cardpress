package service

import (
	"context"
	"encoding/json"
	"errors"
	"path/filepath"
	"testing"

	"github.com/senthilsweb/cardpress/internal/store"
)

func newStudio(t *testing.T) *Studio {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, "file:"+filepath.Join(t.TempDir(), "t.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	return New(db.DB)
}

func raw(s string) json.RawMessage { return json.RawMessage(s) }

func TestEmptyStateIsNotNil(t *testing.T) {
	st, err := newStudio(t).State(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if st.Profiles == nil || st.Designs == nil || st.Preferences == nil {
		t.Fatalf("nil collection in %+v", st)
	}
}

func TestProfilesRoundTripKeepOrderAndNeverRemove(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	if err := s.ReplaceProfiles(ctx, []json.RawMessage{raw(`{"id":"b","n":1}`), raw(`{"id":"a"}`)}); err != nil {
		t.Fatal(err)
	}
	st, _ := s.State(ctx)
	if len(st.Profiles) != 2 || string(st.Profiles[0]) != `{"id":"b","n":1}` {
		t.Fatalf("order or content lost: %s", st.Profiles)
	}
	// saving a different list updates and adds, but never removes: a stale client cannot delete a brand this way
	if err := s.ReplaceProfiles(ctx, []json.RawMessage{raw(`{"id":"c"}`), raw(`{"id":"b","n":2}`)}); err != nil {
		t.Fatal(err)
	}
	st, _ = s.State(ctx)
	if len(st.Profiles) != 3 || string(st.Profiles[0]) != `{"id":"b","n":2}` || string(st.Profiles[1]) != `{"id":"a"}` || string(st.Profiles[2]) != `{"id":"c"}` {
		t.Fatalf("expected b (updated, first), a, c: %s", st.Profiles)
	}
}

func TestProfileValidation(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	for name, list := range map[string][]json.RawMessage{
		"empty":      {},
		"no id":      {raw(`{"name":"x"}`)},
		"not object": {raw(`[1]`)},
		"duplicate":  {raw(`{"id":"a"}`), raw(`{"id":"a"}`)},
	} {
		if err := s.ReplaceProfiles(ctx, list); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: err = %v, want ErrInvalid", name, err)
		}
	}
}

func TestDesignsAndPreferences(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	if err := s.ReplaceDesigns(ctx, map[string]json.RawMessage{"a": raw(`{"title":"hi"}`)}); err != nil {
		t.Fatal(err)
	}
	if err := s.SetPreference(ctx, PrefTheme, raw(`"dark"`)); err != nil {
		t.Fatal(err)
	}
	if err := s.SetPreference(ctx, PrefTheme, raw(`"light"`)); err != nil { // upsert
		t.Fatal(err)
	}
	st, _ := s.State(ctx)
	if string(st.Designs["a"]) != `{"title":"hi"}` || string(st.Preferences[PrefTheme]) != `"light"` {
		t.Fatalf("%+v", st)
	}
	if err := s.SetPreference(ctx, PrefLayout, raw(`{"sidebarCollapsed":true,"collapsed":{"hashtags":true}}`)); err != nil {
		t.Fatalf("layout preference rejected: %v", err)
	}
	if err := s.SetPreference(ctx, "stripeKey", raw(`"x"`)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("unknown preference accepted: %v", err)
	}
	if err := s.SetPreference(ctx, PrefTheme, raw(`{bad`)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("invalid JSON accepted: %v", err)
	}
}

func TestImportLegacyOnlyIntoEmptyDatabase(t *testing.T) {
	s, ctx := newStudio(t), context.Background()
	legacy := Legacy{
		Profiles:    []json.RawMessage{raw(`{"id":"p"}`)},
		Designs:     map[string]json.RawMessage{"p": raw(`{"title":"t"}`)},
		Preferences: map[string]json.RawMessage{PrefTheme: raw(`"dark"`)},
	}
	if err := s.ImportLegacy(ctx, legacy); err != nil {
		t.Fatal(err)
	}
	st, _ := s.State(ctx)
	if len(st.Profiles) != 1 || len(st.Designs) != 1 || string(st.Preferences[PrefTheme]) != `"dark"` {
		t.Fatalf("%+v", st)
	}
	if err := s.ImportLegacy(ctx, legacy); !errors.Is(err, ErrConflict) {
		t.Fatalf("second import: %v, want ErrConflict", err)
	}
}

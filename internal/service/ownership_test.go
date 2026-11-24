package service

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"
)

type people struct {
	st               *Studio
	acc              *Accounts
	admin, ana, ben  User
	ctxAdmin, ctxAna context.Context
	ctxBen, ctxToken context.Context
	ctxSystem        context.Context
}

func newPeople(t *testing.T) *people {
	t.Helper()
	db := accountsDB(t)
	p := &people{st: New(db), acc: NewAccounts(db, AccountsOptions{}), ctxSystem: context.Background()}
	var err error
	if p.admin, err = p.acc.Signup(p.ctxSystem, signup("admin@example.com")); err != nil {
		t.Fatal(err)
	}
	if p.ana, err = p.acc.Signup(p.ctxSystem, SignupInput{FirstName: "Ana", LastName: "A", Email: "ana@example.com", Password: "correct horse battery"}); err != nil {
		t.Fatal(err)
	}
	if p.ben, err = p.acc.Signup(p.ctxSystem, SignupInput{FirstName: "Ben", LastName: "B", Email: "ben@example.com", Password: "correct horse battery"}); err != nil {
		t.Fatal(err)
	}
	p.ctxAdmin = WithPrincipal(p.ctxSystem, Principal{User: &p.admin})
	p.ctxAna = WithPrincipal(p.ctxSystem, Principal{User: &p.ana})
	p.ctxBen = WithPrincipal(p.ctxSystem, Principal{User: &p.ben})
	p.ctxToken = WithPrincipal(p.ctxSystem, Principal{Token: true})
	return p
}

func brandJSON(id string) json.RawMessage {
	return json.RawMessage(`{"id":"` + id + `","name":"` + id + `"}`)
}

func brandIDs(list []json.RawMessage) []string {
	var out []string
	for _, r := range list {
		var h struct{ ID string }
		_ = json.Unmarshal(r, &h)
		out = append(out, h.ID)
	}
	return out
}

func TestEachPersonSeesOnlyTheirOwnBrandsAndAnAdminSeesAll(t *testing.T) {
	p := newPeople(t)
	for _, c := range []struct {
		ctx context.Context
		id  string
	}{{p.ctxAna, "ana-1"}, {p.ctxAna, "ana-2"}, {p.ctxBen, "ben-1"}} {
		if err := p.st.CreateProfile(c.ctx, brandJSON(c.id)); err != nil {
			t.Fatal(err)
		}
	}
	for name, tc := range map[string]struct {
		ctx  context.Context
		want int
	}{"ana": {p.ctxAna, 2}, "ben": {p.ctxBen, 1}, "admin": {p.ctxAdmin, 3}, "token": {p.ctxToken, 3}, "system": {p.ctxSystem, 3}} {
		st, err := p.st.State(tc.ctx)
		if err != nil || len(st.Profiles) != tc.want {
			t.Errorf("%s: %v %v", name, brandIDs(st.Profiles), err)
		}
	}
	if st, _ := p.st.State(p.ctxBen); brandIDs(st.Profiles)[0] != "ben-1" {
		t.Fatal("ben sees his own")
	}
}

func TestSomeoneElsesBrandCannotBeChangedArchivedDeletedOrReordered(t *testing.T) {
	p := newPeople(t)
	p.st.CreateProfile(p.ctxAna, brandJSON("ana-1"))
	p.st.CreateProfile(p.ctxAna, brandJSON("ana-2"))
	p.st.CreateProfile(p.ctxBen, brandJSON("ben-1"))
	if err := p.st.ReplaceProfiles(p.ctxBen, []json.RawMessage{brandJSON("ana-1")}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("saving over another's brand: %v", err)
	}
	if err := p.st.SaveProfile(p.ctxBen, "ana-1", brandJSON("ana-1")); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if _, err := p.st.ArchiveProfile(p.ctxBen, "ana-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if err := p.st.RestoreProfile(p.ctxBen, "ana-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if err := p.st.DeleteProfile(p.ctxBen, "ana-1"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if err := p.st.ReorderProfiles(p.ctxBen, []string{"ana-1", "ana-2"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("an order can only name your own brands: %v", err)
	}
	// "keep at least one brand" is about your own brands, not everyone's
	if _, err := p.st.ArchiveProfile(p.ctxBen, "ben-1"); !errors.Is(err, ErrConflict) {
		t.Fatalf("ben has only one: %v", err)
	}
	if _, err := p.st.ArchiveProfile(p.ctxAna, "ana-2"); err != nil {
		t.Fatalf("ana has two: %v", err)
	}
	if _, err := p.st.ArchiveProfile(p.ctxAdmin, "ana-1"); err != nil {
		t.Fatalf("an admin may archive: %v", err)
	}
	// a brand is created with its caller as owner; the same id twice is a conflict whoever asks
	if err := p.st.CreateProfile(p.ctxBen, brandJSON("ana-1")); !errors.Is(err, ErrConflict) {
		t.Fatalf("%v", err)
	}
}

func TestPreferencesAndDesignsBelongToThePerson(t *testing.T) {
	p := newPeople(t)
	p.st.CreateProfile(p.ctxAna, brandJSON("ana-1"))
	p.st.CreateProfile(p.ctxBen, brandJSON("ben-1"))
	p.st.SetPreference(p.ctxAna, PrefTheme, json.RawMessage(`"dark"`))
	p.st.SetPreference(p.ctxBen, PrefTheme, json.RawMessage(`"light"`))
	a, _ := p.st.State(p.ctxAna)
	b, _ := p.st.State(p.ctxBen)
	if string(a.Preferences[PrefTheme]) != `"dark"` || string(b.Preferences[PrefTheme]) != `"light"` {
		t.Fatalf("%v %v", a.Preferences, b.Preferences)
	}
	if err := p.st.ReplaceDesigns(p.ctxAna, map[string]json.RawMessage{"ana-1": json.RawMessage(`{"title":"Ana's"}`)}); err != nil {
		t.Fatal(err)
	}
	if err := p.st.ReplaceDesigns(p.ctxBen, map[string]json.RawMessage{"ben-1": json.RawMessage(`{"title":"Ben's"}`)}); err != nil {
		t.Fatal(err)
	}
	a, _ = p.st.State(p.ctxAna)
	if string(a.Designs["ana-1"]) != `{"title":"Ana's"}` || len(a.Designs) != 1 {
		t.Fatalf("ben's save did not touch ana's design, and she does not see his: %v", a.Designs)
	}
	if err := p.st.ReplaceDesigns(p.ctxBen, map[string]json.RawMessage{"ana-1": json.RawMessage(`{"title":"stolen"}`)}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if all, _ := p.st.State(p.ctxAdmin); len(all.Designs) != 2 {
		t.Fatalf("the admin sees every design: %v", all.Designs)
	}
}

func TestDraftsRecordWhoWroteAndApprovedThem(t *testing.T) {
	p := newPeople(t)
	p.st.CreateProfile(p.ctxAna, brandJSON("ana-1"))
	d, err := p.st.CreateDraft(p.ctxAna, DraftInput{ProfileID: "ana-1", Kind: "post", Doc: docOf(para("Hello"))})
	if err != nil || d.CreatedBy != p.ana.ID || d.CreatedByName != "Ana A" || d.ApprovedBy != "" {
		t.Fatalf("%+v %v", d, err)
	}
	ap, err := p.st.Approve(p.ctxAdmin, d.ID)
	if err != nil || ap.ApprovedBy != p.admin.ID || ap.ApprovedByName != "Adminname" && ap.ApprovedByName != "Ada Lovelace" {
		t.Fatalf("%+v %v", ap, err)
	}
	back, _ := p.st.Unapprove(p.ctxAna, d.ID)
	if back.ApprovedBy != "" || back.CreatedBy != p.ana.ID {
		t.Fatalf("%+v", back)
	}
}

func TestLibraryAndPostListsStayWithinWhatThePersonMaySee(t *testing.T) {
	p := newPeople(t)
	db := p.st.db
	p.st.CreateProfile(p.ctxAna, brandJSON("ana-1"))
	p.st.CreateProfile(p.ctxBen, brandJSON("ben-1"))
	p.st.CreateDraft(p.ctxAna, DraftInput{ProfileID: "ana-1", Kind: "post", Doc: docOf(para("Ana's words"))})
	p.st.CreateDraft(p.ctxBen, DraftInput{ProfileID: "ben-1", Kind: "post", Doc: docOf(para("Ben's words"))})
	lib := NewLibrary(db)
	for name, tc := range map[string]struct {
		ctx  context.Context
		want int
	}{"ana": {p.ctxAna, 1}, "ben": {p.ctxBen, 1}, "admin": {p.ctxAdmin, 2}} {
		page, err := lib.List(tc.ctx, LibraryQuery{All: true})
		if err != nil || len(page.Items) != tc.want {
			t.Errorf("%s: %+v %v", name, page.Items, err)
		}
	}
	if _, err := lib.List(p.ctxBen, LibraryQuery{ProfileID: "ana-1"}); !errors.Is(err, ErrNotFound) {
		t.Fatalf("naming someone else's brand: %v", err)
	}
	if page, err := lib.List(p.ctxBen, LibraryQuery{ProfileID: "nothing-here"}); err != nil || len(page.Items) != 0 {
		t.Fatalf("a brand that does not exist is simply empty: %v %v", page, err)
	}
	// posts
	pub := NewPublisher(db, nil, nil, 15*time.Minute)
	if _, err := db.Exec(`INSERT INTO publish_jobs (id, profile_id, draft_id, network, status, body, image, created_at, updated_at) VALUES
		('j1', 'ana-1', '', 'linkedin', 'published', 'a', x'89504e47', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
		('j2', 'ben-1', '', 'linkedin', 'published', 'b', x'89504e47', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`); err != nil {
		t.Fatal(err)
	}
	if jobs, _ := pub.ListAll(p.ctxBen); len(jobs) != 1 || jobs[0].ID != "j2" {
		t.Fatalf("%+v", jobs)
	}
	if jobs, _ := pub.ListAll(p.ctxAdmin); len(jobs) != 2 {
		t.Fatalf("%+v", jobs)
	}
}

func TestOnlyADraftCanBeDeletedAndApprovedOrPostedItemsComeBackToDraftFirst(t *testing.T) {
	l, ctx := newLib(t), context.Background()
	d, _ := l.st.CreateDraft(ctx, DraftInput{ProfileID: "p", Kind: "post", Doc: docOf(para("Words"))})
	l.st.Approve(ctx, d.ID)
	if err := l.st.DeleteDraft(ctx, d.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("an approved item is not deleted by one click: %v", err)
	}
	l.st.Unapprove(ctx, d.ID)
	if err := l.st.DeleteDraft(ctx, d.ID); err != nil {
		t.Fatal(err)
	}
	// a posted draft likewise
	posted := l.draft(t, "p", "post", docOf(para("Sent words")))
	l.post(t, "p", posted.ID, "Sent words")
	if err := l.st.DeleteDraft(ctx, posted.ID); !errors.Is(err, ErrConflict) {
		t.Fatalf("a posted draft must come back to draft first: %v", err)
	}
	if _, err := l.st.Unapprove(ctx, posted.ID); err != nil {
		t.Fatal(err)
	}
	if err := l.st.DeleteDraft(ctx, posted.ID); err != nil {
		t.Fatalf("after bringing it back: %v", err)
	}
}

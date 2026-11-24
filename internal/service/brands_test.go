package service

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

// brandsEnv sets up Settings and Studio over one database with the brands p1 (first), p2 and p3.
func brandsEnv(t *testing.T, env map[string]string) (*Settings, *Studio) {
	t.Helper()
	s, db := newSettings(t, keyA, env) // seeds p1
	st := New(db.DB)
	if err := st.CreateProfile(context.Background(), json.RawMessage(`{"id":"p2"}`)); err != nil {
		t.Fatal(err)
	}
	if err := st.CreateProfile(context.Background(), json.RawMessage(`{"id":"p3"}`)); err != nil {
		t.Fatal(err)
	}
	return s, st
}

func TestCredentialsAreIsolatedBetweenBrands(t *testing.T) {
	s, _ := brandsEnv(t, nil)
	ctx := context.Background()
	if _, err := s.Put(ctx, "p1", "linkedin", linkedinAll()); err != nil {
		t.Fatal(err)
	}
	// the second brand has nothing, and never sees the first brand's token
	v, err := s.Network(ctx, "p2", "linkedin")
	if err != nil || v.Complete {
		t.Fatalf("p2 must have no credentials: %v %+v", err, v)
	}
	got, err := s.Resolve(ctx, "p2", "linkedin")
	if err != nil || len(got) != 0 {
		t.Fatalf("p2 resolved %v (%v)", got, err)
	}
	// each brand keeps its own
	other := map[string]*string{"accessToken": ptr("second-token-0000-WXYZ"), "authorUrn": ptr("urn:li:organization:99")}
	if _, err := s.Put(ctx, "p2", "linkedin", other); err != nil {
		t.Fatal(err)
	}
	r1, _ := s.Resolve(ctx, "p1", "linkedin")
	r2, _ := s.Resolve(ctx, "p2", "linkedin")
	if r1["accessToken"] != tokenSecret || r2["accessToken"] != "second-token-0000-WXYZ" || r2["authorUrn"] != "urn:li:organization:99" {
		t.Fatalf("p1 %v p2 %v", r1, r2)
	}
	// removing p2's token leaves p1's alone
	if _, err := s.Put(ctx, "p2", "linkedin", map[string]*string{"accessToken": ptr("")}); err != nil {
		t.Fatal(err)
	}
	if r1, _ = s.Resolve(ctx, "p1", "linkedin"); r1["accessToken"] != tokenSecret {
		t.Fatalf("p1 lost its token: %v", r1)
	}
}

func TestSettingsNeedARealBrand(t *testing.T) {
	s, st := brandsEnv(t, nil)
	ctx := context.Background()
	if _, err := s.Put(ctx, "nope", "linkedin", linkedinAll()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an unknown brand must be refused: %v", err)
	}
	if _, err := s.View(ctx, ""); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a missing brand id must be refused: %v", err)
	}
	if _, err := st.ArchiveProfile(ctx, "p3"); err != nil {
		t.Fatal(err)
	}
	if _, err := s.Put(ctx, "p3", "linkedin", linkedinAll()); !errors.Is(err, ErrNotFound) {
		t.Fatalf("an archived brand cannot be edited: %v", err)
	}
}

func TestEnvironmentCredentialsBelongToTheFirstBrandOnly(t *testing.T) {
	env := map[string]string{"CARDPRESS_LINKEDIN_ACCESS_TOKEN": "env-token-AAAA-1111", "CARDPRESS_LINKEDIN_AUTHOR_URN": "urn:li:person:Env"}
	s, st := brandsEnv(t, env)
	ctx := context.Background()
	r1, _ := s.Resolve(ctx, "p1", "linkedin")
	r2, _ := s.Resolve(ctx, "p2", "linkedin")
	if r1["accessToken"] != "env-token-AAAA-1111" || r1["authorUrn"] != "urn:li:person:Env" {
		t.Fatalf("the first brand must use the environment: %v", r1)
	}
	if len(r2) != 0 {
		t.Fatalf("another brand must not post as the environment's account: %v", r2)
	}
	// the other brand can still set its own, and the first brand's environment fields stay locked
	if _, err := s.Put(ctx, "p2", "linkedin", map[string]*string{"accessToken": ptr("own-token-BBBB-2222")}); err != nil {
		t.Fatalf("p2 should be able to store its own: %v", err)
	}
	if _, err := s.Put(ctx, "p1", "linkedin", map[string]*string{"accessToken": ptr("x")}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("p1's environment field must be locked: %v", err)
	}
	// it stays with p1 when the order changes or p1 is archived
	if err := st.ReorderProfiles(ctx, []string{"p3", "p2", "p1"}); err != nil {
		t.Fatal(err)
	}
	if _, err := st.ArchiveProfile(ctx, "p1"); err != nil {
		t.Fatal(err)
	}
	if id, _ := s.EnvProfile(ctx); id != "p1" {
		t.Fatalf("the environment brand moved to %q", id)
	}
	if r3, _ := s.Resolve(ctx, "p3", "linkedin"); len(r3) != 0 {
		t.Fatalf("p3 must not inherit the environment: %v", r3)
	}
	// an archived brand's scheduled post can still resolve its own credentials
	if r1, _ = s.Resolve(ctx, "p1", "linkedin"); r1["accessToken"] != "env-token-AAAA-1111" {
		t.Fatalf("archived brand lost its credentials: %v", r1)
	}
}

func TestCredentialsSavedBeforeAnyProfileBelongToTheEnvironmentBrand(t *testing.T) {
	s, _ := brandsEnv(t, nil)
	ctx := context.Background()
	if _, err := s.Put(ctx, "p1", "linkedin", linkedinAll()); err != nil {
		t.Fatal(err)
	}
	// as left by the migration on an installation with credentials but no profile yet
	if _, err := s.db.ExecContext(ctx, `UPDATE credentials SET profile_id = ''`); err != nil {
		t.Fatal(err)
	}
	if r, _ := s.Resolve(ctx, "p1", "linkedin"); r["accessToken"] != tokenSecret {
		t.Fatalf("the first brand must adopt them: %v", r)
	}
	if r, _ := s.Resolve(ctx, "p2", "linkedin"); len(r) != 0 {
		t.Fatalf("no other brand may: %v", r)
	}
	// a value saved under the brand wins, and removing it removes both
	if _, err := s.Put(ctx, "p1", "linkedin", map[string]*string{"accessToken": ptr("newer-token-CCCC-3333")}); err != nil {
		t.Fatal(err)
	}
	if r, _ := s.Resolve(ctx, "p1", "linkedin"); r["accessToken"] != "newer-token-CCCC-3333" {
		t.Fatalf("%v", r)
	}
	if _, err := s.Put(ctx, "p1", "linkedin", map[string]*string{"accessToken": ptr("")}); err != nil {
		t.Fatal(err)
	}
	if r, _ := s.Resolve(ctx, "p1", "linkedin"); r["accessToken"] != "" {
		t.Fatalf("the old value came back: %v", r)
	}
}

func TestBrandLifecycle(t *testing.T) {
	_, st := brandsEnv(t, nil)
	ctx := context.Background()
	ids := func() []string {
		s, _ := st.State(ctx)
		var out []string
		for _, p := range s.Profiles {
			var h struct{ ID string }
			_ = json.Unmarshal(p, &h)
			out = append(out, h.ID)
		}
		return out
	}
	if got := strings.Join(ids(), ","); got != "p1,p2,p3" {
		t.Fatal(got)
	}
	if err := st.CreateProfile(ctx, json.RawMessage(`{"id":"p2"}`)); !errors.Is(err, ErrConflict) {
		t.Fatalf("a duplicate id must be refused: %v", err)
	}
	if err := st.CreateProfile(ctx, json.RawMessage(`{"name":"x"}`)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a profile needs an id: %v", err)
	}
	if err := st.SaveProfile(ctx, "p2", json.RawMessage(`{"id":"p2","name":"Two"}`)); err != nil {
		t.Fatal(err)
	}
	if err := st.SaveProfile(ctx, "p2", json.RawMessage(`{"id":"p9"}`)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("the id in the body must match: %v", err)
	}
	if err := st.SaveProfile(ctx, "nope", json.RawMessage(`{"id":"nope"}`)); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
	if err := st.ReorderProfiles(ctx, []string{"p3", "p1", "p2"}); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(ids(), ","); got != "p3,p1,p2" {
		t.Fatalf("order: %s", got)
	}
	for _, bad := range [][]string{{"p1", "p2"}, {"p1", "p1", "p2"}, {"p1", "p2", "zzz"}} {
		if err := st.ReorderProfiles(ctx, bad); !errors.Is(err, ErrInvalid) {
			t.Fatalf("%v must be refused: %v", bad, err)
		}
	}

	// archive hides it but keeps it; saving a list that includes it does not bring it back or change the order
	if _, err := st.ArchiveProfile(ctx, "p1"); err != nil {
		t.Fatal(err)
	}
	if err := st.ReplaceProfiles(ctx, []json.RawMessage{json.RawMessage(`{"id":"p1","name":"One again"}`), json.RawMessage(`{"id":"p2","name":"Two"}`)}); err != nil {
		t.Fatal(err)
	}
	s, _ := st.State(ctx)
	if got := strings.Join(ids(), ","); got != "p3,p2" || len(s.Archived) != 1 || !strings.Contains(string(s.Archived[0]), "One again") {
		t.Fatalf("active %s, archived %s", got, s.Archived)
	}
	if err := st.RestoreProfile(ctx, "p1"); err != nil {
		t.Fatal(err)
	}
	if got := strings.Join(ids(), ","); got != "p3,p2,p1" {
		t.Fatalf("a restored brand goes to the end: %s", got)
	}
	if err := st.RestoreProfile(ctx, "nope"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}

	// the last active brand cannot be archived
	for _, id := range []string{"p3", "p2"} {
		if _, err := st.ArchiveProfile(ctx, id); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.ArchiveProfile(ctx, "p1"); !errors.Is(err, ErrConflict) {
		t.Fatalf("keep at least one brand: %v", err)
	}
}

func TestDeleteNeedsArchiveAndNoUnfinishedPostsAndRemovesEverything(t *testing.T) {
	s, st := brandsEnv(t, nil)
	ctx := context.Background()
	db := s.db
	exec := func(q string, a ...any) {
		t.Helper()
		if _, err := db.ExecContext(ctx, q, a...); err != nil {
			t.Fatalf("%s: %v", q, err)
		}
	}
	// p2 owns a draft, a design, a conversation with a message and a proposal, a credential and two posts
	exec(`INSERT INTO designs (profile_id, data, updated_at) VALUES ('p2', '{}', 'now')`)
	exec(`INSERT INTO drafts (id, profile_id, kind, status, doc, hashtags, alt_text, unicode_styles, created_at, updated_at) VALUES ('d1', 'p2', 'post', 'draft', '{}', '[]', '', 0, 'now', 'now')`)
	exec(`INSERT INTO conversations (id, profile_id, title, source_kind, source_url, source_title, source_text, source_truncated, created_at, updated_at) VALUES ('c1', 'p2', 't', 'text', '', '', 'x', 0, 'now', 'now')`)
	exec(`INSERT INTO chat_messages (id, conversation_id, seq, role, content, created_at) VALUES ('m1', 'c1', 1, 'user', 'hi', 'now')`)
	exec(`INSERT INTO proposals (id, conversation_id, message_id, kind, title, body, hashtags, alt_text, rationale, status, edited, created_at) VALUES ('pr1', 'c1', 'm1', 'post', '', 'b', '[]', '', '', 'pending', 0, 'now')`)
	if _, err := s.Put(ctx, "p2", "linkedin", linkedinAll()); err != nil {
		t.Fatal(err)
	}
	job := func(id, status string) {
		exec(`INSERT INTO publish_jobs (id, profile_id, draft_id, network, status, body, hashtags, alt_text, image, scheduled_at, timezone, created_at, updated_at) VALUES (?, 'p2', 'd1', 'linkedin', ?, 'b', '[]', '', x'00', NULL, '', 'now', 'now')`, id, status)
	}
	job("j1", JobPublished)
	job("j2", JobScheduled)

	if err := st.DeleteProfile(ctx, "p2"); !errors.Is(err, ErrConflict) || !strings.Contains(err.Error(), "archive") {
		t.Fatalf("only an archived brand can be deleted: %v", err)
	}
	res, err := st.ArchiveProfile(ctx, "p2")
	if err != nil || res.Scheduled != 1 {
		t.Fatalf("archiving must report the scheduled post: %+v %v", res, err)
	}
	if err := st.DeleteProfile(ctx, "p2"); !errors.Is(err, ErrConflict) || !strings.Contains(err.Error(), "scheduled") {
		t.Fatalf("a scheduled post must block the delete: %v", err)
	}
	exec(`UPDATE publish_jobs SET status = ? WHERE id = 'j2'`, JobCancelled)
	if err := st.DeleteProfile(ctx, "p2"); err != nil {
		t.Fatal(err)
	}
	for _, table := range []string{"profiles", "designs", "drafts", "conversations", "chat_messages", "proposals", "credentials", "publish_jobs"} {
		col := "profile_id"
		switch table {
		case "profiles":
			col = "id"
		case "chat_messages", "proposals":
			col = "conversation_id"
		}
		var n int
		where := col + " = 'p2'"
		if col == "conversation_id" {
			where = col + " = 'c1'"
		}
		_ = db.QueryRowContext(ctx, `SELECT COUNT(*) FROM `+table+` WHERE `+where).Scan(&n)
		if n != 0 {
			t.Errorf("%s still has %d row(s) of the deleted brand", table, n)
		}
	}
	// other brands are untouched
	if r, _ := s.Resolve(ctx, "p1", "linkedin"); len(r) != 0 {
		t.Fatalf("%v", r)
	}
	if err := st.DeleteProfile(ctx, "p2"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("%v", err)
	}
}

func TestEachPostUsesItsOwnBrandsCredentials(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	creds := perBrandCreds{
		"p":  {"accessToken": "TOK-P", "authorUrn": "urn:li:person:P"},
		"q":  {"accessToken": "TOK-Q", "authorUrn": "urn:li:organization:Q"},
		"nc": {},
	}
	h.p.creds = creds
	for _, tc := range []struct{ brand, token, author string }{{"p", "TOK-P", "urn:li:person:P"}, {"q", "TOK-Q", "urn:li:organization:Q"}} {
		in := h.job()
		in.ProfileID, in.DraftID = tc.brand, h.approvedDraft(tc.brand)
		j, err := h.p.Create(ctx, in)
		if err != nil {
			t.Fatal(err)
		}
		h.p.Execute(ctx, j.ID)
		if h.li.token != tc.token || h.li.calls[len(h.li.calls)-1].AuthorURN != tc.author {
			t.Fatalf("brand %s posted with token %q as %q", tc.brand, h.li.token, h.li.calls[len(h.li.calls)-1].AuthorURN)
		}
	}
	// a brand with no connection cannot create, publish now or reschedule a post, and the message says whose
	in := h.job()
	in.ProfileID, in.DraftID = "nc", h.approvedDraft("nc")
	if _, err := h.p.Create(ctx, in); !errors.Is(err, ErrInvalid) || !strings.Contains(err.Error(), "this brand") {
		t.Fatalf("%v", err)
	}
	// a scheduled post of a brand that later loses its connection is not published with anyone else's
	at := h.clk.Add(time.Hour)
	in = h.job()
	in.ProfileID, in.DraftID, in.ScheduledAt, in.Timezone = "q", h.approvedDraft("q"), &at, "Europe/London"
	j, err := h.p.Create(ctx, in)
	if err != nil {
		t.Fatal(err)
	}
	creds["q"] = map[string]string{}
	h.advance(time.Hour)
	before := h.li.count()
	if err := h.p.RunDue(ctx); err != nil {
		t.Fatal(err)
	}
	h.p.Wait()
	if got := status(t, h, j.ID); got.Status != JobFailed || h.li.count() != before {
		t.Fatalf("%+v posts %d->%d", got, before, h.li.count())
	}
}

type perBrandCreds map[string]map[string]string

func (c perBrandCreds) Resolve(_ context.Context, profileID, _ string) (map[string]string, error) {
	return c[profileID], nil
}

func TestEnvironmentBrandIsPinnedWhenTheFirstBrandIsCreated(t *testing.T) {
	_, st := newStudioFor(t)
	ctx := context.Background()
	for _, id := range []string{"a", "b"} {
		if err := st.CreateProfile(ctx, json.RawMessage(`{"id":"`+id+`"}`)); err != nil {
			t.Fatal(err)
		}
	}
	if err := st.ReorderProfiles(ctx, []string{"b", "a"}); err != nil {
		t.Fatal(err)
	}
	s := NewSettings(st.db, nil, func(string) string { return "" })
	if id, err := s.EnvProfile(ctx); err != nil || id != "a" {
		t.Fatalf("the environment brand must stay with the first brand created: %q %v", id, err)
	}
}

func newStudioFor(t *testing.T) (*Settings, *Studio) {
	t.Helper()
	_, db := newSettings(t, keyA, nil)
	if _, err := db.Exec(`DELETE FROM profiles`); err != nil {
		t.Fatal(err)
	}
	return nil, New(db.DB)
}

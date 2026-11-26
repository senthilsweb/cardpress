package mcpserver

import (
	"context"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/service"
)

func TestAnAgentWritesTheWordsAndNeverTheLook(t *testing.T) {
	r := newRig(t, stubFetcher{})
	ctx := context.Background()
	if _, err := r.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{"id":"p","name":"P"}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	hub := service.NewHub()
	r.studio.Events = hub
	events, cancel, _ := hub.Subscribe("p")
	defer cancel()
	cs := connect(t, r.deps)

	res, made := call(t, cs, "create_draft", map[string]any{"profileId": "p", "kind": "post"})
	if res.IsError {
		t.Fatal(errText(res))
	}
	id := made["id"].(string)
	if e := <-events; e.DraftID != id || e.Revision != 1 {
		t.Fatalf("%+v", e)
	}

	res, out := call(t, cs, "update_card_text", map[string]any{"draftId": id, "changes": map[string]any{"headline": "Ship less", "tag": "Field notes"}})
	if res.IsError {
		t.Fatal(errText(res))
	}
	card := out["design"].(map[string]any)
	if card["headline"] != "Ship less" || card["title"] != nil || card["tag"] != "Field notes" || card["layout"] != "hero" || out["revision"].(float64) != 2 || card["photos"] != false {
		t.Fatalf("%v", out)
	}
	if e := <-events; e.Revision != 2 {
		t.Fatalf("%+v", e)
	}

	// anything about the look refuses the whole call, text included
	for _, field := range []string{"layout", "background", "paletteId", "sizeId", "seed", "titleScale", "intensity", "bottomFade", "showLogo", "showFooter", "fonts", "photos", "screenshot", "bgImage"} {
		res, _ := call(t, cs, "update_card_text", map[string]any{"draftId": id, "changes": map[string]any{"title": "Changed", field: "x"}})
		if !res.IsError || !strings.Contains(errText(res), field) || !strings.Contains(errText(res), "under Design") {
			t.Errorf("%s: %q", field, errText(res))
		}
	}
	d, _ := r.studio.GetDraft(ctx, id)
	if !strings.Contains(string(d.Design), `"title":"Ship less"`) || d.Revision != 2 {
		t.Fatalf("a refused call changed the card: %s", d.Design)
	}
	if res, _ := call(t, cs, "update_card_text", map[string]any{"draftId": id, "changes": map[string]any{"statValue": strings.Repeat("9", 61)}}); !res.IsError || !strings.Contains(errText(res), "60") {
		t.Errorf("too long: %q", errText(res))
	}

	// text: the revision read must still be current
	body := "First line.\n\n- one\n- two"
	if res, _ := call(t, cs, "update_draft", map[string]any{"draftId": id, "body": body}); !res.IsError {
		t.Error("body without a revision")
	}
	if res, _ := call(t, cs, "update_draft", map[string]any{"draftId": id, "body": body, "revision": 1}); !res.IsError || !strings.Contains(errText(res), "changed since") {
		t.Errorf("old revision: %q", errText(res))
	}
	res, out = call(t, cs, "update_draft", map[string]any{"draftId": id, "body": body, "revision": 2, "hashtags": []string{"Go"}})
	if res.IsError || out["body"] != "First line.\n\none\ntwo" && !strings.Contains(out["body"].(string), "one") || out["revision"].(float64) != 3 {
		t.Fatalf("%q %v", errText(res), out)
	}
	res, out = call(t, cs, "update_draft", map[string]any{"draftId": id, "hashtags": []string{"Data"}}) // only what is named
	if res.IsError || !strings.Contains(out["body"].(string), "First line.") || out["hashtags"].([]any)[0] != "Data" {
		t.Fatalf("%q %v", errText(res), out)
	}

	// an approved item goes back to draft, and the result says so; a waiting one is refused
	if _, err := r.studio.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}
	if res, out = call(t, cs, "update_card_text", map[string]any{"draftId": id, "changes": map[string]any{"title": "Again"}}); res.IsError || out["returnedToDraft"] != true {
		t.Fatalf("%q %v", errText(res), out)
	}
	if _, err := r.db.Exec(`UPDATE drafts SET status = 'scheduled' WHERE id = ?`, id); err != nil {
		t.Fatal(err)
	}
	if res, _ := call(t, cs, "update_draft", map[string]any{"draftId": id, "title": "x"}); !res.IsError || !strings.Contains(errText(res), "waiting to be sent") {
		t.Errorf("waiting: %q", errText(res))
	}
}

func TestAnArticlesPicturesAreNeverRewrittenAway(t *testing.T) {
	r := newRig(t, stubFetcher{})
	ctx := context.Background()
	d, err := r.studio.CreateDraft(ctx, service.DraftInput{ProfileID: "p", Kind: "article",
		Doc: []byte(`{"type":"doc","content":[{"type":"image","attrs":{"src":"data:image/png;base64,AA=="}}]}`)})
	if err != nil {
		t.Fatal(err)
	}
	cs := connect(t, r.deps)
	if res, _ := call(t, cs, "update_draft", map[string]any{"draftId": d.ID, "body": "new", "revision": 1}); !res.IsError || !strings.Contains(errText(res), "pictures") {
		t.Fatalf("%q", errText(res))
	}
	if res, out := call(t, cs, "update_draft", map[string]any{"draftId": d.ID, "summary": "One line.", "slug": "a-page"}); res.IsError || out["summary"] != "One line." || out["slug"] != "a-page" {
		t.Fatalf("%q %v", errText(res), out)
	}
}

func TestNotesAreKeptPerBrand(t *testing.T) {
	r := newRig(t, stubFetcher{})
	for _, id := range []string{"p", "q"} {
		if _, err := r.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES (?, '', '{}', 0, '')`, id); err != nil {
			t.Fatal(err)
		}
	}
	cs := connect(t, r.deps)
	for _, text := range []string{"No hashtags.", "Never use hashtags."} {
		if res, _ := call(t, cs, "save_memory", map[string]any{"profileId": "p", "key": "hashtags", "content": text}); res.IsError {
			t.Fatal(errText(res))
		}
	}
	_, out := call(t, cs, "list_memories", map[string]any{"profileId": "p"})
	if n := out["notes"].([]any); len(n) != 1 || n[0].(map[string]any)["content"] != "Never use hashtags." {
		t.Fatalf("%v", out)
	}
	if _, out := call(t, cs, "list_memories", map[string]any{"profileId": "q"}); len(out["notes"].([]any)) != 0 {
		t.Fatal("another brand's notes")
	}
	if res, _ := call(t, cs, "save_memory", map[string]any{"profileId": "p", "key": "Bad Key", "content": "x"}); !res.IsError {
		t.Error("a bad key was accepted")
	}
	if res, _ := call(t, cs, "delete_memory", map[string]any{"profileId": "p", "key": "hashtags"}); res.IsError {
		t.Fatal(errText(res))
	}
	res, out := call(t, cs, "list_connections", map[string]any{"profileId": "p"})
	if res.IsError || len(out["connections"].([]any)) == 0 {
		t.Fatalf("%q %v", errText(res), out)
	}
	for _, c := range out["connections"].([]any) {
		if m := c.(map[string]any); m["canPost"] != false || len(m) != 4 {
			t.Errorf("%v", m)
		}
	}
}

// A key reaches only its own person's work with every new tool.
func TestTheWritingToolsKeepToOnesOwnBrands(t *testing.T) {
	r := newRig(t, stubFetcher{})
	ctx := context.Background()
	if _, err := r.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('theirs', 'someone-else', '{}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	d, err := r.studio.CreateDraft(ctx, service.DraftInput{ProfileID: "theirs", Kind: "post", Doc: []byte(`{"type":"doc"}`)})
	if err != nil {
		t.Fatal(err)
	}
	r.deps.Access = r.studio
	tl := tools{r.deps}
	mine := service.WithPrincipal(ctx, service.Principal{User: &service.User{ID: "me", Roles: []string{service.RoleEditor}}, Key: "k", Scope: "editor"})
	checks := map[string]error{}
	_, _, checks["get_design"] = tl.getDesign(mine, nil, draftRefIn{d.ID})
	_, _, checks["update_card_text"] = tl.updateCardText(mine, nil, cardTextIn{d.ID, map[string]any{"title": "x"}})
	title := "x"
	_, _, checks["update_draft"] = tl.updateDraft(mine, nil, updateIn{DraftID: d.ID, Title: &title})
	_, _, checks["create_draft"] = tl.createDraft(mine, nil, createIn{ProfileID: "theirs", Kind: "post"})
	_, _, checks["offer_choices"] = tl.offerChoices(mine, nil, offerIn{ConversationID: "none", DraftID: d.ID})
	_, _, checks["set_attachment"] = tl.setAttachment(mine, nil, attachIn{DraftID: d.ID, Type: "card"})
	_, _, checks["list_connections"] = tl.listConnections(mine, nil, profileIn{"theirs"})
	_, _, checks["list_memories"] = tl.listMemories(mine, nil, profileIn{"theirs"})
	_, _, checks["save_memory"] = tl.saveMemory(mine, nil, saveIn{"theirs", "k", "v"})
	_, _, checks["delete_memory"] = tl.deleteMemory(mine, nil, forgetIn{"theirs", "k"})
	for tool, err := range checks {
		if err == nil || !(strings.Contains(err.Error(), "Not found") || strings.Contains(strings.ToLower(err.Error()), "not allowed")) {
			t.Errorf("%s: %v", tool, err)
		}
	}
	after, _ := r.studio.GetDraft(ctx, d.ID)
	if after.Revision != 1 {
		t.Fatal("someone else's draft changed")
	}
}

// Agents deployed before contract 6 call the headline "title".
func TestAnOlderAgentMayCallTheHeadlineTitle(t *testing.T) {
	got, err := cardText(map[string]any{"title": "Ship less"})
	if err != nil || got.Headline == nil || *got.Headline != "Ship less" {
		t.Fatalf("%v %+v", err, got)
	}
	if _, err := cardText(map[string]any{"title": "a", "headline": "b"}); err == nil {
		t.Fatal("both names were accepted")
	}
}

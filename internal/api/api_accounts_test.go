package api

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"github.com/senthilsweb/cardpress/internal/agent/agenttest"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/senthilsweb/cardpress/internal/secrets"
	"github.com/senthilsweb/cardpress/internal/service"
	"github.com/senthilsweb/cardpress/internal/source"
	"github.com/senthilsweb/cardpress/internal/store"
)

type rig struct {
	h   http.Handler
	db  *sql.DB
	srv *server
}

type rigOpts struct {
	token        string
	signupClosed bool
	adminOnly    bool
}

func newRig(t *testing.T, o rigOpts) *rig {
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
	box, _ := secrets.NewBox(testKey, "env")
	studio := service.New(db.DB)
	pub := service.NewPublisher(db.DB, okCreds{"accessToken": "TOK", "authorUrn": "urn:li:person:Me"}, &apiPoster{}, 0)
	t.Cleanup(pub.Wait)
	opts := Options{
		Studio: studio, Settings: service.NewSettings(db.DB, box, func(string) string { return "" }), Publishing: pub, Library: service.NewLibrary(db.DB), Media: service.NewMedia(db.DB, 0),
		Chat:     service.NewChat(db.DB, &agenttest.Mock{}, stubFetcher{src: source.Source{Title: "T", Text: article}}),
		Accounts: service.NewAccounts(db.DB, service.AccountsOptions{SignupClosed: o.signupClosed}),
		Token:    o.token, AssistantAdminOnly: o.adminOnly, Version: "t", DBDriver: db.Driver,
	}
	return &rig{h: New(opts), db: db.DB, srv: &server{Options: opts}}
}

// client is one browser: it keeps its cookies.
type client struct {
	t       *testing.T
	h       http.Handler
	cookies map[string]*http.Cookie
	extra   map[string]string
}

func (r *rig) browser(t *testing.T) *client {
	return &client{t: t, h: r.h, cookies: map[string]*http.Cookie{}, extra: map[string]string{}}
}

func (c *client) do(method, path, body string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(method, path, strings.NewReader(body))
	return c.send(req)
}

func (c *client) send(req *http.Request) *httptest.ResponseRecorder {
	for _, ck := range c.cookies {
		req.AddCookie(ck)
	}
	for k, v := range c.extra {
		req.Header.Set(k, v)
	}
	rec := httptest.NewRecorder()
	c.h.ServeHTTP(rec, req)
	for _, ck := range rec.Result().Cookies() {
		if ck.MaxAge < 0 || ck.Value == "" {
			delete(c.cookies, ck.Name)
		} else {
			c.cookies[ck.Name] = ck
		}
	}
	return rec
}

func (c *client) json(method, path, body string, out any) int {
	rec := c.do(method, path, body)
	if out != nil && rec.Body.Len() > 0 {
		_ = json.Unmarshal(rec.Body.Bytes(), out)
	}
	return rec.Code
}

func (c *client) mustSignup(email, first string) service.User {
	c.t.Helper()
	var s struct{ User service.User }
	if code := c.json("POST", "/api/v1/auth/signup", `{"firstName":"`+first+`","lastName":"Tester","email":"`+email+`","password":"correct horse battery"}`, &s); code != 201 {
		c.t.Fatalf("signup %s: %d", email, code)
	}
	return s.User
}

func (c *client) login(email, password string) int {
	return c.json("POST", "/api/v1/auth/login", `{"email":"`+email+`","password":"`+password+`"}`, nil)
}

func TestTheAppNeedsAnAdminAccountBeforeAnythingElse(t *testing.T) {
	r := newRig(t, rigOpts{})
	c := r.browser(t)
	var info map[string]any
	c.json("GET", "/api/v1/info", "", &info)
	if info["needsSetup"] != true || info["signedIn"] != false || info["signupOpen"] != true || info["accounts"] != true {
		t.Fatalf("%v", info)
	}
	for _, p := range []string{"/api/v1/state", "/api/v1/library?profileId=x", "/api/v1/drafts?profileId=x", "/api/v1/users"} {
		rec := c.do("GET", p, "")
		if rec.Code != 403 || !strings.Contains(rec.Body.String(), "setup_required") {
			t.Errorf("%s: %d %s", p, rec.Code, rec.Body)
		}
	}
	var s struct {
		User  service.User
		Perms []service.Perm
	}
	if code := c.json("POST", "/api/v1/auth/signup", `{"firstName":"Ada","lastName":"Lovelace","email":"ada@example.com","password":"correct horse battery","phone":"+44 20 7946 0000","birthDate":"1990-12-10"}`, &s); code != 201 {
		t.Fatalf("%d", code)
	}
	if !s.User.IsAdmin() || s.User.FullName != "Ada Lovelace" || len(s.Perms) != 5 {
		t.Fatalf("%+v", s)
	}
	ck := c.cookies[cookieName]
	if ck == nil || !ck.HttpOnly || ck.SameSite != http.SameSiteLaxMode || ck.Path != "/" || ck.MaxAge <= 0 || ck.Secure {
		t.Fatalf("session cookie: %+v", ck)
	}
	if c.do("GET", "/api/v1/state", "").Code != 200 {
		t.Fatal("the new admin is signed in")
	}
	c.json("GET", "/api/v1/info", "", &info)
	if info["needsSetup"] != false || info["signedIn"] != true {
		t.Fatalf("%v", info)
	}
	// a stranger is not signed in
	if code := r.browser(t).do("GET", "/api/v1/state", "").Code; code != 401 {
		t.Fatalf("%d", code)
	}
	// over https the cookie is marked Secure
	h := r.browser(t)
	h.extra["X-Forwarded-Proto"] = "https"
	h.login("ada@example.com", "correct horse battery")
	if ck := h.cookies[cookieName]; ck == nil || !ck.Secure {
		t.Fatalf("%+v", ck)
	}
}

func TestSigningUpAndInAndOut(t *testing.T) {
	r := newRig(t, rigOpts{})
	admin := r.browser(t)
	admin.mustSignup("admin@example.com", "Admin")
	c := r.browser(t)
	for name, body := range map[string]string{
		"no names": `{"email":"x@example.com","password":"correct horse battery"}`,
		"short pw": `{"firstName":"A","lastName":"B","email":"x@example.com","password":"short"}`,
		"bad dob":  `{"firstName":"A","lastName":"B","email":"x@example.com","password":"correct horse battery","birthDate":"1990-13-40"}`,
		"bad json": `nope`,
	} {
		if code := c.json("POST", "/api/v1/auth/signup", body, nil); code != 400 {
			t.Errorf("%s: %d", name, code)
		}
	}
	u := c.mustSignup("Ben@Example.com", "Ben")
	if u.Roles[0] != service.RoleEditor {
		t.Fatalf("a signup is an editor by default: %+v", u)
	}
	if code := r.browser(t).json("POST", "/api/v1/auth/signup", `{"firstName":"A","lastName":"B","email":"ben@example.com","password":"correct horse battery"}`, nil); code != 409 {
		t.Fatalf("an email is used once: %d", code)
	}
	var me struct{ User service.User }
	if c.json("GET", "/api/v1/auth/me", "", &me); me.User.Email != "ben@example.com" {
		t.Fatalf("%+v", me)
	}
	if c.do("POST", "/api/v1/auth/logout", "").Code != 204 || c.do("GET", "/api/v1/auth/me", "").Code != 401 {
		t.Fatal("signing out ends the session")
	}
	d := r.browser(t)
	if code := d.login("ben@example.com", "not the password"); code != 401 {
		t.Fatalf("%d", code)
	}
	if code := d.login("nobody@example.com", "correct horse battery"); code != 401 {
		t.Fatalf("an unknown email looks the same: %d", code)
	}
	if d.login("BEN@example.com", "correct horse battery") != 200 || d.do("GET", "/api/v1/state", "").Code != 200 {
		t.Fatal("sign-in works")
	}
	for i := 0; i < 6; i++ {
		r.browser(t).login("ben@example.com", "wrong wrong wrong")
	}
	if code := r.browser(t).login("ben@example.com", "correct horse battery"); code != 429 {
		t.Fatalf("too many tries are paused: %d", code)
	}
}

func TestSignupCanBeClosedAndTheTokenStillWorksForMachines(t *testing.T) {
	r := newRig(t, rigOpts{signupClosed: true, token: "0123456789abcdefTOKEN"})
	// the token works even before any account exists, as an admin
	m := r.browser(t)
	m.extra["Authorization"] = "Bearer 0123456789abcdefTOKEN"
	if m.do("GET", "/api/v1/state", "").Code != 200 {
		t.Fatal("a machine with the token is let in")
	}
	var me struct{ User service.User }
	m.json("GET", "/api/v1/auth/me", "", &me)
	if !me.User.IsAdmin() || me.User.FullName != "API token" {
		t.Fatalf("%+v", me)
	}
	bad := r.browser(t)
	bad.extra["Authorization"] = "Bearer wrong-token-wrong-token"
	if bad.do("GET", "/api/v1/state", "").Code == 200 {
		t.Fatal("a wrong token is not let in")
	}
	first := r.browser(t)
	first.mustSignup("first@example.com", "First")
	var info map[string]any
	first.json("GET", "/api/v1/info", "", &info)
	if info["signupOpen"] != false {
		t.Fatalf("%v", info)
	}
	if code := r.browser(t).json("POST", "/api/v1/auth/signup", `{"firstName":"A","lastName":"B","email":"later@example.com","password":"correct horse battery"}`, nil); code != 403 {
		t.Fatalf("closed sign-up: %d", code)
	}
}

func TestACookieRequestFromAnotherSiteIsRefused(t *testing.T) {
	r := newRig(t, rigOpts{})
	c := r.browser(t)
	c.mustSignup("admin@example.com", "Admin")
	c.extra["Sec-Fetch-Site"] = "cross-site"
	rec := c.do("POST", "/api/v1/profiles", `{"id":"x"}`)
	if rec.Code != 403 || !strings.Contains(rec.Body.String(), "cross_origin") {
		t.Fatalf("%d %s", rec.Code, rec.Body)
	}
}

func TestChangingYourOwnPasswordAndDetails(t *testing.T) {
	r := newRig(t, rigOpts{})
	admin := r.browser(t)
	admin.mustSignup("admin@example.com", "Admin")
	c, other := r.browser(t), r.browser(t)
	c.mustSignup("ada@example.com", "Ada")
	other.login("ada@example.com", "correct horse battery")
	if code := c.json("PUT", "/api/v1/auth/password", `{"current":"wrong","new":"another long passphrase"}`, nil); code != 400 {
		t.Fatalf("%d", code)
	}
	if code := c.json("PUT", "/api/v1/auth/password", `{"current":"correct horse battery","new":"short"}`, nil); code != 400 {
		t.Fatalf("%d", code)
	}
	if code := c.json("PUT", "/api/v1/auth/password", `{"current":"correct horse battery","new":"another long passphrase"}`, nil); code != 204 {
		t.Fatalf("%d", code)
	}
	if other.do("GET", "/api/v1/auth/me", "").Code != 401 || c.do("GET", "/api/v1/auth/me", "").Code != 200 {
		t.Fatal("other devices are signed out and this one stays")
	}
	var me struct{ User service.User }
	if code := c.json("PUT", "/api/v1/auth/me", `{"firstName":"Augusta","lastName":"King","phone":"","birthDate":"1915-12-10"}`, &me); code != 200 || me.User.FullName != "Augusta King" || me.User.BirthDate != "1915-12-10" {
		t.Fatalf("%d %+v", code, me)
	}
	if code := c.json("PUT", "/api/v1/auth/me", `{"firstName":"","lastName":"King"}`, nil); code != 400 {
		t.Fatalf("%d", code)
	}
}

func TestOnlyAnAdminManagesPeopleAndTheLastAdminStays(t *testing.T) {
	r := newRig(t, rigOpts{})
	admin, ed := r.browser(t), r.browser(t)
	a := admin.mustSignup("admin@example.com", "Admin")
	e := ed.mustSignup("ed@example.com", "Ed")
	if ed.do("GET", "/api/v1/users", "").Code != 403 {
		t.Fatal("an editor cannot list people")
	}
	var list struct{ Users []service.User }
	if admin.json("GET", "/api/v1/users", "", &list); len(list.Users) != 2 {
		t.Fatalf("%+v", list)
	}
	var added service.User
	if code := admin.json("POST", "/api/v1/users", `{"firstName":"Wren","lastName":"Writer","email":"wren@example.com","password":"correct horse battery","role":"writer"}`, &added); code != 201 || added.Roles[0] != service.RoleWriter {
		t.Fatalf("%d %+v", code, added)
	}
	if code := admin.json("PUT", "/api/v1/users/"+e.ID, `{"role":"writer"}`, nil); code != 200 {
		t.Fatalf("%d", code)
	}
	if code := admin.json("PUT", "/api/v1/users/"+e.ID, `{"role":"emperor"}`, nil); code != 400 {
		t.Fatalf("%d", code)
	}
	if code := admin.json("PUT", "/api/v1/users/"+a.ID, `{"role":"editor"}`, nil); code != 409 {
		t.Fatalf("the last admin cannot be demoted: %d", code)
	}
	if code := admin.json("PUT", "/api/v1/users/"+e.ID+"/password", `{"password":"a brand new passphrase"}`, nil); code != 204 {
		t.Fatalf("%d", code)
	}
	if ed.do("GET", "/api/v1/auth/me", "").Code != 401 {
		t.Fatal("setting a password signs the person out")
	}
	if code := admin.json("PUT", "/api/v1/users/"+e.ID, `{"status":"disabled"}`, nil); code != 200 || r.browser(t).login("ed@example.com", "a brand new passphrase") != 401 {
		t.Fatal("a disabled person cannot sign in")
	}
}

func multipartJob(profileID, draftID string) (string, *bytes.Buffer) {
	var buf bytes.Buffer
	mw := multipart.NewWriter(&buf)
	_ = mw.WriteField("meta", `{"profileId":"`+profileID+`","draftId":"`+draftID+`","body":"Hello"}`)
	fw, _ := mw.CreateFormFile("image", "card.png")
	_, _ = fw.Write(apiPNG)
	_ = mw.Close()
	return mw.FormDataContentType(), &buf
}

func (c *client) postJob(profileID, draftID string) *httptest.ResponseRecorder {
	ct, buf := multipartJob(profileID, draftID)
	req := httptest.NewRequest("POST", "/api/v1/publish/jobs", buf)
	req.Header.Set("Content-Type", ct)
	return c.send(req)
}

const itemDoc = `{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Hello world"}]}]}`

func TestWhatEachRoleMayDo(t *testing.T) {
	r := newRig(t, rigOpts{})
	admin, ed, wr := r.browser(t), r.browser(t), r.browser(t)
	admin.mustSignup("admin@example.com", "Admin")
	ed.mustSignup("ed@example.com", "Ed")
	w := wr.mustSignup("wren@example.com", "Wren")
	admin.json("PUT", "/api/v1/users/"+w.ID, `{"role":"writer"}`, nil)
	wr.login("wren@example.com", "correct horse battery")

	// every role may make brands (workspaces) and write in them
	for name, c := range map[string]*client{"ed": ed, "wren": wr} {
		if code := c.json("POST", "/api/v1/profiles", `{"id":"`+name+`-brand","name":"`+name+`"}`, nil); code != 201 {
			t.Fatalf("%s: a brand: %d", name, code)
		}
	}
	var draft service.Draft
	if code := wr.json("POST", "/api/v1/drafts", `{"profileId":"wren-brand","kind":"post","doc":`+itemDoc+`}`, &draft); code != 201 || draft.CreatedByName != "Wren Tester" {
		t.Fatalf("a writer writes: %d %+v", code, draft)
	}
	// a writer cannot approve, publish, schedule, publish a page, or open social accounts
	for name, code := range map[string]int{
		"approve":  wr.do("POST", "/api/v1/drafts/"+draft.ID+"/approve", "").Code,
		"plan":     wr.do("PUT", "/api/v1/drafts/"+draft.ID+"/plan", `{}`).Code,
		"page":     wr.do("POST", "/api/v1/drafts/"+draft.ID+"/page", "").Code,
		"job":      wr.postJob("wren-brand", draft.ID).Code,
		"social":   wr.do("GET", "/api/v1/profiles/wren-brand/settings", "").Code,
		"settings": wr.do("PUT", "/api/v1/profiles/wren-brand/settings/linkedin", `{"fields":{}}`).Code,
	} {
		if code != 403 {
			t.Errorf("a writer must not %s: %d", name, code)
		}
	}
	// but a writer reads and edits drafts, saves versions, and deletes their own draft
	if wr.do("GET", "/api/v1/drafts/"+draft.ID, "").Code != 200 || wr.do("GET", "/api/v1/drafts/"+draft.ID+"/versions", "").Code != 200 ||
		wr.json("POST", "/api/v1/drafts/"+draft.ID+"/versions", `{"note":"mine"}`, nil) != 201 {
		t.Fatal("a writer works on a draft")
	}
	if wr.do("GET", "/api/v1/library?profileId=wren-brand", "").Code != 200 {
		t.Fatal("a writer sees the library of their own brand")
	}
	// an editor, in their own brand, writes, approves and publishes
	var edDraft service.Draft
	ed.json("POST", "/api/v1/drafts", `{"profileId":"ed-brand","kind":"post","doc":`+itemDoc+`}`, &edDraft)
	if ed.do("POST", "/api/v1/drafts/"+edDraft.ID+"/approve", "").Code != 200 {
		t.Fatal("an editor approves their own")
	}
	if code := ed.postJob("ed-brand", edDraft.ID).Code; code == 403 || code == 404 {
		t.Fatalf("an editor publishes: %d", code)
	}
	// an editor cannot see the writer's work
	if ed.do("GET", "/api/v1/drafts/"+draft.ID, "").Code != 404 || ed.do("POST", "/api/v1/drafts/"+draft.ID+"/approve", "").Code != 404 {
		t.Fatal("an editor sees only their own")
	}
	// the admin sees the writer's draft, approves it, and it then has to come back to draft before it can be deleted
	var got service.Draft
	if admin.json("GET", "/api/v1/drafts/"+draft.ID, "", &got) != 200 || admin.do("POST", "/api/v1/drafts/"+draft.ID+"/approve", "").Code != 200 {
		t.Fatal("an admin reviews and approves a writer's draft")
	}
	if code := wr.do("DELETE", "/api/v1/drafts/"+draft.ID, "").Code; code != 409 {
		t.Fatalf("an approved draft is brought back to draft before it is deleted: %d", code)
	}
	if wr.do("POST", "/api/v1/drafts/"+draft.ID+"/unapprove", "").Code != 200 || wr.do("DELETE", "/api/v1/drafts/"+draft.ID, "").Code != 204 {
		t.Fatal("a writer brings it back to draft, then deletes it")
	}
}

// TestNobodyReachesAnotherPersonsWork walks every route of the API as a second person, against the ids of the first, and
// expects the same answer a missing thing would get. The routes come from the policy table, so a route added without a rule
// is exercised here too.
func TestNobodyReachesAnotherPersonsWork(t *testing.T) {
	r := newRig(t, rigOpts{})
	admin, a, b := r.browser(t), r.browser(t), r.browser(t)
	admin.mustSignup("admin@example.com", "Admin")
	ua := a.mustSignup("a@example.com", "A")
	b.mustSignup("b@example.com", "B")

	// A's things: a brand with a draft, a post, a conversation with a proposal
	a.json("POST", "/api/v1/profiles", `{"id":"a-brand","name":"A"}`, nil)
	var draft service.Draft
	a.json("POST", "/api/v1/drafts", `{"profileId":"a-brand","kind":"post","doc":`+itemDoc+`}`, &draft)
	a.do("POST", "/api/v1/drafts/"+draft.ID+"/approve", "")
	var job service.Job
	if rec := a.postJob("a-brand", draft.ID); rec.Code != 201 {
		t.Fatalf("a post: %d %s", rec.Code, rec.Body)
	} else {
		_ = json.Unmarshal(rec.Body.Bytes(), &job)
	}
	var conv service.Conversation
	a.json("POST", "/api/v1/chat/conversations", `{"profileId":"a-brand","text":"`+article+`"}`, &conv)
	a.do("POST", "/api/v1/chat/conversations/"+conv.ID+"/messages", `{"content":""}`)
	var full service.Conversation
	a.json("GET", "/api/v1/chat/conversations/"+conv.ID, "", &full)
	if len(full.Proposals) == 0 {
		t.Fatal("the mock agent should have proposed something")
	}
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		a.json("GET", "/api/v1/publish/jobs/"+job.ID, "", &job)
		if job.Status != service.JobPublishing {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}

	subst := func(path string, sc scope) string {
		id := map[scope]string{scopeBrandPath: "a-brand", scopeDraft: draft.ID, scopeJob: job.ID, scopeConversation: conv.ID, scopeProposal: full.Proposals[0].ID}[sc]
		if sc == scopeAdmin {
			id = ua.ID
		}
		p := strings.ReplaceAll(path, "{id}", id)
		p = strings.ReplaceAll(p, "{network}", "linkedin")
		p = strings.ReplaceAll(p, "{seq}", "1")
		p = strings.ReplaceAll(p, "{key}", "theme")
		if sc == scopeBrandQuery {
			p += "?profileId=a-brand"
		}
		return "/api/v1" + p
	}
	checked := 0
	for _, d := range r.srv.table() {
		if d.handler == nil {
			t.Errorf("%s %s has no handler", d.method, d.path)
		}
		var rec *httptest.ResponseRecorder
		want := 404
		switch d.rule.scope {
		case scopeOpen, scopeAny:
			continue // nothing of anyone else's is named
		case scopeAdmin:
			want = 403
			rec = b.do(d.method, subst(d.path, d.rule.scope), `{}`)
		case scopeBrandBody:
			switch d.path {
			case "/drafts":
				rec = b.do("POST", "/api/v1/drafts", `{"profileId":"a-brand","kind":"post","doc":`+itemDoc+`}`)
			case "/publish/jobs":
				rec = b.postJob("a-brand", draft.ID)
			case "/chat/conversations":
				rec = b.do("POST", "/api/v1/chat/conversations", `{"profileId":"a-brand","text":"`+article+`"}`)
			default:
				t.Errorf("%s %s: add a body for this route to the isolation test", d.method, d.path)
				continue
			}
		default:
			rec = b.do(d.method, subst(d.path, d.rule.scope), `{}`)
		}
		checked++
		if rec.Code != want {
			t.Errorf("as someone else: %s %s answered %d, want %d (%s)", d.method, d.path, rec.Code, want, strings.TrimSpace(rec.Body.String()))
		}
	}
	if checked < 30 {
		t.Fatalf("only %d routes were exercised", checked)
	}
	// and A can still reach all of it
	for _, p := range []string{"/api/v1/drafts/" + draft.ID, "/api/v1/publish/jobs/" + job.ID, "/api/v1/chat/conversations/" + conv.ID, "/api/v1/library?profileId=a-brand"} {
		if a.do("GET", p, "").Code != 200 {
			t.Errorf("the owner lost %s", p)
		}
	}
	// lists never include another person's rows
	var st service.State
	b.json("GET", "/api/v1/state", "", &st)
	if len(st.Profiles) != 0 {
		t.Fatalf("b sees %d brands", len(st.Profiles))
	}
	var jobs struct{ Jobs []service.Job }
	if b.json("GET", "/api/v1/publish/jobs?scope=all", "", &jobs); len(jobs.Jobs) != 0 {
		t.Fatalf("b sees %d posts", len(jobs.Jobs))
	}
	var page service.LibraryPage
	if b.json("GET", "/api/v1/library?scope=all", "", &page); len(page.Items) != 0 {
		t.Fatalf("b sees %d library items", len(page.Items))
	}
	// the calendar is narrowed the same way
	span := "&from=" + time.Now().Add(-24*time.Hour).UTC().Format(time.RFC3339) + "&to=" + time.Now().Add(30*24*time.Hour).UTC().Format(time.RFC3339)
	var cal struct{ Entries []service.CalendarEntry }
	if a.json("GET", "/api/v1/calendar?profileId=a-brand"+span, "", &cal); len(cal.Entries) == 0 {
		t.Fatal("the owner sees nothing on the calendar")
	}
	if b.json("GET", "/api/v1/calendar?scope=all"+span, "", &cal); len(cal.Entries) != 0 {
		t.Fatalf("b sees %d calendar entries", len(cal.Entries))
	}
	if code := b.do("GET", "/api/v1/calendar?profileId=a-brand"+span, "").Code; code == 200 {
		t.Fatal("b read another person's calendar")
	}
}

type keyBody struct {
	Key    service.APIKey `json:"key"`
	Secret string         `json:"secret"`
}

func (r *rig) bearer(t *testing.T, secret string) *client {
	c := r.browser(t)
	c.extra["Authorization"] = "Bearer " + secret
	return c
}

func TestAPIKeysAreMadeShownOnceAndActAsTheirPersonWithinTheirScope(t *testing.T) {
	r := newRig(t, rigOpts{})
	admin, ed, wr, other := r.browser(t), r.browser(t), r.browser(t), r.browser(t)
	admin.mustSignup("admin@example.com", "Admin")
	ed.mustSignup("ed@example.com", "Ed")
	w := wr.mustSignup("wren@example.com", "Wren")
	other.mustSignup("other@example.com", "Other")
	admin.json("PUT", "/api/v1/users/"+w.ID, `{"role":"writer"}`, nil)
	wr.login("wren@example.com", "correct horse battery")

	var made keyBody
	if code := ed.json("POST", "/api/v1/api-keys", `{"name":"My agent"}`, &made); code != 201 || !strings.HasPrefix(made.Secret, "cpk_") || made.Key.Scope != "editor" || made.Key.Name != "My agent" {
		t.Fatalf("%d %+v", code, made)
	}
	// the secret is in that answer only
	rec := ed.do("GET", "/api/v1/api-keys", "")
	if rec.Code != 200 || strings.Contains(rec.Body.String(), made.Secret) || !strings.Contains(rec.Body.String(), made.Key.Prefix) || !strings.Contains(rec.Body.String(), `"scopes":["editor"]`) {
		t.Fatalf("a listing never carries the secret: %s", rec.Body)
	}
	if code := ed.json("POST", "/api/v1/api-keys", `{"name":""}`, nil); code != 400 {
		t.Fatalf("%d", code)
	}

	// the editor's brand and work, and someone else's
	ed.json("POST", "/api/v1/profiles", `{"id":"ed-brand","name":"Ed"}`, nil)
	other.json("POST", "/api/v1/profiles", `{"id":"other-brand","name":"Other"}`, nil)
	var theirs service.Draft
	other.json("POST", "/api/v1/drafts", `{"profileId":"other-brand","kind":"post","doc":`+itemDoc+`}`, &theirs)

	k := r.bearer(t, made.Secret) // no cookie: only the key
	var st service.State
	if code := k.json("GET", "/api/v1/state", "", &st); code != 200 || len(st.Profiles) != 1 {
		t.Fatalf("a key sees its person's brands only: %d %d", code, len(st.Profiles))
	}
	var mine service.Draft
	if code := k.json("POST", "/api/v1/drafts", `{"profileId":"ed-brand","kind":"post","doc":`+itemDoc+`}`, &mine); code != 201 || mine.CreatedByName != "Ed Tester" {
		t.Fatalf("a key writes as its person: %d %+v", code, mine)
	}
	if k.do("POST", "/api/v1/drafts/"+mine.ID+"/approve", "").Code != 200 {
		t.Fatal("the editor scope approves")
	}
	if k.do("GET", "/api/v1/drafts/"+theirs.ID, "").Code != 404 || k.do("POST", "/api/v1/drafts", `{"profileId":"other-brand","kind":"post","doc":`+itemDoc+`}`).Code != 404 {
		t.Fatal("a key cannot reach someone else's work")
	}
	// a key cannot manage the account behind it
	for name, code := range map[string]int{
		"make a key": k.do("POST", "/api/v1/api-keys", `{"name":"more"}`).Code,
		"list keys":  k.do("GET", "/api/v1/api-keys", "").Code,
		"password":   k.do("PUT", "/api/v1/auth/password", `{"current":"correct horse battery","new":"another long passphrase"}`).Code,
		"details":    k.do("PUT", "/api/v1/auth/me", `{"firstName":"X","lastName":"Y"}`).Code,
		"users":      k.do("GET", "/api/v1/users", "").Code,
	} {
		if code != 403 {
			t.Errorf("a key must not %s: %d", name, code)
		}
	}
	// someone else cannot revoke it
	if other.do("DELETE", "/api/v1/api-keys/"+made.Key.ID, "").Code != 404 {
		t.Fatal("not theirs to revoke")
	}

	// a writer's key can write but not approve; an admin's key is not an admin
	var wk, ak keyBody
	wr.json("POST", "/api/v1/api-keys", `{"name":"w"}`, &wk)
	admin.json("POST", "/api/v1/api-keys", `{"name":"a"}`, &ak)
	wr.json("POST", "/api/v1/profiles", `{"id":"wren-brand","name":"W"}`, nil)
	wkc := r.bearer(t, wk.Secret)
	var wd service.Draft
	if wkc.json("POST", "/api/v1/drafts", `{"profileId":"wren-brand","kind":"post","doc":`+itemDoc+`}`, &wd) != 201 || wkc.do("POST", "/api/v1/drafts/"+wd.ID+"/approve", "").Code != 403 {
		t.Fatal("a writer's key is limited by the writer")
	}
	akc := r.bearer(t, ak.Secret)
	if akc.do("GET", "/api/v1/users", "").Code != 403 || akc.do("GET", "/api/v1/drafts/"+theirs.ID, "").Code != 404 {
		t.Fatal("an admin's key does not see everyone's work or manage people")
	}
	if admin.do("GET", "/api/v1/drafts/"+theirs.ID, "").Code != 200 {
		t.Fatal("while the admin does")
	}

	// revoking stops it at once; garbage never works
	if ed.do("DELETE", "/api/v1/api-keys/"+made.Key.ID, "").Code != 204 || k.do("GET", "/api/v1/state", "").Code != 401 {
		t.Fatal("a revoked key stops working")
	}
	if r.bearer(t, "cpk_"+strings.Repeat("a", 43)).do("GET", "/api/v1/state", "").Code != 401 {
		t.Fatal("an unknown key is refused")
	}
	var list struct{ Keys []service.APIKey }
	if ed.json("GET", "/api/v1/api-keys", "", &list); len(list.Keys) != 0 {
		t.Fatalf("%+v", list.Keys)
	}
}

// With one shared key behind it, the assistant acts as one account, so only the admin may send it messages.
func TestASharedAssistantIsTheAdminsOnly(t *testing.T) {
	r := newRig(t, rigOpts{adminOnly: true})
	admin, other := r.browser(t), r.browser(t)
	admin.mustSignup("ada@example.com", "Ada")
	other.mustSignup("bob@example.com", "Bob")
	for name, c := range map[string]struct {
		who  *client
		want int
	}{"admin": {admin, 200}, "someone else": {other, 403}} {
		brand := "brand-" + strings.Fields(name)[0]
		if code := c.who.json("POST", "/api/v1/profiles", `{"id":"`+brand+`","name":"B"}`, nil); code >= 300 {
			t.Fatalf("%s: brand %d", name, code)
		}
		var conv service.Conversation
		if code := c.who.json("POST", "/api/v1/chat/conversations", `{"profileId":"`+brand+`","text":"`+article+`"}`, &conv); code != 201 {
			t.Fatalf("%s: start %d", name, code)
		}
		res := c.who.do("POST", "/api/v1/chat/conversations/"+conv.ID+"/messages", `{"content":"","write":["post"]}`)
		if res.Code != c.want {
			t.Errorf("%s: %d %s", name, res.Code, res.Body)
		}
	}
}

// Who a brand is belongs to its owner and the administrators. It is kept apart from the brand's look, so nothing that
// reads the brand (the app's state, and through it exports, public pages and the assistant) can carry it.
func TestBrandDetails(t *testing.T) {
	r := newRig(t, rigOpts{})
	admin, ed, other := r.browser(t), r.browser(t), r.browser(t)
	admin.mustSignup("admin@example.com", "Admin")
	ed.mustSignup("ed@example.com", "Ed")
	other.mustSignup("other@example.com", "Other")
	if code := ed.json("POST", "/api/v1/profiles", `{"id":"acme","name":"Acme"}`, nil); code != 201 {
		t.Fatalf("a brand: %d", code)
	}
	const path = "/api/v1/profiles/acme/details"
	var got service.BrandDetails
	if code := ed.json("GET", path, "", &got); code != 200 || got != (service.BrandDetails{}) {
		t.Fatalf("a new brand has none: %d %+v", code, got)
	}
	in := `{"kind":"company","legalName":" Acme Ltd ","line1":"1 Secret Lane","city":"Springfield","country":"US","mobile":"+1 555 010 0000","email":"owner@acme.example"}`
	if code := ed.json("PUT", path, in, &got); code != 200 || got.LegalName != "Acme Ltd" || got.Country != "US" {
		t.Fatalf("saved: %d %+v", code, got)
	}
	for _, p := range []string{"/api/v1/state", "/api/v1/library?profileId=acme"} {
		if body := ed.do("GET", p, "").Body.String(); strings.Contains(body, "Secret Lane") || strings.Contains(body, "owner@acme.example") {
			t.Errorf("%s carries the details", p)
		}
	}
	if code := other.do("GET", path, "").Code; code != 404 {
		t.Errorf("another person reads: %d", code)
	}
	if code := other.do("PUT", path, `{}`).Code; code != 404 {
		t.Errorf("another person writes: %d", code)
	}
	if code := admin.do("GET", path, "").Code; code != 200 {
		t.Errorf("an administrator reads: %d", code)
	}
	if code := r.browser(t).do("GET", path, "").Code; code != 401 {
		t.Errorf("nobody signed in reads: %d", code)
	}
	for _, bad := range []string{`{"kind":"charity"}`, `{"country":"usa"}`, `{"email":"not-an-address"}`, `{"email":"a@b"}`, `{"mobile":"call me"}`, `{"line1":"a\nb"}`, `{"city":"` + strings.Repeat("x", 81) + `"}`} {
		if code := ed.do("PUT", path, bad).Code; code != 400 {
			t.Errorf("%s: %d", bad, code)
		}
	}
	// gone with the brand
	if code := ed.json("POST", "/api/v1/profiles", `{"id":"keep","name":"Keep"}`, nil); code != 201 {
		t.Fatal(code)
	}
	ed.do("POST", "/api/v1/profiles/acme/archive", "")
	if code := ed.do("DELETE", "/api/v1/profiles/acme", "").Code; code >= 300 {
		t.Fatalf("delete: %d", code)
	}
	var n int
	if err := r.db.QueryRow(`SELECT COUNT(*) FROM brand_details`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("details left behind: %d %v", n, err)
	}
}

func TestMediaLibraryAccess(t *testing.T) {
	r := newRig(t, rigOpts{})
	admin, ed, other := r.browser(t), r.browser(t), r.browser(t)
	admin.mustSignup("admin@example.com", "Admin")
	ed.mustSignup("ed@example.com", "Ed")
	other.mustSignup("other@example.com", "Other")
	if code := ed.json("POST", "/api/v1/profiles", `{"id":"acme","name":"Acme"}`, nil); code != 201 {
		t.Fatalf("a brand: %d", code)
	}
	upload := func(c *client, file []byte) *httptest.ResponseRecorder {
		var body bytes.Buffer
		f := multipart.NewWriter(&body)
		_ = f.WriteField("name", `Price "list"`)
		_ = f.WriteField("tags", "sales, 2026")
		part, _ := f.CreateFormFile("file", "list.pdf")
		_, _ = part.Write(file)
		_ = f.Close()
		req := httptest.NewRequest("POST", "/api/v1/profiles/acme/assets", &body)
		req.Header.Set("Content-Type", f.FormDataContentType())
		return c.send(req)
	}
	rec := upload(ed, []byte("%PDF-1.7 prices"))
	var a service.Asset
	if err := json.Unmarshal(rec.Body.Bytes(), &a); rec.Code != 201 || err != nil || a.Kind != "pdf" || len(a.Tags) != 2 || a.CreatedBy != "Ed Tester" {
		t.Fatalf("upload: %d %s", rec.Code, rec.Body)
	}
	if code := upload(ed, []byte("<html><script>alert(1)</script>")).Code; code != 400 {
		t.Errorf("a page was taken as a file: %d", code)
	}
	if code := upload(ed, make([]byte, 22<<20)).Code; code != 413 {
		t.Errorf("too large: %d", code)
	}
	file := ed.do("GET", "/api/v1/profiles/acme/assets/"+a.ID+"/file", "")
	if file.Code != 200 || file.Header().Get("Content-Type") != "application/pdf" || file.Header().Get("X-Content-Type-Options") != "nosniff" ||
		!strings.HasPrefix(file.Header().Get("Content-Disposition"), "attachment") || !strings.Contains(file.Header().Get("Content-Security-Policy"), "sandbox") {
		t.Errorf("file: %d %v", file.Code, file.Header())
	}
	base := "/api/v1/profiles/acme/assets"
	for _, call := range [][3]string{{"GET", base, ""}, {"GET", base + "/" + a.ID + "/file", ""}, {"PUT", base + "/" + a.ID, `{"name":"Mine"}`}, {"DELETE", base + "/" + a.ID, ""}} {
		if code := other.do(call[0], call[1], call[2]).Code; code != 404 {
			t.Errorf("another person, %s %s: %d", call[0], call[1], code)
		}
		if code := r.browser(t).do(call[0], call[1], call[2]).Code; code != 401 {
			t.Errorf("nobody signed in, %s %s: %d", call[0], call[1], code)
		}
	}
	if code := admin.do("GET", base, "").Code; code != 200 {
		t.Errorf("an administrator: %d", code)
	}
	// gone with the brand, file and all
	if code := ed.json("POST", "/api/v1/profiles", `{"id":"keep","name":"Keep"}`, nil); code != 201 {
		t.Fatal(code)
	}
	ed.do("POST", "/api/v1/profiles/acme/archive", "")
	if code := ed.do("DELETE", "/api/v1/profiles/acme", "").Code; code >= 300 {
		t.Fatalf("delete: %d", code)
	}
	var n int
	if err := r.db.QueryRow(`SELECT (SELECT COUNT(*) FROM assets) + (SELECT COUNT(*) FROM asset_blobs)`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("files left behind: %d %v", n, err)
	}
}

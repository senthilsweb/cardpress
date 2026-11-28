package api

import "testing"

func TestTheColoursCookieFollowsThePerson(t *testing.T) {
	r := newRig(t, rigOpts{})
	c := r.browser(t)
	c.mustSignup("ada@example.com", "Ada")
	if ck := c.cookies[lookCookieName]; ck == nil || ck.Value != "parchment.system" || ck.HttpOnly {
		t.Fatalf("at sign-up: %+v", ck)
	}
	for key, v := range map[string]string{"theme": `"dark"`, "palette": `"cobalt"`, "ui": `{"media.view":"list"}`} {
		if rec := c.do("PUT", "/api/v1/preferences/"+key, v); rec.Code != 204 {
			t.Fatalf("%s: %d %s", key, rec.Code, rec.Body)
		}
	}
	if got := c.cookies[lookCookieName].Value; got != "cobalt.dark" {
		t.Fatalf("after a change: %q", got)
	}
	other := r.browser(t) // another browser gets them at sign-in
	other.login("ada@example.com", "correct horse battery")
	if got := other.cookies[lookCookieName].Value; got != "cobalt.dark" {
		t.Fatalf("at sign-in: %q", got)
	}
	var st struct{ Preferences map[string]any }
	if other.json("GET", "/api/v1/state", "", &st); st.Preferences["ui"] == nil {
		t.Fatalf("view choices travel with the person: %v", st.Preferences)
	}
	// a value that is not a plain word never reaches the cookie
	c.do("PUT", "/api/v1/preferences/palette", `"x; Path=/evil"`)
	if got := c.cookies[lookCookieName].Value; got != "parchment.dark" {
		t.Fatalf("%q", got)
	}
}

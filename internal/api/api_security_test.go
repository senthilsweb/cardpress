package api

import (
	"encoding/json"
	"testing"

	"github.com/senthilsweb/cardpress/internal/service"
)

func TestOnlyASignedInAdministratorSetsTheSecurityRules(t *testing.T) {
	r := newRig(t, rigOpts{token: "a-long-enough-server-token"})
	admin := r.browser(t)
	admin.mustSignup("admin@example.com", "Admin")
	editor := r.browser(t)
	editor.mustSignup("ed@example.com", "Ed")

	var got struct {
		Settings, Defaults service.SecuritySettings
		Saved              bool
		ActiveSessions     int
	}
	if code := admin.json("GET", "/api/v1/security", "", &got); code != 200 || got.Saved || !got.Settings.SignupOpen || got.Settings.IdleMinutes != 20 || got.Settings.MaxMinutes != 720 || got.ActiveSessions != 2 {
		t.Fatalf("%d %+v", code, got)
	}
	token := r.browser(t)
	token.extra = map[string]string{"Authorization": "Bearer a-long-enough-server-token"}
	for who, c := range map[string]*client{"an editor": editor, "the server token": token, "a stranger": r.browser(t)} {
		for _, call := range [][2]string{{"GET", "/api/v1/security"}, {"PUT", "/api/v1/security"}, {"DELETE", "/api/v1/security"}, {"POST", "/api/v1/security/sign-out-everyone"}, {"GET", "/api/v1/security/log"}} {
			if code := c.do(call[0], call[1], "{}").Code; code != 401 && code != 403 {
				t.Errorf("%s may %s %s: %d", who, call[0], call[1], code)
			}
		}
	}

	want := got.Settings
	want.SignupOpen, want.MinPassword, want.DefaultRole = false, 14, "writer"
	body, _ := json.Marshal(want)
	if code := admin.json("PUT", "/api/v1/security", string(body), &got); code != 200 || !got.Saved || got.Settings != want {
		t.Fatalf("%d %+v", code, got)
	}
	// it applies at once
	var info map[string]any
	r.browser(t).json("GET", "/api/v1/info", "", &info)
	if info["signupOpen"] != false || info["passwordMin"] != float64(14) {
		t.Fatalf("%v", info)
	}
	if code := r.browser(t).do("POST", "/api/v1/auth/signup", `{"firstName":"N","lastName":"O","email":"no@example.com","password":"a long passphrase here"}`).Code; code != 403 {
		t.Fatalf("sign-up is closed: %d", code)
	}
	if code := admin.do("POST", "/api/v1/users", `{"firstName":"New","lastName":"One","email":"new@example.com","role":"writer","password":"thirteen-char"}`).Code; code != 400 {
		t.Fatalf("a password shorter than the rule: %d", code)
	}
	bad := want
	bad.IdleMinutes = 1
	body, _ = json.Marshal(bad)
	if code := admin.do("PUT", "/api/v1/security", string(body)).Code; code != 400 {
		t.Fatalf("%d", code)
	}
	// nobody can write them through the preferences, or read them there
	if code := editor.do("PUT", "/api/v1/preferences/security", `{"signupOpen":true}`).Code; code != 400 {
		t.Fatalf("%d", code)
	}
	var st struct{ Preferences map[string]any }
	if editor.json("GET", "/api/v1/state", "", &st); st.Preferences["security"] != nil {
		t.Fatal("an editor sees the security settings")
	}

	// sign out everyone else
	var out struct{ Ended int }
	if code := admin.json("POST", "/api/v1/security/sign-out-everyone", "", &out); code != 200 || out.Ended != 1 {
		t.Fatalf("%d %+v", code, out)
	}
	if editor.do("GET", "/api/v1/state", "").Code != 401 || admin.do("GET", "/api/v1/state", "").Code != 200 {
		t.Fatal("everyone but the one who asked is signed out")
	}
	if code := admin.json("DELETE", "/api/v1/security", "", &got); code != 200 || got.Saved || got.Settings != got.Defaults {
		t.Fatalf("%d %+v", code, got)
	}
}

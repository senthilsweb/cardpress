package config

import (
	"testing"
	"time"
)

func env(m map[string]string) func(string) string { return func(k string) string { return m[k] } }

func TestDefaultsAreLoopbackAndValid(t *testing.T) {
	c, err := Load(nil, env(nil))
	if err != nil {
		t.Fatal(err)
	}
	if c.Addr != "127.0.0.1:8080" || c.DBURL != defaultDB || !c.ServeWeb {
		t.Fatalf("unexpected defaults: %+v", c)
	}
	if err := c.Validate(); err != nil {
		t.Fatal(err)
	}
}

func TestExposureGuard(t *testing.T) {
	for _, tc := range []struct {
		name string
		env  map[string]string
		ok   bool
	}{
		{"all interfaces, no token", map[string]string{"ADDR": ":8080"}, false},
		{"0.0.0.0, no token", map[string]string{"ADDR": "0.0.0.0:8080"}, false},
		{"all interfaces, token", map[string]string{"ADDR": ":8080", "CARDPRESS_API_TOKEN": "0123456789abcdef"}, true},
		{"all interfaces, insecure", map[string]string{"ADDR": ":8080", "CARDPRESS_INSECURE": "1"}, true},
		{"localhost", map[string]string{"ADDR": "localhost:9000"}, true},
		{"ipv6 loopback", map[string]string{"ADDR": "[::1]:9000"}, true},
		{"short token", map[string]string{"CARDPRESS_API_TOKEN": "short"}, false},
	} {
		c, err := Load(nil, env(tc.env))
		if err != nil {
			t.Fatalf("%s: %v", tc.name, err)
		}
		if got := c.Validate() == nil; got != tc.ok {
			t.Errorf("%s: valid=%v, want %v", tc.name, got, tc.ok)
		}
	}
}

func TestCORSOriginsAndBadBool(t *testing.T) {
	c, _ := Load(nil, env(map[string]string{"CARDPRESS_CORS_ORIGINS": " https://a.example/ , http://localhost:4321 ,"}))
	if len(c.CORSOrigins) != 2 || c.CORSOrigins[0] != "https://a.example" {
		t.Fatalf("origins: %v", c.CORSOrigins)
	}
	if _, err := Load(nil, env(map[string]string{"CARDPRESS_INSECURE": "maybe"})); err == nil {
		t.Fatal("expected error for bad bool")
	}
}

func TestSecretKeyAndLocalMode(t *testing.T) {
	c, _ := Load(nil, env(map[string]string{"CARDPRESS_SECRET_KEY": "too short"}))
	if c.Validate() == nil {
		t.Fatal("a short secret key must be refused")
	}
	if c, _ := Load(nil, env(nil)); !c.LocalMode() || c.LocalDBPath() != "./data/cardpress.db" {
		t.Fatalf("defaults should be local: %q", c.LocalDBPath())
	}
	for name, e := range map[string]map[string]string{
		"hosted db":       {"CARDPRESS_DB_URL": "libsql://x.turso.io"},
		"exposed address": {"ADDR": ":8080", "CARDPRESS_INSECURE": "1"},
	} {
		if c, _ := Load(nil, env(e)); c.LocalMode() {
			t.Errorf("%s must not count as local mode", name)
		}
	}
	if c, _ := Load(nil, env(map[string]string{"CARDPRESS_DB_URL": "file:/data/x.db?_pragma=a"})); c.LocalDBPath() != "/data/x.db" {
		t.Fatalf("%q", c.LocalDBPath())
	}
}

func TestPublishingSettings(t *testing.T) {
	c, _ := Load(nil, env(nil))
	if c.MissedGrace != 15*time.Minute {
		t.Fatalf("default grace: %v", c.MissedGrace)
	}
	if c, err := Load(nil, env(map[string]string{"CARDPRESS_MISSED_GRACE": "45m"})); err != nil || c.MissedGrace != 45*time.Minute {
		t.Fatalf("%v %v", c.MissedGrace, err)
	}
	for _, bad := range []string{"soon", "10s", "48h"} {
		if _, err := Load(nil, env(map[string]string{"CARDPRESS_MISSED_GRACE": bad})); err == nil {
			t.Errorf("grace %q should be refused", bad)
		}
	}
	for base, ok := range map[string]bool{
		"https://api.linkedin.com": true, "http://127.0.0.1:9999": true, "http://localhost:9": true,
		"http://api.linkedin.com": false, "http://evil.example": false, "ftp://x": false, "nonsense": false,
	} {
		c, _ := Load(nil, env(map[string]string{"CARDPRESS_LINKEDIN_API_BASE": base}))
		if got := c.Validate() == nil; got != ok {
			t.Errorf("api base %q: valid=%v, want %v", base, got, ok)
		}
	}
}

func TestMCPAndAllowedHosts(t *testing.T) {
	c, _ := Load(nil, env(nil))
	if !c.MCPEnabled || len(c.AllowedHosts) != 0 {
		t.Fatalf("defaults: %+v", c)
	}
	c, err := Load(nil, env(map[string]string{"CARDPRESS_MCP": "false", "CARDPRESS_ALLOWED_HOSTS": " cards.lan , 10.0.0.5:8080,, "}))
	if err != nil || c.MCPEnabled || len(c.AllowedHosts) != 2 || c.AllowedHosts[0] != "cards.lan" || c.AllowedHosts[1] != "10.0.0.5:8080" {
		t.Fatalf("%v %+v", err, c)
	}
	if c, _ := Load([]string{"-mcp=false"}, env(nil)); c.MCPEnabled {
		t.Fatal("the flag should switch it off")
	}
	if _, err := Load(nil, env(map[string]string{"CARDPRESS_MCP": "perhaps"})); err == nil {
		t.Fatal("a bad value must be refused")
	}
}

func TestAgentSettings(t *testing.T) {
	c, err := Load(nil, env(nil))
	if err != nil || c.Agent != "mock" || c.AgentTimeout != 4*time.Minute || c.Validate() != nil {
		t.Fatalf("the demo agent is the default: %v %+v", err, c)
	}
	good := map[string]string{"CARDPRESS_AGENT": "CMA", "CARDPRESS_AGENT_ID": "agent_1", "CARDPRESS_AGENT_ENVIRONMENT_ID": "env_1",
		"CARDPRESS_AGENT_VERSION": "3", "CARDPRESS_AGENT_BUDGET_CENTS": "500", "CARDPRESS_AGENT_TIMEOUT": "90s"}
	c, err = Load(nil, env(good))
	if err != nil || c.Validate() != nil || c.Agent != "cma" || c.AgentVersion != 3 || c.AgentBudget != 500 || c.AgentTimeout != 90*time.Second {
		t.Fatalf("%v %+v", err, c)
	}
	// choosing cma without ids, or an unknown agent, stops the server from starting
	for name, m := range map[string]map[string]string{
		"no ids":  {"CARDPRESS_AGENT": "cma"},
		"unknown": {"CARDPRESS_AGENT": "gpt"},
	} {
		c, err := Load(nil, env(m))
		if err != nil || c.Validate() == nil {
			t.Errorf("%s should be refused: %v", name, err)
		}
	}
	for _, m := range []map[string]string{{"CARDPRESS_AGENT_VERSION": "x"}, {"CARDPRESS_AGENT_BUDGET_CENTS": "-1"}, {"CARDPRESS_AGENT_TIMEOUT": "1s"}} {
		if _, err := Load(nil, env(m)); err == nil {
			t.Errorf("%v should be refused", m)
		}
	}
}

func TestPublicURLForThePublicPages(t *testing.T) {
	c, err := Load(nil, env(map[string]string{"CARDPRESS_PUBLIC_URL": "https://example.com/", "CARDPRESS_SITE_NAME": " My Site "}))
	if err != nil || c.PublicURL != "https://example.com" || c.SiteName != "My Site" || c.Validate() != nil {
		t.Fatalf("%+v %v", c, err)
	}
	for _, bad := range []string{"example.com", "ftp://example.com", "https://example.com/blog", "https://example.com?x=1", "https://"} {
		c, _ := Load(nil, env(map[string]string{"CARDPRESS_PUBLIC_URL": bad}))
		if c.Validate() == nil {
			t.Errorf("%q should be refused", bad)
		}
	}
}

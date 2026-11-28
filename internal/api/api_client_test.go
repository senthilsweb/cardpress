package api

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"fmt"
	"strings"
)

func TestTheClientsAddressComesFromTheProxysHeaderOnlyWhenNamed(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.RemoteAddr = "10.0.0.1:5000"
	req.Header.Set("Fly-Client-IP", "203.0.113.7")
	if got := (&server{}).clientAddr(req); got != "10.0.0.1" {
		t.Fatalf("unnamed headers are not believed: %s", got)
	}
	s := &server{Options: Options{ClientIPHeader: "Fly-Client-IP"}}
	if got := s.clientAddr(req); got != "203.0.113.7" {
		t.Fatal(got)
	}
	for value, want := range map[string]string{"198.51.100.1, 203.0.113.9": "203.0.113.9", "nonsense": "10.0.0.1", "": "10.0.0.1"} {
		req.Header = http.Header{}
		req.Header.Set("Fly-Client-IP", value)
		if got := s.clientAddr(req); got != want {
			t.Errorf("%q: %s", value, got)
		}
	}
}

func TestOneAddressCannotCreateAccountsWithoutEnd(t *testing.T) {
	r := newRig(t, rigOpts{})
	last := 0
	for i := range 22 {
		body := fmt.Sprintf(`{"firstName":"A","lastName":"B","email":"p%d@example.com","password":"short"}`, i)
		req := httptest.NewRequest("POST", "/api/v1/auth/signup", strings.NewReader(body))
		last = r.browser(t).send(req).Code
		if i < 20 && last == http.StatusTooManyRequests {
			t.Fatalf("refused at %d", i)
		}
	}
	if last != http.StatusTooManyRequests {
		t.Fatalf("%d", last)
	}
}

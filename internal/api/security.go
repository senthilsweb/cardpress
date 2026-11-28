package api

import (
	"net/http"
	"strconv"

	"github.com/senthilsweb/cardpress/internal/service"
)

// securityPerson is the administrator, signed in to the app, who may see and change the security settings. An API key and
// the server's token may not.
func (s *server) securityPerson(w http.ResponseWriter, r *http.Request) (service.User, bool) {
	if s.Accounts == nil {
		s.off(w, r)
		return service.User{}, false
	}
	return s.person(w, r)
}

func (s *server) writeSecurity(w http.ResponseWriter, r *http.Request) {
	settings, saved := s.Accounts.Security(r.Context())
	sessions, err := s.Accounts.ActiveSessions(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"settings": settings, "defaults": s.Accounts.SecurityDefaults(), "saved": saved, "activeSessions": sessions})
}

func (s *server) getSecurity(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.securityPerson(w, r); ok {
		s.writeSecurity(w, r)
	}
}

func (s *server) putSecurity(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.securityPerson(w, r); !ok {
		return
	}
	var in service.SecuritySettings
	if !decode(w, r, &in) {
		return
	}
	if err := s.Accounts.SetSecurity(r.Context(), in); err != nil {
		fail(w, r, err)
		return
	}
	s.writeSecurity(w, r)
}

func (s *server) resetSecurity(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.securityPerson(w, r); !ok {
		return
	}
	if err := s.Accounts.ResetSecurity(r.Context()); err != nil {
		fail(w, r, err)
		return
	}
	s.writeSecurity(w, r)
}

// securityLog answers the newest events, or with ?before=<id> the ones older than that.
func (s *server) securityLog(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.securityPerson(w, r); !ok {
		return
	}
	before, _ := strconv.ParseInt(r.URL.Query().Get("before"), 10, 64)
	events, more, err := s.Accounts.SecurityLog(r.Context(), before)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events, "more": more})
}

func (s *server) signOutEveryone(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.securityPerson(w, r); !ok {
		return
	}
	n, err := s.Accounts.SignOutEveryone(r.Context(), sessionToken(r))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int{"ended": n})
}

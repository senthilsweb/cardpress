package api

import (
	"net/http"

	"github.com/senthilsweb/cardpress/internal/service"
)

// assistantPerson lets through who may change how the assistant works for a brand: on a server with accounts an
// administrator signed in to the app (the route's rule has checked the role; an API key may not), otherwise whoever
// holds the server's token.
func (s *server) assistantPerson(w http.ResponseWriter, r *http.Request) bool {
	if s.Accounts == nil {
		return true
	}
	_, ok := s.person(w, r)
	return ok
}

func (s *server) getBrandAssistant(w http.ResponseWriter, r *http.Request) {
	v, err := s.Chat.BrandAssistant(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) putBrandAssistant(w http.ResponseWriter, r *http.Request) {
	if !s.assistantPerson(w, r) {
		return
	}
	var in service.BrandAssistant
	if !decode(w, r, &in) {
		return
	}
	v, err := s.Chat.SetBrandAssistant(r.Context(), r.PathValue("id"), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) resetBrandAssistant(w http.ResponseWriter, r *http.Request) {
	if !s.assistantPerson(w, r) {
		return
	}
	v, err := s.Chat.ResetBrandAssistant(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

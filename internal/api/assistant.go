package api

import (
	"net/http"
	"strconv"

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

func (s *server) getAssistant(w http.ResponseWriter, r *http.Request) {
	if !s.assistantPerson(w, r) {
		return
	}
	v, err := s.Chat.Assistant(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) putAssistant(w http.ResponseWriter, r *http.Request) {
	if !s.assistantPerson(w, r) {
		return
	}
	var in service.AssistantSettings
	if !decode(w, r, &in) {
		return
	}
	v, err := s.Chat.SetAssistant(r.Context(), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) resetAssistant(w http.ResponseWriter, r *http.Request) {
	if !s.assistantPerson(w, r) {
		return
	}
	v, err := s.Chat.ResetAssistant(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// A brand's writing guides are for whoever may see the brand: its owner and the administrators. Changing one needs a
// person signed in to the app, not a key.
func (s *server) getGuides(w http.ResponseWriter, r *http.Request) {
	v, err := s.Chat.Guides(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) putGuide(w http.ResponseWriter, r *http.Request) {
	if !s.assistantPerson(w, r) {
		return
	}
	var in struct {
		Body string `json:"body"`
	}
	if !decode(w, r, &in) {
		return
	}
	v, err := s.Chat.SaveGuide(r.Context(), r.PathValue("id"), r.PathValue("kind"), in.Body)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) guideVersions(w http.ResponseWriter, r *http.Request) {
	v, err := s.Chat.GuideVersions(r.Context(), r.PathValue("id"), r.PathValue("kind"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"versions": v})
}

func (s *server) restoreGuide(w http.ResponseWriter, r *http.Request) {
	if !s.assistantPerson(w, r) {
		return
	}
	n, err := strconv.Atoi(r.PathValue("version"))
	if err != nil {
		fail(w, r, service.ErrNotFound)
		return
	}
	v, err := s.Chat.RestoreGuide(r.Context(), r.PathValue("id"), r.PathValue("kind"), n)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

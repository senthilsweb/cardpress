// Package api is the HTTP adapter over the service layer.
package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/senthilsweb/cardpress/internal/mcpserver"
	"github.com/senthilsweb/cardpress/internal/service"
)

const (
	prefix       = "/api/v1"
	maxBodyBytes = 32 << 20 // designs carry embedded images
)

// Studio is the part of the service layer the HTTP API needs.
type Studio interface {
	State(ctx context.Context) (service.State, error)
	ReplaceProfiles(ctx context.Context, list []json.RawMessage) error
	CreateProfile(ctx context.Context, raw json.RawMessage) error
	SaveProfile(ctx context.Context, id string, raw json.RawMessage) error
	ReorderProfiles(ctx context.Context, ids []string) error
	ArchiveProfile(ctx context.Context, id string) (service.ArchiveResult, error)
	RestoreProfile(ctx context.Context, id string) error
	DeleteProfile(ctx context.Context, id string) error
	ReplaceDesigns(ctx context.Context, designs map[string]json.RawMessage) error
	SetPreference(ctx context.Context, key string, value json.RawMessage) error
	ImportLegacy(ctx context.Context, l service.Legacy) error
	ListDrafts(ctx context.Context, profileID string) ([]service.Draft, error)
	GetDraft(ctx context.Context, id string) (service.Draft, error)
	CreateDraft(ctx context.Context, in service.DraftInput) (service.Draft, error)
	UpdateDraft(ctx context.Context, id string, in service.DraftInput) (service.Draft, error)
	DeleteDraft(ctx context.Context, id string) error
}

// Library is the part of the library service the HTTP API needs.
type Library interface {
	List(ctx context.Context, q service.LibraryQuery) (service.LibraryPage, error)
}

// Publishing is the part of the publishing service the HTTP API needs.
type Publishing interface {
	Create(ctx context.Context, in service.JobInput) (service.Job, error)
	Get(ctx context.Context, id string) (service.Job, error)
	List(ctx context.Context, profileID string) ([]service.Job, error)
	ListAll(ctx context.Context) ([]service.Job, error)
	Image(ctx context.Context, id string) ([]byte, error)
	Attempts(ctx context.Context, jobID string) ([]service.Attempt, error)
	PublishNow(ctx context.Context, id string, acceptDuplicate bool) (service.Job, error)
	Reschedule(ctx context.Context, id string, at time.Time, timezone string) (service.Job, error)
	Cancel(ctx context.Context, id string) (service.Job, error)
	Delete(ctx context.Context, id string) error
	Execute(ctx context.Context, id string)
	Go(fn func())
}

// Chatting is the part of the chat service the HTTP API needs.
type Chatting interface {
	Agent() service.AgentInfo
	Start(ctx context.Context, profileID, url, text string) (service.Conversation, error)
	List(ctx context.Context, profileID string) ([]service.Conversation, error)
	Get(ctx context.Context, id string) (service.Conversation, error)
	Delete(ctx context.Context, id string) error
	Send(ctx context.Context, id, content string, emit func(service.ChatEvent)) error
	Decide(ctx context.Context, proposalID string, d service.Decision) (service.ProposalView, error)
}

// Settings is the part of the settings service the HTTP API needs.
type Settings interface {
	EnvProfile(ctx context.Context) (string, error)
	View(ctx context.Context, profileID string) (service.SettingsView, error)
	Network(ctx context.Context, profileID, id string) (service.NetworkView, error)
	Put(ctx context.Context, profileID, id string, changes map[string]*string) (service.NetworkView, error)
	Test(ctx context.Context, profileID, id string) (service.TestResult, error)
}

// Options configure the handler.
type Options struct {
	Studio       Studio
	Settings     Settings
	Publishing   Publishing
	Library      Library
	Chat         Chatting
	Token        string   // empty: no bearer token required
	CORSOrigins  []string // exact origins allowed to call the API from a browser
	LocalGuard   bool     // no token: answer only to localhost names (see ProtectOptions)
	AllowedHosts []string // extra host names the server may be reached by when LocalGuard is on
	Audit        interface {
		List(ctx context.Context, limit int) ([]mcpserver.AuditEntry, error)
	} // MCP call log; nil if MCP is off
	Version  string
	DBDriver string
}

type server struct {
	Options
	origins map[string]bool
}

// New returns a handler that serves everything under /api/v1.
func New(o Options) http.Handler {
	s := &server{Options: o, origins: map[string]bool{}}
	for _, origin := range o.CORSOrigins {
		s.origins[origin] = true
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET "+prefix+"/info", s.info)
	mux.HandleFunc("GET "+prefix+"/state", s.state)
	mux.HandleFunc("PUT "+prefix+"/profiles", s.putProfiles)
	mux.HandleFunc("POST "+prefix+"/profiles", s.createProfile)
	mux.HandleFunc("PUT "+prefix+"/profiles/order", s.orderProfiles)
	mux.HandleFunc("PUT "+prefix+"/profiles/{id}", s.saveProfile)
	mux.HandleFunc("POST "+prefix+"/profiles/{id}/archive", s.archiveProfile)
	mux.HandleFunc("POST "+prefix+"/profiles/{id}/restore", s.restoreProfile)
	mux.HandleFunc("DELETE "+prefix+"/profiles/{id}", s.deleteProfile)
	mux.HandleFunc("GET "+prefix+"/profiles/{id}/settings", s.getSettings)
	mux.HandleFunc("GET "+prefix+"/profiles/{id}/settings/{network}", s.getNetwork)
	mux.HandleFunc("PUT "+prefix+"/profiles/{id}/settings/{network}", s.putNetwork)
	mux.HandleFunc("POST "+prefix+"/profiles/{id}/settings/{network}/test", s.testNetwork)
	mux.HandleFunc("PUT "+prefix+"/designs", s.putDesigns)
	mux.HandleFunc("PUT "+prefix+"/preferences/{key}", s.putPreference)
	mux.HandleFunc("POST "+prefix+"/import/legacy", s.importLegacy)
	mux.HandleFunc("GET "+prefix+"/drafts", s.listDrafts)
	mux.HandleFunc("POST "+prefix+"/drafts", s.createDraft)
	mux.HandleFunc("GET "+prefix+"/drafts/{id}", s.getDraft)
	mux.HandleFunc("PUT "+prefix+"/drafts/{id}", s.updateDraft)
	mux.HandleFunc("DELETE "+prefix+"/drafts/{id}", s.deleteDraft)
	mux.HandleFunc("GET "+prefix+"/settings", s.getSettings)
	mux.HandleFunc("GET "+prefix+"/settings/{network}", s.getNetwork)
	mux.HandleFunc("PUT "+prefix+"/settings/{network}", s.putNetwork)
	mux.HandleFunc("POST "+prefix+"/settings/{network}/test", s.testNetwork)
	mux.HandleFunc("POST "+prefix+"/publish/jobs", s.createJob)
	mux.HandleFunc("GET "+prefix+"/publish/jobs", s.listJobs)
	mux.HandleFunc("GET "+prefix+"/library", s.library)
	mux.HandleFunc("GET "+prefix+"/publish/jobs/{id}", s.getJob)
	mux.HandleFunc("GET "+prefix+"/publish/jobs/{id}/attempts", s.jobAttempts)
	mux.HandleFunc("GET "+prefix+"/publish/jobs/{id}/image", s.jobImage)
	mux.HandleFunc("POST "+prefix+"/publish/jobs/{id}/publish-now", s.publishNow)
	mux.HandleFunc("PUT "+prefix+"/publish/jobs/{id}/schedule", s.rescheduleJob)
	mux.HandleFunc("POST "+prefix+"/publish/jobs/{id}/cancel", s.cancelJob)
	mux.HandleFunc("DELETE "+prefix+"/publish/jobs/{id}", s.deleteJob)
	mux.HandleFunc("POST "+prefix+"/chat/conversations", s.startConversation)
	mux.HandleFunc("GET "+prefix+"/chat/conversations", s.listConversations)
	mux.HandleFunc("GET "+prefix+"/chat/conversations/{id}", s.getConversation)
	mux.HandleFunc("DELETE "+prefix+"/chat/conversations/{id}", s.deleteConversation)
	mux.HandleFunc("POST "+prefix+"/chat/conversations/{id}/messages", s.sendMessage)
	mux.HandleFunc("POST "+prefix+"/chat/proposals/{id}/decision", s.decideProposal)
	mux.HandleFunc("GET "+prefix+"/mcp/audit", s.mcpAudit)
	mux.HandleFunc(prefix+"/", func(w http.ResponseWriter, r *http.Request) {
		writeError(w, r, http.StatusNotFound, "not_found", "no such endpoint")
	})
	protect := ProtectOptions{Token: o.Token, LocalGuard: o.LocalGuard, AllowedHosts: o.AllowedHosts, TrustedOrigins: o.CORSOrigins}
	// /info stays open so the web app can learn whether it needs a token
	return s.requestID(s.recoverer(s.cors(browserGuards(protect)(bearerGuard(o.Token, prefix+"/info")(mux)))))
}

/* ---------------------------------------------------------------- middleware */

type ctxKey struct{}

func (s *server) requestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		b := make([]byte, 6)
		_, _ = rand.Read(b)
		id := hex.EncodeToString(b)
		w.Header().Set("X-Request-Id", id)
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, id)))
	})
}

func (s *server) recoverer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		defer func() {
			if v := recover(); v != nil {
				log.Printf("panic %s %s: %v", r.Method, r.URL.Path, v)
				writeError(w, r, http.StatusInternalServerError, "internal", "internal error")
			}
		}()
		next.ServeHTTP(w, r)
	})
}

// cors answers browsers that call the API from another origin. Origins not in the list get no CORS headers.
func (s *server) cors(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && s.origins[origin] {
			h := w.Header()
			h.Set("Access-Control-Allow-Origin", origin)
			h.Add("Vary", "Origin")
			h.Set("Access-Control-Expose-Headers", "X-Request-Id")
			if r.Method == http.MethodOptions {
				h.Set("Access-Control-Allow-Methods", "GET, PUT, POST, DELETE, OPTIONS")
				h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
				h.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
		}
		next.ServeHTTP(w, r)
	})
}

/* ---------------------------------------------------------------- handlers */

func (s *server) info(w http.ResponseWriter, _ *http.Request) {
	out := map[string]any{"name": "cardpress", "version": s.Version, "db": s.DBDriver, "authRequired": s.Token != ""}
	if s.Chat != nil {
		out["agent"] = s.Chat.Agent()
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *server) state(w http.ResponseWriter, r *http.Request) {
	st, err := s.Studio.State(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, st)
}

func (s *server) putProfiles(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Profiles []json.RawMessage `json:"profiles"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := s.Studio.ReplaceProfiles(r.Context(), body.Profiles); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) putDesigns(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Designs map[string]json.RawMessage `json:"designs"`
	}
	if !decode(w, r, &body) {
		return
	}
	if body.Designs == nil {
		body.Designs = map[string]json.RawMessage{}
	}
	if err := s.Studio.ReplaceDesigns(r.Context(), body.Designs); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) putPreference(w http.ResponseWriter, r *http.Request) {
	var value json.RawMessage
	if !decode(w, r, &value) {
		return
	}
	if err := s.Studio.SetPreference(r.Context(), r.PathValue("key"), value); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) importLegacy(w http.ResponseWriter, r *http.Request) {
	var l service.Legacy
	if !decode(w, r, &l) {
		return
	}
	if err := s.Studio.ImportLegacy(r.Context(), l); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) listDrafts(w http.ResponseWriter, r *http.Request) {
	profileID := r.URL.Query().Get("profileId")
	if profileID == "" {
		writeError(w, r, http.StatusBadRequest, "invalid", "the profileId query parameter is required")
		return
	}
	list, err := s.Studio.ListDrafts(r.Context(), profileID)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"drafts": list})
}

func (s *server) getDraft(w http.ResponseWriter, r *http.Request) {
	d, err := s.Studio.GetDraft(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (s *server) createDraft(w http.ResponseWriter, r *http.Request) {
	var in service.DraftInput
	if !decode(w, r, &in) {
		return
	}
	d, err := s.Studio.CreateDraft(r.Context(), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, d)
}

func (s *server) updateDraft(w http.ResponseWriter, r *http.Request) {
	var in service.DraftInput
	if !decode(w, r, &in) {
		return
	}
	d, err := s.Studio.UpdateDraft(r.Context(), r.PathValue("id"), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}

func (s *server) deleteDraft(w http.ResponseWriter, r *http.Request) {
	if err := s.Studio.DeleteDraft(r.Context(), r.PathValue("id")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// settingsProfile is the brand a settings request is about: the one in the path, or for the older routes without one, the
// brand the environment credentials belong to (the first brand).
func (s *server) settingsProfile(w http.ResponseWriter, r *http.Request) (string, bool) {
	if id := r.PathValue("id"); id != "" {
		return id, true
	}
	id, err := s.Settings.EnvProfile(r.Context())
	if err != nil {
		fail(w, r, err)
		return "", false
	}
	if id == "" {
		fail(w, r, service.ErrNotFound)
		return "", false
	}
	return id, true
}

func (s *server) getSettings(w http.ResponseWriter, r *http.Request) {
	pid, ok := s.settingsProfile(w, r)
	if !ok {
		return
	}
	v, err := s.Settings.View(r.Context(), pid)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) getNetwork(w http.ResponseWriter, r *http.Request) {
	pid, ok := s.settingsProfile(w, r)
	if !ok {
		return
	}
	v, err := s.Settings.Network(r.Context(), pid, r.PathValue("network"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

// putNetwork changes some fields: {"fields": {"accessToken": "...", "clientId": null, "authorUrn": ""}}.
// A missing or null field is left alone; an empty string removes it.
func (s *server) putNetwork(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Fields map[string]*string `json:"fields"`
	}
	if !decode(w, r, &body) {
		return
	}
	pid, ok := s.settingsProfile(w, r)
	if !ok {
		return
	}
	v, err := s.Settings.Put(r.Context(), pid, r.PathValue("network"), body.Fields)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) testNetwork(w http.ResponseWriter, r *http.Request) {
	pid, ok := s.settingsProfile(w, r)
	if !ok {
		return
	}
	res, err := s.Settings.Test(r.Context(), pid, r.PathValue("network"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// ---- brands ----

func (s *server) createProfile(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if !decode(w, r, &raw) {
		return
	}
	if err := s.Studio.CreateProfile(r.Context(), raw); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusCreated)
}

func (s *server) saveProfile(w http.ResponseWriter, r *http.Request) {
	var raw json.RawMessage
	if !decode(w, r, &raw) {
		return
	}
	if err := s.Studio.SaveProfile(r.Context(), r.PathValue("id"), raw); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) orderProfiles(w http.ResponseWriter, r *http.Request) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if !decode(w, r, &body) {
		return
	}
	if err := s.Studio.ReorderProfiles(r.Context(), body.IDs); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) archiveProfile(w http.ResponseWriter, r *http.Request) {
	res, err := s.Studio.ArchiveProfile(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *server) restoreProfile(w http.ResponseWriter, r *http.Request) {
	if err := s.Studio.RestoreProfile(r.Context(), r.PathValue("id")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) deleteProfile(w http.ResponseWriter, r *http.Request) {
	if err := s.Studio.DeleteProfile(r.Context(), r.PathValue("id")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// mcpAudit lists what outside agents did through MCP, newest first.
func (s *server) mcpAudit(w http.ResponseWriter, r *http.Request) {
	if s.Audit == nil {
		writeJSON(w, http.StatusOK, map[string]any{"entries": []any{}, "enabled": false})
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	entries, err := s.Audit.List(r.Context(), limit)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"entries": entries, "enabled": true})
}

/* ---------------------------------------------------------------- chat */

func (s *server) startConversation(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ProfileID string `json:"profileId"`
		URL       string `json:"url"`
		Text      string `json:"text"`
	}
	if !decode(w, r, &body) {
		return
	}
	v, err := s.Chat.Start(r.Context(), body.ProfileID, body.URL, body.Text)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, v)
}

func (s *server) listConversations(w http.ResponseWriter, r *http.Request) {
	profileID := r.URL.Query().Get("profileId")
	if profileID == "" {
		writeError(w, r, http.StatusBadRequest, "invalid", "the profileId query parameter is required")
		return
	}
	list, err := s.Chat.List(r.Context(), profileID)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"conversations": list, "agent": s.Chat.Agent()})
}

func (s *server) getConversation(w http.ResponseWriter, r *http.Request) {
	v, err := s.Chat.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

func (s *server) deleteConversation(w http.ResponseWriter, r *http.Request) {
	if err := s.Chat.Delete(r.Context(), r.PathValue("id")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// sendMessage answers as a stream of server-sent events: "user" (the stored message), "delta" (text as it is written),
// "proposal", "message" (the stored reply), then "done"; or "error". A problem found before anything is written is a
// normal JSON error with a status code.
func (s *server) sendMessage(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Content string `json:"content"`
	}
	if !decode(w, r, &body) {
		return
	}
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, r, http.StatusInternalServerError, "internal", "streaming is not supported here")
		return
	}
	started := false
	send := func(name string, data any) {
		if !started {
			h := w.Header()
			h.Set("Content-Type", "text/event-stream")
			h.Set("Cache-Control", "no-store")
			h.Set("X-Accel-Buffering", "no") // proxies must not hold the stream back
			w.WriteHeader(http.StatusOK)
			started = true
		}
		b, _ := json.Marshal(data)
		fmt.Fprintf(w, "event: %s\ndata: %s\n\n", name, b)
		flusher.Flush()
	}
	err := s.Chat.Send(r.Context(), r.PathValue("id"), body.Content, func(e service.ChatEvent) { send(e.Name, e.Data) })
	if err == nil {
		send("done", map[string]any{})
		return
	}
	var agentErr *service.AgentError
	switch {
	case errors.As(err, &agentErr):
		if !started {
			writeError(w, r, http.StatusBadGateway, "agent_error", agentErr.Msg)
			return
		}
		send("error", map[string]string{"code": "agent_error", "message": agentErr.Msg})
	case !started:
		fail(w, r, err)
	default:
		log.Printf("chat stream: %v", err)
		send("error", map[string]string{"code": "internal", "message": "Something went wrong while writing the reply."})
	}
}

// decideProposal records a person's answer. Approving does not save or publish anything: the browser applies the content
// to a draft and reports which one.
func (s *server) decideProposal(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Status  string                `json:"status"`
		DraftID string                `json:"draftId"`
		Edited  *service.ProposalEdit `json:"edited"`
	}
	if !decode(w, r, &body) {
		return
	}
	v, err := s.Chat.Decide(r.Context(), r.PathValue("id"), service.Decision{Status: body.Status, DraftID: body.DraftID, Edited: body.Edited})
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, v)
}

/* ---------------------------------------------------------------- publishing */

// run starts a claimed job in the background, so the request returns at once and the publish is not cut short if the
// browser goes away. The caller polls the job.
func (s *server) run(j service.Job) {
	if j.Status != service.JobPublishing {
		return
	}
	s.Publishing.Go(func() { s.Publishing.Execute(context.WithoutCancel(context.Background()), j.ID) })
}

// createJob takes a multipart form: "meta" (JSON) and "image" (the PNG). With no scheduledAt the post goes out now.
func (s *server) createJob(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := r.ParseMultipartForm(8 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, r, http.StatusRequestEntityTooLarge, "too_large", "the request is too large")
		} else {
			writeError(w, r, http.StatusBadRequest, "bad_form", "expected a multipart form with a meta field and an image file")
		}
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck
	var meta struct {
		ProfileID   string   `json:"profileId"`
		DraftID     string   `json:"draftId"`
		Body        string   `json:"body"`
		Hashtags    []string `json:"hashtags"`
		AltText     string   `json:"altText"`
		ScheduledAt string   `json:"scheduledAt"`
		Timezone    string   `json:"timezone"`
	}
	if err := json.Unmarshal([]byte(r.FormValue("meta")), &meta); err != nil {
		writeError(w, r, http.StatusBadRequest, "bad_json", "the meta field is not valid JSON")
		return
	}
	file, _, err := r.FormFile("image")
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid", "the image file is missing")
		return
	}
	defer file.Close()
	img, err := io.ReadAll(io.LimitReader(file, 11<<20))
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid", "the image could not be read")
		return
	}
	in := service.JobInput{ProfileID: meta.ProfileID, DraftID: meta.DraftID, Body: meta.Body, Hashtags: meta.Hashtags, AltText: meta.AltText, Image: img, Timezone: meta.Timezone}
	if meta.ScheduledAt != "" {
		at, err := time.Parse(time.RFC3339, meta.ScheduledAt)
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid", "scheduledAt must be an RFC 3339 time such as 2026-12-01T09:30:00Z")
			return
		}
		in.ScheduledAt = &at
	}
	j, err := s.Publishing.Create(r.Context(), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	s.run(j)
	writeJSON(w, http.StatusCreated, j)
}

func (s *server) listJobs(w http.ResponseWriter, r *http.Request) {
	profileID := r.URL.Query().Get("profileId")
	var (
		jobs []service.Job
		err  error
	)
	switch {
	case r.URL.Query().Get("scope") == "all":
		jobs, err = s.Publishing.ListAll(r.Context())
	case profileID == "":
		writeError(w, r, http.StatusBadRequest, "invalid", "the profileId query parameter is required (or scope=all for every brand)")
		return
	default:
		jobs, err = s.Publishing.List(r.Context(), profileID)
	}
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"jobs": jobs})
}

func (s *server) library(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	page, err := s.Library.List(r.Context(), service.LibraryQuery{
		ProfileID: q.Get("profileId"), All: q.Get("scope") == "all", Kind: q.Get("kind"), Status: q.Get("status"),
		Q: q.Get("q"), Before: q.Get("before"), Limit: limit,
	})
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *server) getJob(w http.ResponseWriter, r *http.Request) {
	j, err := s.Publishing.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

func (s *server) jobAttempts(w http.ResponseWriter, r *http.Request) {
	a, err := s.Publishing.Attempts(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"attempts": a})
}

func (s *server) jobImage(w http.ResponseWriter, r *http.Request) {
	b, err := s.Publishing.Image(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	w.Header().Set("Content-Type", "image/png")
	w.Header().Set("Cache-Control", "private, max-age=300")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	_, _ = w.Write(b)
}

func (s *server) publishNow(w http.ResponseWriter, r *http.Request) {
	var body struct {
		AcceptDuplicate bool `json:"acceptDuplicate"`
	}
	if r.ContentLength != 0 && !decode(w, r, &body) {
		return
	}
	j, err := s.Publishing.PublishNow(r.Context(), r.PathValue("id"), body.AcceptDuplicate)
	if err != nil {
		fail(w, r, err)
		return
	}
	s.run(j)
	writeJSON(w, http.StatusAccepted, j)
}

func (s *server) rescheduleJob(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ScheduledAt string `json:"scheduledAt"`
		Timezone    string `json:"timezone"`
	}
	if !decode(w, r, &body) {
		return
	}
	at, err := time.Parse(time.RFC3339, body.ScheduledAt)
	if err != nil {
		writeError(w, r, http.StatusBadRequest, "invalid", "scheduledAt must be an RFC 3339 time such as 2026-12-01T09:30:00Z")
		return
	}
	j, err := s.Publishing.Reschedule(r.Context(), r.PathValue("id"), at, body.Timezone)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

func (s *server) cancelJob(w http.ResponseWriter, r *http.Request) {
	j, err := s.Publishing.Cancel(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, j)
}

func (s *server) deleteJob(w http.ResponseWriter, r *http.Request) {
	if err := s.Publishing.Delete(r.Context(), r.PathValue("id")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

/* ---------------------------------------------------------------- helpers */

func decode(w http.ResponseWriter, r *http.Request, v any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)
	if err := json.NewDecoder(r.Body).Decode(v); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, r, http.StatusRequestEntityTooLarge, "too_large", "request body is too large")
		} else {
			writeError(w, r, http.StatusBadRequest, "bad_json", "the request body is not valid JSON")
		}
		return false
	}
	return true
}

func fail(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, service.ErrInvalid):
		writeError(w, r, http.StatusBadRequest, "invalid", service.UserMessage(err))
	case errors.Is(err, service.ErrSecretsUnavailable):
		writeError(w, r, http.StatusConflict, "no_secret_key", err.Error())
	case errors.Is(err, service.ErrUnsupported):
		writeError(w, r, http.StatusNotImplemented, "not_supported", "this is not supported for that network yet")
	case errors.Is(err, service.ErrNotFound):
		writeError(w, r, http.StatusNotFound, "not_found", "not found")
	case errors.Is(err, service.ErrConflict):
		writeError(w, r, http.StatusConflict, "conflict", service.UserMessage(err))
	default:
		log.Printf("%s %s: %v", r.Method, r.URL.Path, err)
		writeError(w, r, http.StatusInternalServerError, "internal", "internal error")
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, r *http.Request, status int, code, msg string) {
	id, _ := r.Context().Value(ctxKey{}).(string)
	writeJSON(w, status, map[string]any{"error": map[string]string{"code": code, "message": msg}, "requestId": id})
}

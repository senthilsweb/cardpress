package api

import (
	"context"
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/senthilsweb/cardpress/internal/service"
	"github.com/senthilsweb/cardpress/internal/telemetry"
)

// Accounts is the part of the accounts service the HTTP API needs. With none, the API works as it did before accounts
// existed (the bearer token alone, or nothing on localhost).
type Accounts interface {
	Count(ctx context.Context) (int, error)
	SignupOpen(ctx context.Context) bool
	Signup(ctx context.Context, in service.SignupInput) (service.User, error)
	StartSession(ctx context.Context, userID string) (string, error)
	Login(ctx context.Context, email, password, addr string) (service.User, string, error)
	Session(ctx context.Context, token string, use bool) (service.User, service.SessionTimes, error)
	SessionLimits(ctx context.Context) (idle, max time.Duration)
	Security(ctx context.Context) (service.SecuritySettings, bool)
	SecurityDefaults() service.SecuritySettings
	SetSecurity(ctx context.Context, s service.SecuritySettings) error
	ResetSecurity(ctx context.Context) error
	ActiveSessions(ctx context.Context) (int, error)
	SignOutEveryone(ctx context.Context, keepToken string) (int, error)
	AllowSignup(addr string) bool
	Logout(ctx context.Context, token string) error
	Get(ctx context.Context, id string) (service.User, error)
	UpdateProfile(ctx context.Context, id string, in service.ProfileInput) (service.User, error)
	ChangePassword(ctx context.Context, id, current, next, keepToken string) error
	List(ctx context.Context) ([]service.User, error)
	Add(ctx context.Context, in service.AdminCreateInput) (service.User, error)
	SetRole(ctx context.Context, id, role string) (service.User, error)
	SetStatus(ctx context.Context, id, status string) (service.User, error)
	SetPassword(ctx context.Context, id, password string) error
	CreateKey(ctx context.Context, userID, name, scope string) (service.APIKey, string, error)
	Keys(ctx context.Context, userID string) ([]service.APIKey, error)
	RevokeKey(ctx context.Context, userID, keyID string) error
	AuthenticateKey(ctx context.Context, secret string) (service.User, string, string, error)
}

const cookieName = "cardpress_session"

// secureCookieName is used over HTTPS: a browser accepts the "__Host-" prefix only for a secure cookie of this very host,
// so nothing on a sibling domain or a plain page can set it.
const secureCookieName = "__Host-" + cookieName

// backgroundHeader marks a request a screen makes by itself. It is answered, but does not count as the person using
// the app, so an open tab does not stay signed in for ever.
const backgroundHeader = "X-CardPress-Background"

func overHTTPS(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

// sessionToken is the session cookie's value, or "". Over HTTPS only the prefixed cookie is read.
func sessionToken(r *http.Request) string {
	name := cookieName
	if overHTTPS(r) {
		name = secureCookieName
	}
	if c, err := r.Cookie(name); err == nil {
		return c.Value
	}
	return ""
}

// byItself reports a request that does not count as use of the session.
func byItself(r *http.Request) bool {
	return r.Header.Get(backgroundHeader) != "" || (r.Method == http.MethodGet && (r.URL.Path == prefix+"/events" || r.URL.Path == prefix+"/auth/session"))
}

// scope says what a route names, so the one place that checks access knows which brand the request is about.
type scope int

const (
	scopeOpen         scope = iota // no sign-in needed (info, sign-in, sign-up)
	scopeAny                       // any signed-in person
	scopeAdmin                     // administrators only
	scopeBrandQuery                // ?profileId= names the brand (empty: across the caller's own brands)
	scopeBrandPath                 // {id} is a brand
	scopeDraft                     // {id} is a draft
	scopeJob                       // {id} is a post (a publish job)
	scopeConversation              // {id} is a conversation
	scopeProposal                  // {id} is a proposal
	scopeBrandBody                 // the handler checks the brand it reads from the request body
)

// rule is who may call a route: the scope it is about, and the permission a role must grant.
type rule struct {
	scope scope
	perm  service.Perm
}

// routeDef is one route of the API with its rule. The table is the single list of routes, so a route cannot be added
// without saying who may call it, and the access tests walk it.
type routeDef struct {
	method, path string
	rule         rule
	handler      http.HandlerFunc
}

// add registers a route behind its access rule.
func (s *server) add(mux *http.ServeMux, d routeDef) {
	if s.Accounts == nil && strings.HasPrefix(d.path, "/users") {
		d.handler = s.off
	}
	mux.HandleFunc(d.method+" "+prefix+d.path, func(w http.ResponseWriter, r *http.Request) {
		telemetry.SetRoute(r.Context(), prefix+d.path)
		if s.Accounts == nil || d.rule.scope == scopeOpen { // no accounts: the bearer guard in front did the work
			d.handler(w, r)
			return
		}
		p, ok := principalOf(r)
		if !ok {
			s.notSignedIn(w, r)
			return
		}
		if !s.authorize(w, r, p, d.rule) {
			return
		}
		d.handler(w, r)
	})
}

func principalOf(r *http.Request) (service.Principal, bool) {
	return service.PrincipalFrom(r.Context())
}

// notSignedIn answers a request with no valid sign-in. With no accounts yet it says setup is needed, so the app can show
// the first-run screen rather than a sign-in that cannot succeed.
func (s *server) notSignedIn(w http.ResponseWriter, r *http.Request) {
	if n, err := s.Accounts.Count(r.Context()); err == nil && n == 0 {
		writeError(w, r, http.StatusForbidden, "setup_required", "create the first account to start using CardPress")
		return
	}
	writeError(w, r, http.StatusUnauthorized, "unauthorized", "sign in to continue")
}

// authenticate finds who is calling: the machine token, or a signed-in person's session cookie. It never refuses a
// request itself; the route's rule decides what an unknown caller may do.
func (s *server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if s.Accounts != nil {
			var p *service.Principal
			got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			bearer := got != r.Header.Get("Authorization")
			switch {
			case bearer && s.Token != "" && subtle.ConstantTimeCompare([]byte(got), []byte(s.Token)) == 1:
				p = &service.Principal{Token: true}
			case bearer && strings.HasPrefix(got, service.KeyPrefix):
				// an API key: it acts as its person, within its scope
				if u, id, scope, err := s.Accounts.AuthenticateKey(r.Context(), got); err == nil {
					p = &service.Principal{User: &u, Key: id, Scope: scope}
				}
			default:
				if token := sessionToken(r); token != "" {
					if u, _, err := s.Accounts.Session(r.Context(), token, !byItself(r)); err == nil {
						p = &service.Principal{User: &u}
					}
				}
			}
			if p != nil {
				r = r.WithContext(service.WithPrincipal(r.Context(), *p))
			}
		}
		next.ServeHTTP(w, r)
	})
}

// canSee reports whether the caller may reach a brand: an admin any, anyone else only their own. A brand that does not
// exist is not visible to anyone but an admin, so one that is someone else's looks the same as one that is not there.
func (s *server) canSee(ctx context.Context, p service.Principal, brandID string) (bool, error) {
	if p.Admin() {
		return true, nil
	}
	owner, exists, err := s.Studio.BrandOwner(ctx, brandID)
	if err != nil {
		return false, err
	}
	return exists && owner != "" && owner == p.UserID(), nil
}

// authorize applies a route's rule. It answers 404 for something that is not the caller's (it does not say it exists) and
// 403 for something that is theirs but not allowed to their role.
func (s *server) authorize(w http.ResponseWriter, r *http.Request, p service.Principal, ru rule, named ...string) bool {
	ctx := r.Context()
	brand := ""
	if len(named) > 0 {
		brand = named[0]
	}
	switch ru.scope {
	case scopeAny, scopeBrandBody:
	case scopeAdmin:
		if !p.Admin() {
			fail(w, r, service.ErrForbidden)
			return false
		}
	case scopeBrandQuery:
		brand = r.URL.Query().Get("profileId")
	case scopeBrandPath:
		if len(named) == 0 {
			brand = r.PathValue("id")
		}
	case scopeDraft:
		d, err := s.Studio.GetDraft(ctx, r.PathValue("id"))
		if err != nil {
			fail(w, r, err)
			return false
		}
		brand = d.ProfileID
	case scopeJob:
		j, err := s.Publishing.Get(ctx, r.PathValue("id"))
		if err != nil {
			fail(w, r, err)
			return false
		}
		brand = j.ProfileID
	case scopeConversation:
		c, err := s.Chat.Get(ctx, r.PathValue("id"))
		if err != nil {
			fail(w, r, err)
			return false
		}
		brand = c.ProfileID
	case scopeProposal:
		b, err := s.Chat.ProposalBrand(ctx, r.PathValue("id"))
		if err != nil {
			fail(w, r, err)
			return false
		}
		brand = b
	}
	if brand != "" {
		ok, err := s.canSee(ctx, p, brand)
		if err != nil {
			fail(w, r, err)
			return false
		}
		if !ok {
			fail(w, r, service.ErrNotFound)
			return false
		}
	}
	if ru.perm != "" && !p.Can(ru.perm) {
		writeError(w, r, http.StatusForbidden, "forbidden", "your role does not allow this")
		return false
	}
	return true
}

// requireBrand is the check for a route whose brand is in the request body: the same rule, applied by the handler once
// it has read it.
func (s *server) requireBrand(w http.ResponseWriter, r *http.Request, brandID string, perm service.Perm) bool {
	if s.Accounts == nil {
		return true
	}
	p, ok := principalOf(r)
	if !ok {
		s.notSignedIn(w, r)
		return false
	}
	return s.authorize(w, r, p, rule{scope: scopeBrandPath, perm: perm}, brandID)
}

/* ------------------------------------------------------------------ sign-in, sign-up, sign-out */

type sessionBody struct {
	User  service.User   `json:"user"`
	Perms []service.Perm `json:"perms"`
}

func (s *server) session(w http.ResponseWriter, r *http.Request, u service.User, token string, status int) {
	_, longest := s.Accounts.SessionLimits(r.Context())
	setSessionCookie(w, r, token, int(longest.Seconds()))
	s.lookCookie(w, r, service.WithPrincipal(r.Context(), service.Principal{User: &u}))
	writeJSON(w, status, sessionBody{User: u, Perms: u.Perms()})
}

func (s *server) signup(w http.ResponseWriter, r *http.Request) {
	var in service.SignupInput
	if !decode(w, r, &in) {
		return
	}
	if !s.Accounts.AllowSignup(s.clientAddr(r)) {
		fail(w, r, service.ErrTooManyAttempts)
		return
	}
	u, err := s.Accounts.Signup(r.Context(), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	token, err := s.Accounts.StartSession(r.Context(), u.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	s.session(w, r, u, token, http.StatusCreated)
}

func (s *server) login(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	u, token, err := s.Accounts.Login(r.Context(), in.Email, in.Password, s.clientAddr(r))
	if err != nil {
		fail(w, r, err)
		return
	}
	s.session(w, r, u, token, http.StatusOK)
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	if token := sessionToken(r); token != "" {
		_ = s.Accounts.Logout(r.Context(), token)
	}
	setSessionCookie(w, r, "", -1)
	w.WriteHeader(http.StatusNoContent)
}

// me is the signed-in person. The machine token is shown as the administrator it acts as.
func (s *server) me(w http.ResponseWriter, r *http.Request) {
	p, _ := principalOf(r)
	if p.User == nil {
		u := service.User{FirstName: "API", LastName: "token", FullName: "API token", Roles: []string{service.RoleAdmin}, Status: "active"}
		writeJSON(w, http.StatusOK, sessionBody{User: u, Perms: u.Perms()})
		return
	}
	u, err := s.Accounts.Get(r.Context(), p.User.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionBody{User: u, Perms: u.Perms()})
}

func (s *server) updateMe(w http.ResponseWriter, r *http.Request) {
	p, ok := s.person(w, r)
	if !ok {
		return
	}
	var in service.ProfileInput
	if !decode(w, r, &in) {
		return
	}
	u, err := s.Accounts.UpdateProfile(r.Context(), p.ID, in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionBody{User: u, Perms: u.Perms()})
}

func (s *server) changePassword(w http.ResponseWriter, r *http.Request) {
	p, ok := s.person(w, r)
	if !ok {
		return
	}
	var in struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := s.Accounts.ChangePassword(r.Context(), p.ID, in.Current, in.New, sessionToken(r)); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// clientAddr is the address a request came from, for counting failed sign-ins. Behind a proxy it is read from the
// header the configuration names, which the proxy must set itself: whatever a visitor sends under that name is replaced.
func (s *server) clientAddr(r *http.Request) string {
	if s.ClientIPHeader != "" {
		values := r.Header.Values(s.ClientIPHeader)
		if len(values) > 0 { // a list grows at the end: the last is the one the nearest proxy wrote
			parts := strings.Split(values[len(values)-1], ",")
			if ip := net.ParseIP(strings.TrimSpace(parts[len(parts)-1])); ip != nil {
				return ip.String()
			}
		}
	}
	addr, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return addr
}

// setSessionCookie writes the session cookie, or removes it (maxAge below zero).
func setSessionCookie(w http.ResponseWriter, r *http.Request, token string, maxAge int) {
	name, secure := cookieName, overHTTPS(r)
	if secure {
		name = secureCookieName
	}
	http.SetCookie(w, &http.Cookie{Name: name, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: secure, MaxAge: maxAge})
}

// sessionTimes says how long the sign-in has left. Asked with GET it changes nothing; with POST the person is using the
// app, and the idle time has started again.
func (s *server) sessionTimes(w http.ResponseWriter, r *http.Request) {
	token := sessionToken(r)
	p, _ := principalOf(r)
	if s.Accounts == nil || p.User == nil || p.Key != "" || token == "" {
		s.off(w, r)
		return
	}
	_, t, err := s.Accounts.Session(r.Context(), token, r.Method == http.MethodPost)
	if err != nil {
		fail(w, r, err)
		return
	}
	idle, _ := s.Accounts.SessionLimits(r.Context())
	writeJSON(w, http.StatusOK, map[string]any{"remainingSeconds": int(t.Remaining.Seconds()), "limit": t.Limit, "idleSeconds": int(idle.Seconds())})
}

/* ------------------------------------------------------------------ people (administrators) */

func (s *server) listUsers(w http.ResponseWriter, r *http.Request) {
	us, err := s.Accounts.List(r.Context())
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": us})
}

func (s *server) addUser(w http.ResponseWriter, r *http.Request) {
	var in service.AdminCreateInput
	if !decode(w, r, &in) {
		return
	}
	u, err := s.Accounts.Add(r.Context(), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, u)
}

func (s *server) updateUser(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Role   *string `json:"role"`
		Status *string `json:"status"`
	}
	if !decode(w, r, &in) {
		return
	}
	id := r.PathValue("id")
	u, err := s.Accounts.Get(r.Context(), id)
	if err != nil {
		fail(w, r, err)
		return
	}
	if in.Role != nil {
		if u, err = s.Accounts.SetRole(r.Context(), id, *in.Role); err != nil {
			fail(w, r, err)
			return
		}
	}
	if in.Status != nil {
		if u, err = s.Accounts.SetStatus(r.Context(), id, *in.Status); err != nil {
			fail(w, r, err)
			return
		}
	}
	writeJSON(w, http.StatusOK, u)
}

func (s *server) setUserPassword(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Password string `json:"password"`
	}
	if !decode(w, r, &in) {
		return
	}
	if err := s.Accounts.SetPassword(r.Context(), r.PathValue("id"), in.Password); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// The sign-in routes exist in the table always (the table is the policy), but answer only when accounts are on.
func (s *server) off(w http.ResponseWriter, r *http.Request) {
	writeError(w, r, http.StatusNotFound, "not_found", "accounts are not enabled on this server")
}
func (s *server) signupOrNotConfigured(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.signup(w, r)
}
func (s *server) loginOrNotConfigured(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.login(w, r)
}
func (s *server) logoutOrNotConfigured(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.logout(w, r)
}
func (s *server) meOrNotConfigured(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.me(w, r)
}
func (s *server) updateMeOrNotConfigured(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.updateMe(w, r)
}
func (s *server) changePasswordOrNotConfigured(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.changePassword(w, r)
}

/* ------------------------------------------------------------------ API keys */

// session returns the signed-in person for routes that manage the account itself. An API key cannot: a leaked key must not
// be able to mint more keys, change the password or the details of the person it acts for.
func (s *server) person(w http.ResponseWriter, r *http.Request) (service.User, bool) {
	p, _ := principalOf(r)
	if p.User == nil || p.Key != "" {
		writeError(w, r, http.StatusForbidden, "forbidden", "sign in to the app to do this; an API key cannot")
		return service.User{}, false
	}
	return *p.User, true
}

func (s *server) listKeys(w http.ResponseWriter, r *http.Request) {
	u, ok := s.person(w, r)
	if !ok {
		return
	}
	ks, err := s.Accounts.Keys(r.Context(), u.ID)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"keys": ks, "scopes": service.KeyScopes})
}

// createKey makes a key. The secret is in this answer and nowhere else, ever.
func (s *server) createKey(w http.ResponseWriter, r *http.Request) {
	u, ok := s.person(w, r)
	if !ok {
		return
	}
	var in struct {
		Name  string `json:"name"`
		Scope string `json:"scope"`
	}
	if !decode(w, r, &in) {
		return
	}
	k, secret, err := s.Accounts.CreateKey(r.Context(), u.ID, in.Name, in.Scope)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"key": k, "secret": secret})
}

func (s *server) revokeKey(w http.ResponseWriter, r *http.Request) {
	u, ok := s.person(w, r)
	if !ok {
		return
	}
	if err := s.Accounts.RevokeKey(r.Context(), u.ID, r.PathValue("id")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (s *server) listKeysOrOff(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.listKeys(w, r)
}
func (s *server) createKeyOrOff(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.createKey(w, r)
}
func (s *server) revokeKeyOrOff(w http.ResponseWriter, r *http.Request) {
	if s.Accounts == nil {
		s.off(w, r)
		return
	}
	s.revokeKey(w, r)
}

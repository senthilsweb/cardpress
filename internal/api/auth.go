package api

import (
	"context"
	"crypto/subtle"
	"net"
	"net/http"
	"strings"

	"github.com/senthilsweb/cardpress/internal/service"
)

// Accounts is the part of the accounts service the HTTP API needs. With none, the API works as it did before accounts
// existed (the bearer token alone, or nothing on localhost).
type Accounts interface {
	Count(ctx context.Context) (int, error)
	SignupOpen(ctx context.Context) bool
	Signup(ctx context.Context, in service.SignupInput) (service.User, error)
	StartSession(ctx context.Context, userID string) (string, error)
	Login(ctx context.Context, email, password, addr string) (service.User, string, error)
	Authenticate(ctx context.Context, token string) (service.User, error)
	Logout(ctx context.Context, token string) error
	Get(ctx context.Context, id string) (service.User, error)
	UpdateProfile(ctx context.Context, id string, in service.ProfileInput) (service.User, error)
	ChangePassword(ctx context.Context, id, current, next, keepToken string) error
	List(ctx context.Context) ([]service.User, error)
	Add(ctx context.Context, in service.AdminCreateInput) (service.User, error)
	SetRole(ctx context.Context, id, role string) (service.User, error)
	SetStatus(ctx context.Context, id, status string) (service.User, error)
	SetPassword(ctx context.Context, id, password string) error
}

const cookieName = "cardpress_session"

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
			if got := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "); s.Token != "" && got != r.Header.Get("Authorization") &&
				subtle.ConstantTimeCompare([]byte(got), []byte(s.Token)) == 1 {
				p = &service.Principal{Token: true}
			} else if c, err := r.Cookie(cookieName); err == nil {
				if u, err := s.Accounts.Authenticate(r.Context(), c.Value); err == nil {
					p = &service.Principal{User: &u}
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
	http.SetCookie(w, &http.Cookie{
		Name: cookieName, Value: token, Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https"), MaxAge: 14 * 24 * 3600,
	})
	writeJSON(w, status, sessionBody{User: u, Perms: u.Perms()})
}

func (s *server) signup(w http.ResponseWriter, r *http.Request) {
	var in service.SignupInput
	if !decode(w, r, &in) {
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
	addr, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		addr = r.RemoteAddr
	}
	u, token, err := s.Accounts.Login(r.Context(), in.Email, in.Password, addr)
	if err != nil {
		fail(w, r, err)
		return
	}
	s.session(w, r, u, token, http.StatusOK)
}

func (s *server) logout(w http.ResponseWriter, r *http.Request) {
	if c, err := r.Cookie(cookieName); err == nil {
		_ = s.Accounts.Logout(r.Context(), c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: cookieName, Value: "", Path: "/", HttpOnly: true, SameSite: http.SameSiteLaxMode, MaxAge: -1})
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
	p, _ := principalOf(r)
	if p.User == nil {
		fail(w, r, service.ErrForbidden)
		return
	}
	var in service.ProfileInput
	if !decode(w, r, &in) {
		return
	}
	u, err := s.Accounts.UpdateProfile(r.Context(), p.User.ID, in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionBody{User: u, Perms: u.Perms()})
}

func (s *server) changePassword(w http.ResponseWriter, r *http.Request) {
	p, _ := principalOf(r)
	if p.User == nil {
		fail(w, r, service.ErrForbidden)
		return
	}
	var in struct {
		Current string `json:"current"`
		New     string `json:"new"`
	}
	if !decode(w, r, &in) {
		return
	}
	keep := ""
	if c, err := r.Cookie(cookieName); err == nil {
		keep = c.Value
	}
	if err := s.Accounts.ChangePassword(r.Context(), p.User.ID, in.Current, in.New, keep); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
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

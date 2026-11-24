package service

import "context"

// Roles. A person may hold several in the data model; what they may do is everything any of their roles allows.
const (
	RoleAdmin  = "admin"
	RoleEditor = "editor"
	RoleWriter = "writer"
)

// Perm is one thing a role may do.
type Perm string

const (
	PermWrite   Perm = "write"   // write and edit drafts, return an item to draft, delete a draft
	PermApprove Perm = "approve" // approve (and plan) an item
	PermPublish Perm = "publish" // send, schedule, publish a page, remove a record
	PermSocial  Perm = "social"  // connect and read social accounts
	PermUsers   Perm = "users"   // manage people and see everyone's work
)

var rolePerms = map[string][]Perm{
	RoleAdmin:  {PermWrite, PermApprove, PermPublish, PermSocial, PermUsers},
	RoleEditor: {PermWrite, PermApprove, PermPublish, PermSocial},
	RoleWriter: {PermWrite},
}

// ValidRole reports whether r is a role that exists.
func ValidRole(r string) bool { _, ok := rolePerms[r]; return ok }

// User is a person with an account. The full name is made from the first and last name.
type User struct {
	ID          string   `json:"id"`
	Email       string   `json:"email"`
	FirstName   string   `json:"firstName"`
	LastName    string   `json:"lastName"`
	FullName    string   `json:"fullName"`
	Phone       string   `json:"phone,omitempty"`
	BirthDate   string   `json:"birthDate,omitempty"`
	Roles       []string `json:"roles"`
	Status      string   `json:"status"`
	CreatedAt   string   `json:"createdAt"`
	LastLoginAt string   `json:"lastLoginAt,omitempty"`
}

// Can reports whether any of the user's roles allows p.
func (u User) Can(p Perm) bool {
	for _, r := range u.Roles {
		for _, allowed := range rolePerms[r] {
			if allowed == p {
				return true
			}
		}
	}
	return false
}

// IsAdmin reports whether the user is an administrator.
func (u User) IsAdmin() bool { return u.Can(PermUsers) }

// Perms lists what the user may do, for the screens to show or hide a control. The server checks again.
func (u User) Perms() []Perm {
	var out []Perm
	for _, p := range []Perm{PermWrite, PermApprove, PermPublish, PermSocial, PermUsers} {
		if u.Can(p) {
			out = append(out, p)
		}
	}
	return out
}

// Principal is who is acting. The zero value, or none in the context, is the system itself (the scheduler, a local MCP
// process, tests) and is not restricted. A Token principal is a machine using the bearer token, and acts as an admin.
type Principal struct {
	User  *User
	Token bool
}

type principalKey struct{}

// WithPrincipal returns a context that carries p.
func WithPrincipal(ctx context.Context, p Principal) context.Context {
	return context.WithValue(ctx, principalKey{}, p)
}

// PrincipalFrom returns the principal in ctx and whether there is one. With none, the caller is the system.
func PrincipalFrom(ctx context.Context) (Principal, bool) {
	p, ok := ctx.Value(principalKey{}).(Principal)
	return p, ok
}

// UserID is the acting person's id, or "" for the system and the token.
func (p Principal) UserID() string {
	if p.User != nil {
		return p.User.ID
	}
	return ""
}

// Admin reports whether the principal sees and may do everything.
func (p Principal) Admin() bool { return p.Token || (p.User != nil && p.User.IsAdmin()) }

// Can reports whether the principal may do p in general (a role check; whose work it is, is a separate one).
func (p Principal) Can(perm Perm) bool {
	if p.Token {
		return true
	}
	return p.User != nil && p.User.Can(perm)
}

// sees reports whether the principal may see a brand owned by owner. The system and admins see all.
func sees(ctx context.Context, owner string) bool {
	p, ok := PrincipalFrom(ctx)
	if !ok || p.Admin() {
		return true
	}
	return p.User != nil && p.User.ID == owner
}

// actorID is who to record as having done something: the person, or "" for the system and the token.
func actorID(ctx context.Context) string {
	p, _ := PrincipalFrom(ctx)
	return p.UserID()
}

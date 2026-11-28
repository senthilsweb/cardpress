package service

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/senthilsweb/cardpress/internal/store"
)

func init() { argonTime, argonMemory = 1, 8*1024 } // cheap hashes keep the tests quick; production settings are in accounts.go

func accountsDB(t *testing.T) *sql.DB {
	t.Helper()
	ctx := context.Background()
	db, err := store.Open(ctx, "file:"+filepath.Join(t.TempDir(), "t.db"), "")
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { db.Close() })
	if err := db.Migrate(ctx); err != nil {
		t.Fatal(err)
	}
	return db.DB
}

func newAccounts(t *testing.T, o AccountsOptions) (*Accounts, *sql.DB) {
	db := accountsDB(t)
	return NewAccounts(db, o), db
}

func signup(email string) SignupInput {
	return SignupInput{FirstName: "Ada", LastName: "Lovelace", Email: email, Password: "correct horse battery"}
}

func TestPasswordsAreHashedWithArgon2idAndChecked(t *testing.T) {
	h, err := hashPassword("a long passphrase here")
	if err != nil || !strings.HasPrefix(h, "$argon2id$v=19$m=") {
		t.Fatalf("%q %v", h, err)
	}
	if !checkPassword(h, "a long passphrase here") || checkPassword(h, "a long passphrase herf") || checkPassword("", "x") || checkPassword("$argon2id$garbage", "x") {
		t.Fatal("the check is wrong")
	}
	h2, _ := hashPassword("a long passphrase here")
	if h == h2 {
		t.Fatal("two hashes of one password must differ (a salt)")
	}
}

func TestSignupNeedsNamesEmailAndAPasswordAndTheRestIsOptional(t *testing.T) {
	a, _ := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	for name, mut := range map[string]func(*SignupInput){
		"no first name": func(i *SignupInput) { i.FirstName = " " },
		"no last name":  func(i *SignupInput) { i.LastName = "" },
		"bad email":     func(i *SignupInput) { i.Email = "ada@" },
		"no dot":        func(i *SignupInput) { i.Email = "ada@localhost" },
		"short pass":    func(i *SignupInput) { i.Password = "short" },
		"long pass":     func(i *SignupInput) { i.Password = strings.Repeat("a", 201) },
		"bad phone":     func(i *SignupInput) { i.Phone = "call me" },
		"future dob":    func(i *SignupInput) { i.BirthDate = "2999-01-01" },
		"not a date":    func(i *SignupInput) { i.BirthDate = "31/12/1990" },
		"impossible":    func(i *SignupInput) { i.BirthDate = "1990-02-30" },
		"very old":      func(i *SignupInput) { i.BirthDate = "1850-01-01" },
		"long name":     func(i *SignupInput) { i.FirstName = strings.Repeat("a", 61) },
	} {
		in := signup("ada@example.com")
		mut(&in)
		if _, err := a.Signup(ctx, in); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
	u, err := a.Signup(ctx, SignupInput{FirstName: "  Ada ", LastName: "Lovelace", Email: "  ADA@Example.com ", Password: "correct horse battery", Phone: "+44 (20) 7946-0000", BirthDate: "1990-12-10"})
	if err != nil || u.Email != "ada@example.com" || u.FullName != "Ada Lovelace" || u.Phone != "+44 (20) 7946-0000" || u.BirthDate != "1990-12-10" {
		t.Fatalf("%+v %v", u, err)
	}
	if js, _ := json.Marshal(u); strings.Contains(string(js), "password") || strings.Contains(string(js), "argon") {
		t.Fatalf("a user never carries its password: %s", js)
	}
}

func TestTheFirstAccountIsTheAdminAndAdoptsWhatExists(t *testing.T) {
	a, db := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	st := New(db)
	if err := st.ReplaceProfiles(ctx, []json.RawMessage{json.RawMessage(`{"id":"old","name":"Old"}`)}); err != nil {
		t.Fatal(err)
	}
	if err := st.SetPreference(ctx, PrefTheme, json.RawMessage(`"dark"`)); err != nil {
		t.Fatal(err)
	}
	if n, _ := a.Count(ctx); n != 0 || !a.SignupOpen(ctx) {
		t.Fatal("a new server has no accounts and its sign-up is open")
	}
	first, err := a.Signup(ctx, signup("first@example.com"))
	if err != nil || !first.IsAdmin() || len(first.Roles) != 1 || first.Roles[0] != RoleAdmin {
		t.Fatalf("%+v %v", first, err)
	}
	var owner string
	_ = db.QueryRow(`SELECT owner_id FROM profiles WHERE id = 'old'`).Scan(&owner)
	if owner != first.ID {
		t.Fatalf("the first account adopts the brands: %q", owner)
	}
	as := WithPrincipal(ctx, Principal{User: &first})
	if state, _ := st.State(as); string(state.Preferences[PrefTheme]) != `"dark"` || len(state.Profiles) != 1 {
		t.Fatalf("the first account inherits the settings: %+v", state)
	}
	second, err := a.Signup(ctx, signup("second@example.com"))
	if err != nil || second.IsAdmin() || second.Roles[0] != RoleEditor {
		t.Fatalf("a later account gets the default role, editor: %+v %v", second, err)
	}
	if _, err := a.Signup(ctx, signup("SECOND@example.com")); !errors.Is(err, ErrConflict) {
		t.Fatalf("an email is used once, in any case: %v", err)
	}
}

func TestTheDefaultRoleSignupClosedAndTheAdminEmailAreSettings(t *testing.T) {
	ctx := context.Background()
	a, _ := newAccounts(t, AccountsOptions{DefaultRole: RoleWriter})
	a.Signup(ctx, signup("boss@example.com"))
	if u, _ := a.Signup(ctx, signup("w@example.com")); u.Roles[0] != RoleWriter {
		t.Fatalf("%+v", u)
	}
	if b := NewAccounts(accountsDB(t), AccountsOptions{DefaultRole: RoleAdmin}); b.opts.DefaultRole != RoleEditor {
		t.Fatal("a sign-up can never be made an admin by the default role")
	}
	closed, _ := newAccounts(t, AccountsOptions{SignupClosed: true})
	if _, err := closed.Signup(ctx, signup("first@example.com")); err != nil {
		t.Fatalf("the first account is always allowed: %v", err)
	}
	if _, err := closed.Signup(ctx, signup("later@example.com")); !errors.Is(err, ErrForbidden) || closed.SignupOpen(ctx) {
		t.Fatalf("closed sign-up refuses the rest: %v", err)
	}
	if u, err := closed.Add(ctx, AdminCreateInput{SignupInput: signup("added@example.com"), Role: RoleWriter}); err != nil || u.Roles[0] != RoleWriter {
		t.Fatalf("an admin can still add people: %+v %v", u, err)
	}
	pinned, _ := newAccounts(t, AccountsOptions{AdminEmail: "me@example.com"})
	if _, err := pinned.Signup(ctx, signup("stranger@example.com")); !errors.Is(err, ErrForbidden) {
		t.Fatalf("only the named email may create the first account: %v", err)
	}
	if u, err := pinned.Signup(ctx, signup("ME@example.com")); err != nil || !u.IsAdmin() {
		t.Fatalf("%+v %v", u, err)
	}
}

func TestSigningInWrongPasswordsAreAlikeAndTooManyArePaused(t *testing.T) {
	a, _ := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	a.Signup(ctx, signup("ada@example.com"))
	if _, tok, err := a.Login(ctx, "ADA@example.com ", "correct horse battery", "1.2.3.4"); err != nil || tok == "" {
		t.Fatalf("%v", err)
	}
	for _, c := range [][2]string{{"ada@example.com", "wrong password!"}, {"nobody@example.com", "correct horse battery"}} {
		if _, _, err := a.Login(ctx, c[0], c[1], "9.9.9.9"); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("%v: %v", c, err)
		}
	}
	now := time.Now()
	a.now = func() time.Time { return now }
	for i := 0; i < failuresAllowed; i++ {
		a.Login(ctx, "ada@example.com", "nope nope nope", "5.5.5.5")
	}
	if _, _, err := a.Login(ctx, "ada@example.com", "correct horse battery", "5.5.5.5"); !errors.Is(err, ErrTooManyAttempts) {
		t.Fatalf("after five failures even the right password waits: %v", err)
	}
	a.now = func() time.Time { return now.Add(lockFor + time.Minute) }
	if _, _, err := a.Login(ctx, "ada@example.com", "correct horse battery", "5.5.5.5"); err != nil {
		t.Fatalf("the pause ends: %v", err)
	}
}

func TestSessionsAuthenticateExpireAndEndWhenAPersonIsDisabledOrChangesPassword(t *testing.T) {
	a, _ := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	admin, _ := a.Signup(ctx, signup("admin@example.com"))
	u, _ := a.Signup(ctx, signup("ada@example.com"))
	_, t1, _ := a.Login(ctx, "ada@example.com", "correct horse battery", "a")
	_, t2, _ := a.Login(ctx, "ada@example.com", "correct horse battery", "b")
	if got, err := a.Authenticate(ctx, t1); err != nil || got.ID != u.ID {
		t.Fatalf("%+v %v", got, err)
	}
	if _, err := a.Authenticate(ctx, "garbage"); !errors.Is(err, ErrUnauthorized) {
		t.Fatal(err)
	}
	// changing the password needs the old one, and ends the other sessions
	if err := a.ChangePassword(ctx, u.ID, "not my password", "another long passphrase", t1); !errors.Is(err, ErrInvalid) {
		t.Fatalf("%v", err)
	}
	if err := a.ChangePassword(ctx, u.ID, "correct horse battery", "short", t1); !errors.Is(err, ErrInvalid) {
		t.Fatalf("%v", err)
	}
	if err := a.ChangePassword(ctx, u.ID, "correct horse battery", "another long passphrase", t1); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Authenticate(ctx, t2); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("the other device is signed out")
	}
	if _, err := a.Authenticate(ctx, t1); err != nil {
		t.Fatal("this one stays")
	}
	if _, _, err := a.Login(ctx, "ada@example.com", "correct horse battery", "c"); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("the old password no longer works")
	}
	// disabling ends every session and blocks sign-in
	if _, err := a.SetStatus(ctx, u.ID, "disabled"); err != nil {
		t.Fatal(err)
	}
	if _, err := a.Authenticate(ctx, t1); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("a disabled person is signed out")
	}
	if _, _, err := a.Login(ctx, "ada@example.com", "another long passphrase", "d"); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("and cannot sign in")
	}
	// a session ends after its longest time
	_, t3, _ := a.Login(ctx, "admin@example.com", "correct horse battery", "e")
	a.now = func() time.Time { return time.Now().Add(DefaultSessionMax + time.Hour) }
	if _, err := a.Authenticate(ctx, t3); !errors.Is(err, ErrUnauthorized) {
		t.Fatal("expired")
	}
	_ = admin
}

func TestRolesAreSeparateRowsSoSeveralFitTheModelAndAPersonMayDoWhatAnyRoleAllows(t *testing.T) {
	a, db := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	a.Signup(ctx, signup("admin@example.com"))
	u, _ := a.Signup(ctx, signup("ada@example.com"))
	if !u.Can(PermApprove) || !u.Can(PermPublish) || u.IsAdmin() || u.Roles[0] != RoleEditor {
		t.Fatalf("a new person is an editor: %+v", u)
	}
	w, err := a.SetRole(ctx, u.ID, RoleWriter)
	if err != nil || w.Can(PermApprove) || w.Can(PermPublish) || w.Can(PermSocial) || !w.Can(PermWrite) {
		t.Fatalf("a writer only writes: %+v %v", w, err)
	}
	// the data model allows more than one role; the union of what they allow applies
	if _, err := db.Exec(`INSERT INTO user_roles (user_id, role) VALUES (?, 'editor')`, u.ID); err != nil {
		t.Fatal(err)
	}
	both, _ := a.Get(ctx, u.ID)
	if len(both.Roles) != 2 || !both.Can(PermApprove) || both.IsAdmin() {
		t.Fatalf("%+v", both)
	}
	if _, err := a.SetRole(ctx, u.ID, "emperor"); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	// the last administrator cannot be demoted or disabled
	adminID := ""
	all, _ := a.List(ctx)
	for _, x := range all {
		if x.Email == "admin@example.com" {
			adminID = x.ID
		}
	}
	if _, err := a.SetRole(ctx, adminID, RoleEditor); !errors.Is(err, ErrConflict) {
		t.Fatalf("%v", err)
	}
	if _, err := a.SetStatus(ctx, adminID, "disabled"); !errors.Is(err, ErrConflict) {
		t.Fatalf("%v", err)
	}
	if u, err := a.SetRole(ctx, u.ID, RoleAdmin); err != nil || !u.IsAdmin() {
		t.Fatalf("%+v %v", u, err)
	}
	if _, err := a.SetRole(ctx, adminID, RoleEditor); err != nil {
		t.Fatalf("with another admin the first may be demoted: %v", err)
	}
}

func TestAPersonEditsTheirOwnDetailsButNotTheirEmailOrRole(t *testing.T) {
	a, _ := newAccounts(t, AccountsOptions{})
	ctx := context.Background()
	a.Signup(ctx, signup("admin@example.com"))
	u, _ := a.Signup(ctx, signup("ada@example.com"))
	up, err := a.UpdateProfile(ctx, u.ID, ProfileInput{FirstName: "Augusta", LastName: "King", Phone: "", BirthDate: "1915-12-10"})
	if err != nil || up.FullName != "Augusta King" || up.Email != "ada@example.com" || up.Roles[0] != RoleEditor || up.BirthDate != "1915-12-10" {
		t.Fatalf("%+v %v", up, err)
	}
	if _, err := a.UpdateProfile(ctx, u.ID, ProfileInput{FirstName: "", LastName: "King"}); !errors.Is(err, ErrInvalid) {
		t.Fatal(err)
	}
	pw, err := a.ResetPasswordByEmail(ctx, "ADA@example.com")
	if err != nil || len(pw) < minPassword {
		t.Fatalf("%q %v", pw, err)
	}
	if _, _, err := a.Login(ctx, "ada@example.com", pw, "x"); err != nil {
		t.Fatalf("the reset password works: %v", err)
	}
	if _, err := a.ResetPasswordByEmail(ctx, "nobody@example.com"); !errors.Is(err, ErrNotFound) {
		t.Fatal(err)
	}
}

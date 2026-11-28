package api

import (
	"context"
	"net/http"
	"regexp"
)

// lookCookieName holds the colour theme and the mode, so a page has the right colours before the app has loaded. The page
// reads it, so it is not HttpOnly. It says nothing about the person and the server never reads it back.
const lookCookieName = "cardpress_look"

var lookWord = regexp.MustCompile(`^[a-z]{1,20}$`)

// lookCookie writes the colours of the person in ctx.
func (s *server) lookCookie(w http.ResponseWriter, r *http.Request, ctx context.Context) {
	palette, mode, err := s.Studio.Look(ctx)
	if err != nil {
		return // the first paint follows the system
	}
	if !lookWord.MatchString(palette) {
		palette = "parchment"
	}
	if !lookWord.MatchString(mode) {
		mode = "system"
	}
	http.SetCookie(w, &http.Cookie{Name: lookCookieName, Value: palette + "." + mode, Path: "/", SameSite: http.SameSiteLaxMode, Secure: overHTTPS(r), MaxAge: 365 * 24 * 3600})
}

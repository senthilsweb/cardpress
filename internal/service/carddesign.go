package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"strings"
	"unicode/utf8"
)

// CardDesignVersion is the shape of CardDesign that is stored in drafts.design_version.
const CardDesignVersion = 1

// CardDesign is what a card looks like: the same object the editor draws and the library draws again, so a design is
// never described twice. It is the strongly typed form of the editor's Design; the server refuses anything it could not
// render. An image is a data URL, or "asset:<id>" for a file of the brand's media
// library, which cannot be deleted while a design names it.
type CardDesign struct {
	SizeID      string `json:"sizeId"`
	Layout      string `json:"layout"`
	Background  string `json:"background"`
	PaletteID   string `json:"paletteId"`
	Seed        int    `json:"seed"`
	Eyebrow     string `json:"eyebrow"`
	Title       string `json:"title"`
	Subtitle    string `json:"subtitle"`
	Footer      string `json:"footer"`
	FooterLeft  string `json:"footerLeft"`
	Tag         string `json:"tag"`
	QuoteAuthor string `json:"quoteAuthor"`
	StatValue   string `json:"statValue"`
	// Signature is who a greeting is from, drawn by the greeting layout.
	Signature string `json:"signature,omitempty"`
	// NoOrnament leaves out the greeting layout\'s flourish.
	NoOrnament bool    `json:"noOrnament,omitempty"`
	TitleScale float64 `json:"titleScale"`
	Intensity  float64 `json:"intensity"`
	BottomFade float64 `json:"bottomFade"`
	ShowLogo   bool    `json:"showLogo"`
	ShowFooter bool    `json:"showFooter"`
	// An empty footer shows the brand's handle (right) or website (left), unless it was emptied on purpose.
	NoFooter     bool              `json:"noFooter,omitempty"`
	NoFooterLeft bool              `json:"noFooterLeft,omitempty"`
	Photos       []string          `json:"photos"`
	Screenshot   string            `json:"screenshot,omitempty"`
	BgImage      string            `json:"bgImage,omitempty"`
	Fonts        map[string]string `json:"fonts,omitempty"`

	// Caption is a leftover of older designs (captions now live in drafts). It is accepted and dropped.
	Caption json.RawMessage `json:"caption,omitempty"`
}

var (
	cardLayouts = map[string]bool{"hero": true, "center": true, "quote": true, "stat": true, "split": true, "cover": true, "greeting": true}
	fontRoles   = map[string]bool{"title": true, "body": true, "label": true, "logo": true, "stat": true, "script": true}
	idRe        = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$`)
	assetRefRe  = regexp.MustCompile(`^asset:[0-9a-f]{16}$`)
)

const (
	maxDesignImage  = 8 << 20
	maxDesignPhotos = 12
)

// emptied records that a footer was written: empty then means no text, not the brand's own.
func (d *CardDesign) emptied(field, text string) {
	switch field {
	case "footer":
		d.NoFooter = text == ""
	case "footerLeft":
		d.NoFooterLeft = text == ""
	}
}

// ParseCardDesign reads and checks a design. Unknown fields are refused, so a misspelt one is not silently lost.
func ParseCardDesign(raw []byte) (CardDesign, error) {
	var d CardDesign
	dec := json.NewDecoder(bytes.NewReader(raw))
	dec.DisallowUnknownFields()
	if err := dec.Decode(&d); err != nil {
		return d, invalid("design: %v", err)
	}
	d.Caption = nil
	if d.Photos == nil {
		d.Photos = []string{}
	}
	return d, d.validate()
}

func (d CardDesign) validate() error {
	if !cardLayouts[d.Layout] {
		return invalid("design: layout %q is not one of hero, center, quote, stat, split, cover, greeting", d.Layout)
	}
	for name, v := range map[string]string{"sizeId": d.SizeID, "background": d.Background, "paletteId": d.PaletteID} {
		if !idRe.MatchString(v) {
			return invalid("design: %s %q is not a valid id", name, v)
		}
	}
	for name, lim := range map[string]struct {
		v string
		n int
	}{
		"eyebrow": {d.Eyebrow, 200}, "title": {d.Title, 400}, "subtitle": {d.Subtitle, 600}, "footer": {d.Footer, 200},
		"footerLeft": {d.FooterLeft, 200}, "tag": {d.Tag, 100}, "quoteAuthor": {d.QuoteAuthor, 200}, "statValue": {d.StatValue, 60},
		"signature": {d.Signature, 200},
	} {
		if utf8.RuneCountInString(lim.v) > lim.n {
			return invalid("design: %s is limited to %d characters", name, lim.n)
		}
	}
	if d.Seed < 0 || d.Seed > 1_000_000_000 {
		return invalid("design: seed is out of range")
	}
	if d.TitleScale < 0.2 || d.TitleScale > 4 {
		return invalid("design: titleScale must be between 0.2 and 4")
	}
	for name, v := range map[string]float64{"intensity": d.Intensity, "bottomFade": d.BottomFade} {
		if v < 0 || v > 1 {
			return invalid("design: %s must be between 0 and 1", name)
		}
	}
	if len(d.Photos) > maxDesignPhotos {
		return invalid("design: at most %d photos", maxDesignPhotos)
	}
	for _, p := range append(append([]string{}, d.Photos...), d.Screenshot, d.BgImage) {
		if len(p) > maxDesignImage {
			return invalid("design: an image is larger than %d MB", maxDesignImage>>20)
		}
		if strings.HasPrefix(p, "asset:") && !assetRefRe.MatchString(p) {
			return invalid("design: %q does not name a library picture", cut(p, 40))
		}
	}
	for role, family := range d.Fonts {
		if !fontRoles[role] {
			return invalid("design: %q is not a font role", role)
		}
		if family == "" || utf8.RuneCountInString(family) > 80 {
			return invalid("design: the %s font must be a name of up to 80 characters", role)
		}
	}
	return nil
}

// normalizeDesign returns the stored form of a design the caller sent.
func normalizeDesign(raw json.RawMessage) (string, error) {
	d, err := ParseCardDesign(raw)
	if err != nil {
		return "", err
	}
	out, err := json.Marshal(d)
	if err != nil {
		return "", fmt.Errorf("design: %w", err)
	}
	return string(out), nil
}

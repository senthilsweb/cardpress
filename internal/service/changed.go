package service

// What a reply changed in an item, said by name, so the person can decide whether to keep it.

import (
	"encoding/json"
	"slices"
)

// cardWords are the words on a card, as they are stored and as they are named, in the order they are listed.
var cardWords = []struct{ stored, name string }{
	{StoredHeadline, Headline}, {"eyebrow", "eyebrow"}, {"subtitle", "subtitle"}, {"tag", "tag"},
	{"footer", "footer"}, {"footerLeft", "footerLeft"}, {"quoteAuthor", "quoteAuthor"},
	{"statValue", "statValue"}, {"signature", "signature"},
}

// changedFields names what differs between an item as a reply found it and as it is now.
func changedFields(was snapshot, now Draft) []string {
	var out []string
	add := func(name string, differs bool) {
		if differs {
			out = append(out, name)
		}
	}
	add("title", was.Title != now.Title)
	// the same words can differ in bold or italic, which is a change too
	add("body", !sameJSON(was.Doc, now.Doc))
	add("summary", was.Summary != now.Summary)
	a, b := map[string]any{}, map[string]any{}
	// a card that cannot be read counts as empty
	_ = json.Unmarshal(was.Design, &a)
	_ = json.Unmarshal(now.Design, &b)
	word := func(m map[string]any, key string) string { s, _ := m[key].(string); return s }
	for _, f := range cardWords {
		add(f.name, word(a, f.stored) != word(b, f.stored))
	}
	add("hashtags", !slices.Equal(was.Hashtags, now.Hashtags))
	add("altText", was.AltText != now.AltText)
	add("slug", was.Slug != now.Slug)
	add("audience", was.Audience != now.Audience)
	add("topic", was.Topic != now.Topic)
	add("unicodeStyles", was.UnicodeStyles != now.UnicodeStyles)
	return out
}

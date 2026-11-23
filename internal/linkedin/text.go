package linkedin

import "strings"

// reserved are the characters LinkedIn's post text format treats as markup (mentions, links, hashtags, formatting
// templates). Written literally they would be interpreted, so each gets a backslash.
const reserved = `|{}@[]()<>#\*_~`

// Escape makes plain text safe to send as post commentary: the published post reads exactly like the preview.
func Escape(s string) string {
	var b strings.Builder
	b.Grow(len(s) + 8)
	for _, r := range s {
		if strings.ContainsRune(reserved, r) {
			b.WriteByte('\\')
		}
		b.WriteRune(r)
	}
	return b.String()
}

// Commentary builds the text to send: the escaped body, then the hashtags as LinkedIn hashtag templates on a last
// line so they become real, clickable hashtags. Hashtags are letters, digits and underscores only (checked when a
// draft is saved); anything else is dropped rather than risk breaking the template.
func Commentary(body string, hashtags []string) string {
	out := Escape(strings.TrimSpace(body))
	var tags []string
	for _, h := range hashtags {
		h = strings.TrimPrefix(strings.TrimSpace(h), "#")
		if h == "" || strings.ContainsAny(h, " |{}\\\n") {
			continue
		}
		tags = append(tags, "{hashtag|\\#|"+strings.ReplaceAll(h, "_", `\_`)+"}")
	}
	if len(tags) > 0 {
		if out != "" {
			out += "\n\n"
		}
		out += strings.Join(tags, " ")
	}
	return out
}

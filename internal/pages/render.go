// Package pages serves the public page of an approved article or post: HTML rendered on the server, with the tags a search
// engine or a social network reads. It serves only what a person published, and sends no script.
package pages

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"html"
	"html/template"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

type mark struct {
	Type  string         `json:"type"`
	Attrs map[string]any `json:"attrs"`
}

type node struct {
	Type    string         `json:"type"`
	Text    string         `json:"text"`
	Attrs   map[string]any `json:"attrs"`
	Marks   []mark         `json:"marks"`
	Content []node         `json:"content"`
}

var langRe = regexp.MustCompile(`^[A-Za-z0-9+#._-]{1,30}$`)

// safeHref allows only addresses a reader can safely follow: web addresses and mail links.
func safeHref(raw string) (string, bool) {
	u, err := url.Parse(strings.TrimSpace(raw))
	if err != nil {
		return "", false
	}
	switch strings.ToLower(u.Scheme) {
	case "http", "https", "mailto":
		return u.String(), true
	}
	return "", false
}

type renderer struct {
	b       bytes.Buffer
	images  int
	imgURL  func(n int) string
	skipH1  string // a first heading that only repeats the page title is left out
	skipped bool
}

func (r *renderer) inline(nodes []node) {
	for _, n := range nodes {
		switch n.Type {
		case "hardBreak":
			r.b.WriteString("<br>")
		case "text":
			open, closing := "", ""
			var href string
			for _, m := range n.Marks {
				switch m.Type {
				case "bold":
					open, closing = open+"<strong>", "</strong>"+closing
				case "italic":
					open, closing = open+"<em>", "</em>"+closing
				case "underline":
					open, closing = open+"<u>", "</u>"+closing
				case "strike":
					open, closing = open+"<s>", "</s>"+closing
				case "code":
					open, closing = open+"<code>", "</code>"+closing
				case "link":
					if h, ok := safeHref(fmt.Sprint(m.Attrs["href"])); ok {
						href = h
					}
				}
			}
			if href != "" {
				open = `<a href="` + html.EscapeString(href) + `" rel="noopener noreferrer">` + open
				closing += "</a>"
			}
			r.b.WriteString(open + html.EscapeString(n.Text) + closing)
		default:
			r.inline(n.Content)
		}
	}
}

func text(n node) string {
	if n.Type == "text" {
		return n.Text
	}
	var s strings.Builder
	for _, c := range n.Content {
		s.WriteString(text(c))
	}
	return s.String()
}

func (r *renderer) blocks(nodes []node) {
	for _, n := range nodes {
		r.block(n)
	}
}

func (r *renderer) block(n node) {
	switch n.Type {
	case "paragraph":
		if strings.TrimSpace(text(n)) == "" {
			return
		}
		r.b.WriteString("<p>")
		r.inline(n.Content)
		r.b.WriteString("</p>\n")
	case "heading":
		if !r.skipped && n.Attrs["level"] == float64(1) && r.skipH1 != "" && strings.TrimSpace(text(n)) == r.skipH1 {
			r.skipped = true
			return
		}
		tag := "h2" // the page's own title is the h1, so a heading in the text starts at h2
		if n.Attrs["level"] == float64(3) {
			tag = "h3"
		}
		r.b.WriteString("<" + tag + ">")
		r.inline(n.Content)
		r.b.WriteString("</" + tag + ">\n")
	case "bulletList", "orderedList":
		tag := "ul"
		if n.Type == "orderedList" {
			tag = "ol"
			if s, ok := n.Attrs["start"].(float64); ok && s > 1 && s < 10000 {
				tag = `ol start="` + strconv.Itoa(int(s)) + `"`
			}
		}
		r.b.WriteString("<" + tag + ">\n")
		for _, li := range n.Content {
			r.b.WriteString("<li>")
			for _, c := range li.Content {
				if c.Type == "paragraph" {
					r.inline(c.Content)
				} else {
					r.block(c)
				}
			}
			r.b.WriteString("</li>\n")
		}
		r.b.WriteString("</" + strings.Fields(tag)[0] + ">\n")
	case "blockquote":
		r.b.WriteString("<blockquote>\n")
		r.blocks(n.Content)
		r.b.WriteString("</blockquote>\n")
	case "codeBlock":
		class := ""
		if l := fmt.Sprint(n.Attrs["language"]); n.Attrs["language"] != nil && langRe.MatchString(l) {
			class = ` class="language-` + html.EscapeString(l) + `"`
		}
		r.b.WriteString("<pre><code" + class + ">" + html.EscapeString(text(n)) + "</code></pre>\n")
	case "horizontalRule":
		r.b.WriteString("<hr>\n")
	case "image":
		r.images++
		if r.imgURL != nil {
			alt := html.EscapeString(fmt.Sprint(n.Attrs["alt"]))
			if n.Attrs["alt"] == nil {
				alt = ""
			}
			r.b.WriteString(`<figure><img src="` + html.EscapeString(r.imgURL(r.images)) + `" alt="` + alt + `" loading="lazy" decoding="async"></figure>` + "\n")
		}
	case "table":
		r.b.WriteString("<div class=\"table\"><table>\n")
		for _, row := range n.Content {
			r.b.WriteString("<tr>")
			for _, cell := range row.Content {
				tag := "td"
				if cell.Type == "tableHeader" {
					tag = "th"
				}
				r.b.WriteString("<" + tag + ">")
				for i, p := range cell.Content {
					if i > 0 {
						r.b.WriteString("<br>")
					}
					r.inline(p.Content)
				}
				r.b.WriteString("</" + tag + ">")
			}
			r.b.WriteString("</tr>\n")
		}
		r.b.WriteString("</table></div>\n")
	default:
		r.blocks(n.Content)
	}
}

// RenderDoc turns a saved document into safe HTML. Every piece of text is escaped, links are limited to web and mail
// addresses, and a picture becomes an <img> of its own address (imgURL(n) for the nth picture), never an inline data URL.
// skipTitle names a first heading that only repeats the page title. It also returns how many pictures the text holds.
func RenderDoc(doc json.RawMessage, skipTitle string, imgURL func(n int) string) (template.HTML, int) {
	var root node
	if json.Unmarshal(doc, &root) != nil {
		return "", 0
	}
	r := &renderer{imgURL: imgURL, skipH1: strings.TrimSpace(skipTitle)}
	r.blocks(root.Content)
	return template.HTML(r.b.String()), r.images //nolint:gosec // every piece above is escaped
}

// Picture returns the nth (1-based) picture in a document as bytes and its media type.
func Picture(doc json.RawMessage, n int) ([]byte, string, bool) {
	var root node
	if json.Unmarshal(doc, &root) != nil || n < 1 {
		return nil, "", false
	}
	seen := 0
	var find func([]node) ([]byte, string, bool)
	find = func(nodes []node) ([]byte, string, bool) {
		for _, c := range nodes {
			if c.Type == "image" {
				seen++
				if seen == n {
					src, _ := c.Attrs["src"].(string)
					return decodeDataURL(src)
				}
				continue
			}
			if b, m, ok := find(c.Content); ok {
				return b, m, true
			}
		}
		return nil, "", false
	}
	return find(root.Content)
}

var allowedPictures = map[string]bool{"image/png": true, "image/jpeg": true, "image/webp": true, "image/gif": true, "image/svg+xml": true}

func decodeDataURL(src string) ([]byte, string, bool) {
	head, body, ok := strings.Cut(src, ",")
	if !ok || !strings.HasPrefix(head, "data:") || !strings.HasSuffix(head, ";base64") {
		return nil, "", false
	}
	mime := strings.TrimSuffix(strings.TrimPrefix(head, "data:"), ";base64")
	if !allowedPictures[mime] {
		return nil, "", false
	}
	b, err := base64.StdEncoding.DecodeString(body)
	return b, mime, err == nil
}

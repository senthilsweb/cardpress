package source

import (
	"strings"

	"golang.org/x/net/html"
)

var skipTags = map[string]bool{
	"script": true, "style": true, "noscript": true, "template": true, "svg": true, "iframe": true, "canvas": true,
	"nav": true, "header": true, "footer": true, "aside": true, "form": true, "button": true, "select": true, "head": true,
}

var blockTags = map[string]bool{
	"p": true, "div": true, "section": true, "article": true, "main": true, "blockquote": true, "pre": true, "li": true, "ul": true, "ol": true,
	"h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true, "tr": true, "table": true, "figcaption": true, "dt": true, "dd": true, "br": true,
}

// ExtractText returns the page title and its readable text: paragraphs separated by blank lines, list items as "- ",
// headings as "## ". Scripts, menus, footers and forms are dropped. It prefers <article> or <main> when present.
func ExtractText(page []byte) (title, text string) {
	doc, err := html.Parse(strings.NewReader(string(page)))
	if err != nil {
		return "", ""
	}
	title = strings.TrimSpace(collapse(textOf(find(doc, "title"))))
	if title == "" {
		title = metaContent(doc, "og:title")
	}
	root := find(doc, "article")
	if root == nil || len(textOf(root)) < 200 {
		if m := find(doc, "main"); m != nil && len(textOf(m)) >= 200 {
			root = m
		} else {
			root = find(doc, "body")
		}
	}
	if root == nil {
		root = doc
	}
	var blocks []string
	var cur strings.Builder
	flush := func(prefix string) {
		if s := strings.TrimSpace(collapse(cur.String())); s != "" {
			blocks = append(blocks, prefix+s)
		}
		cur.Reset()
	}
	var walk func(n *html.Node)
	walk = func(n *html.Node) {
		switch n.Type {
		case html.TextNode:
			cur.WriteString(n.Data)
			return
		case html.ElementNode:
			if skipTags[n.Data] {
				return
			}
			for _, a := range n.Attr {
				if a.Key == "hidden" || (a.Key == "aria-hidden" && a.Val == "true") {
					return
				}
			}
		}
		tag := n.Data
		isBlock := n.Type == html.ElementNode && blockTags[tag]
		if isBlock {
			flush("")
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
		if isBlock {
			prefix := ""
			switch tag {
			case "li":
				prefix = "- "
			case "h1":
				prefix = "# "
			case "h2", "h3", "h4", "h5", "h6":
				prefix = "## "
			}
			flush(prefix)
		}
	}
	walk(root)
	if title == "" {
		for _, b := range blocks {
			if strings.HasPrefix(b, "# ") {
				title = strings.TrimPrefix(b, "# ")
				break
			}
		}
	}
	return title, strings.Join(blocks, "\n\n")
}

func find(n *html.Node, tag string) *html.Node {
	if n.Type == html.ElementNode && n.Data == tag {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if f := find(c, tag); f != nil {
			return f
		}
	}
	return nil
}

func textOf(n *html.Node) string {
	if n == nil {
		return ""
	}
	var b strings.Builder
	var walk func(*html.Node)
	walk = func(x *html.Node) {
		if x.Type == html.ElementNode && skipTags[x.Data] {
			return
		}
		if x.Type == html.TextNode {
			b.WriteString(x.Data)
		}
		for c := x.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(n)
	return b.String()
}

func metaContent(n *html.Node, property string) string {
	if n.Type == html.ElementNode && n.Data == "meta" {
		var p, c string
		for _, a := range n.Attr {
			switch a.Key {
			case "property", "name":
				p = a.Val
			case "content":
				c = a.Val
			}
		}
		if p == property {
			return strings.TrimSpace(c)
		}
	}
	for ch := n.FirstChild; ch != nil; ch = ch.NextSibling {
		if v := metaContent(ch, property); v != "" {
			return v
		}
	}
	return ""
}

// collapse folds runs of whitespace (including non-breaking spaces) into single spaces.
func collapse(s string) string {
	return strings.Join(strings.Fields(strings.ReplaceAll(s, " ", " ")), " ")
}

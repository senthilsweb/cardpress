package service

import (
	"context"
	"encoding/json"
	"strconv"
	"strings"
)

// DraftText is a draft's text as plain text: paragraphs separated by a blank line, "- " bullets, numbered lists. It is
// what an outside reader (such as an MCP client) wants instead of the editor's document format.
func DraftText(doc json.RawMessage) string {
	var root docNode
	if json.Unmarshal(doc, &root) != nil {
		return ""
	}
	return strings.TrimSpace(strings.Join(root.blocks(""), "\n\n"))
}

type docNode struct {
	Type    string         `json:"type"`
	Text    string         `json:"text"`
	Attrs   map[string]any `json:"attrs"`
	Content []docNode      `json:"content"`
}

func (n docNode) inline() string {
	var b strings.Builder
	for _, c := range n.Content {
		switch c.Type {
		case "text":
			b.WriteString(c.Text)
		case "hardBreak":
			b.WriteString("\n")
		default:
			b.WriteString(c.inline())
		}
	}
	return b.String()
}

// blocks returns one string per block; list items stay together as lines.
func (n docNode) blocks(indent string) []string {
	var out []string
	for _, c := range n.Content {
		switch c.Type {
		case "bulletList", "orderedList":
			var lines []string
			start := 1
			if v, ok := c.Attrs["start"].(float64); ok {
				start = int(v)
			}
			for i, item := range c.Content {
				marker := "- "
				if c.Type == "orderedList" {
					marker = strconv.Itoa(start+i) + ". "
				}
				parts := item.blocks(indent + "  ")
				if len(parts) == 0 {
					continue
				}
				lines = append(lines, indent+marker+strings.TrimLeft(parts[0], " "))
				lines = append(lines, parts[1:]...)
			}
			if len(lines) > 0 {
				out = append(out, strings.Join(lines, "\n"))
			}
		case "blockquote":
			out = append(out, c.blocks(indent)...)
		case "heading":
			if t := strings.TrimSpace(c.inline()); t != "" {
				level := 2
				if v, ok := c.Attrs["level"].(float64); ok {
					level = int(v)
				}
				out = append(out, strings.Repeat("#", level)+" "+t)
			}
		default:
			if t := strings.TrimSpace(c.inline()); t != "" {
				out = append(out, indent+t)
			}
		}
	}
	return out
}

// PaletteInfo is a colour set a card can use.
type PaletteInfo struct {
	ID     string `json:"id"`
	Name   string `json:"name"`
	Base   string `json:"base"`
	Accent string `json:"accent"`
	Text   string `json:"text"`
}

// ProfileInfo is a profile without its images, which are large and not needed to read about it.
type ProfileInfo struct {
	ID          string        `json:"id"`
	Name        string        `json:"name"`
	DisplayName string        `json:"displayName"`
	Handle      string        `json:"handle"`
	Website     string        `json:"website"`
	Palettes    []PaletteInfo `json:"palettes"`
}

// Profiles lists the saved profiles in summary.
func (s *Studio) Profiles(ctx context.Context) ([]ProfileInfo, error) {
	st, err := s.State(ctx)
	if err != nil {
		return nil, err
	}
	out := []ProfileInfo{}
	for _, raw := range st.Profiles {
		var p ProfileInfo
		if json.Unmarshal(raw, &p) == nil && p.ID != "" {
			if p.Palettes == nil {
				p.Palettes = []PaletteInfo{}
			}
			out = append(out, p)
		}
	}
	return out, nil
}

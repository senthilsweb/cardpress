// Package cma is the adapter that connects the chat to the Claude Managed Agents defined in the cardpress-agent
// repository.
//
// One managed session is kept per conversation. The agents work in the studio through this server's MCP endpoint, as the
// person whose key is in the session's vault: they write drafts and the words on cards themselves. The adapter sends each
// message with the context the two projects agreed on (their contract), has first drafts graded against a rubric, reports
// what is being done, and reads what the session has cost. It executes nothing on the agents' behalf and cannot publish.
package cma

import (
	"fmt"
	"strings"

	"github.com/senthilsweb/cardpress/internal/agent"
)

// blockNames are the tags only this server may write in front of a person's message.
var blockNames = []string{"studio", "notes", "card", "changes", "history", "source"}

// escape stops text that came from elsewhere from closing a block or opening one.
func escape(s string) string {
	for _, name := range blockNames {
		for _, tag := range []string{"</" + name, "<" + name} {
			for _, t := range []string{tag, strings.ToUpper(tag)} {
				s = strings.ReplaceAll(s, t, "<\\"+t[1:])
			}
		}
	}
	return s
}

func attr(s string) string {
	s = strings.Map(func(r rune) rune {
		if r < 0x20 || r == '"' || r == '<' || r == '>' {
			return ' '
		}
		return r
	}, s)
	return strings.Join(strings.Fields(s), " ")
}

func orNone(s string) string {
	if s == "" {
		return "(none)"
	}
	return s
}

// contextBlocks is what goes in front of the person's words: where things stand, what the agent has not seen, earlier messages
// for a restarted session, and sources. write is what this request is to write.
func contextBlocks(in agent.Input, write []string, sources []agent.Source, earlier []agent.Message, withState, withNotes bool) string {
	var b strings.Builder
	st := in.Studio
	if st == nil {
		st = &agent.Studio{}
	}
	what := "(none)"
	if len(write) > 0 {
		what = strings.Join(write, ", ")
	}
	fmt.Fprintf(&b, "<studio>\nprofileId: %s\nconversationId: %s\nviewing: %s\npost: %s\narticle: %s\nwrite: %s\n</studio>\n",
		attr(st.ProfileID), attr(st.ConversationID), orNone(attr(st.Viewing)), orNone(attr(st.PostID)), orNone(attr(st.ArticleID)), what)
	if withNotes && len(st.Notes) > 0 {
		b.WriteString("<notes>\n")
		for _, n := range st.Notes {
			fmt.Fprintf(&b, "- %s\n", escape(n))
		}
		b.WriteString("</notes>\n")
	}
	if withState {
		for _, c := range st.Cards {
			fmt.Fprintf(&b, "<card draftId=\"%s\" revision=\"%d\">%s</card>\n", attr(c.DraftID), c.Revision, escape(c.Design))
		}
		for _, c := range st.Changes {
			fmt.Fprintf(&b, "<changes draftId=\"%s\" revision=\"%d\">\n%s\n</changes>\n", attr(c.DraftID), c.Revision, escape(strings.Join(c.Lines, "\n")))
		}
	}
	if len(earlier) > 0 {
		b.WriteString("<history>\n")
		for _, m := range earlier {
			who := "person"
			if m.Role == "assistant" {
				who = "assistant"
			}
			fmt.Fprintf(&b, "%s: %s\n", who, escape(strings.Join(strings.Fields(m.Content), " ")))
		}
		b.WriteString("</history>\n")
	}
	for _, s := range sources {
		if strings.TrimSpace(s.Text) == "" {
			continue
		}
		name := s.Title
		if s.URL != "" {
			name = s.URL
		}
		fmt.Fprintf(&b, "<source id=\"%s\" kind=\"%s\" name=\"%s\" untrusted=\"true\"", attr(s.ID), attr(s.Kind), attr(name))
		if s.Truncated {
			b.WriteString(` note="only the start of it was available"`)
		}
		b.WriteString(">\n" + escape(s.Text) + "\n</source>\n")
	}
	return b.String()
}

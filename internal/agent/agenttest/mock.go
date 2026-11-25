// Package agenttest is a stand-in assistant for tests: it drafts from sources by simple rules, with no model behind it.
// It is not part of the product.
package agenttest

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"github.com/senthilsweb/cardpress/internal/agent"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"
)

// Mock is a deterministic stand-in for the real agent. It uses no language model: it picks sentences from the source by
// simple rules and understands a handful of instructions. It exists so the whole chat (streaming, proposals, approval,
// history) can be built, tested and tried without an AI behind it, and the screen says so.
type Mock struct {
	// Delay is the pause between streamed words, so a reply visibly arrives. Zero in tests.
	Delay time.Duration
}

func (m *Mock) Name() string { return "Demo agent" }
func (m *Mock) IsAI() bool   { return false }
func (m *Mock) Ready() bool  { return true }

func (m *Mock) CreateSession(context.Context) (string, error) {
	b := make([]byte, 6)
	_, _ = rand.Read(b)
	return "demo-" + hex.EncodeToString(b), nil
}

type options struct {
	kind       string
	level      int // 0 short, 1 normal, 2 long
	noTags     bool
	extraTags  []string
	question   bool
	understood bool // the newest message contained an instruction we know
}

var (
	reArticle  = regexp.MustCompile(`\b(an article|as an article|into an article|long[- ]?form)\b`)
	rePost     = regexp.MustCompile(`\b(a (linkedin )?post|as a post|into a post)\b`)
	reShorter  = regexp.MustCompile(`\b(shorter|short|brief|concise|trim|tighter)\b`)
	reLonger   = regexp.MustCompile(`\b(longer|more detail|expand|elaborate|fuller)\b`)
	reNormal   = regexp.MustCompile(`\b(normal length|medium length|default length)\b`)
	reNoTags   = regexp.MustCompile(`\b(no hashtags?|without hashtags?|drop the hashtags?|remove the hashtags?)\b`)
	reTags     = regexp.MustCompile(`\b(add hashtags?|with hashtags?|hashtags? please)\b`)
	reNoQ      = regexp.MustCompile(`\b(no question|without a question|drop the question)\b`)
	reQuestion = regexp.MustCompile(`\b(add a question|ask a question|end with a question|with a question)\b`)
	reTagToken = regexp.MustCompile(`#([\p{L}\p{N}_]{2,40})`)
)

// parse reads every user message in order, so a later message overrides an earlier one.
func parse(msgs []agent.Message) options {
	o := options{kind: agent.KindPost, level: 1, question: true}
	var last string
	for _, msg := range msgs {
		if msg.Role != "user" {
			continue
		}
		t := strings.ToLower(msg.Content)
		last = t
		if reArticle.MatchString(t) {
			o.kind = agent.KindArticle
		}
		if rePost.MatchString(t) && !reArticle.MatchString(t) {
			o.kind = agent.KindPost
		}
		switch {
		case reShorter.MatchString(t):
			o.level = 0
		case reLonger.MatchString(t):
			o.level = 2
		case reNormal.MatchString(t):
			o.level = 1
		}
		if reNoTags.MatchString(t) {
			o.noTags = true
		}
		if reTags.MatchString(t) {
			o.noTags = false
		}
		if reNoQ.MatchString(t) {
			o.question = false
		}
		if reQuestion.MatchString(t) {
			o.question = true
		}
		for _, m := range reTagToken.FindAllStringSubmatch(msg.Content, -1) {
			o.extraTags = append(o.extraTags, m[1])
		}
	}
	// "understood": the newest message used an instruction, or it is the very first one (which just starts the draft)
	users := 0
	for _, msg := range msgs {
		if msg.Role == "user" {
			users++
		}
	}
	o.understood = users <= 1 || reArticle.MatchString(last) || rePost.MatchString(last) || reShorter.MatchString(last) || reLonger.MatchString(last) ||
		reNormal.MatchString(last) || reNoTags.MatchString(last) || reTags.MatchString(last) || reNoQ.MatchString(last) ||
		reQuestion.MatchString(last) || reTagToken.MatchString(last)
	return o
}

var sentenceSplit = regexp.MustCompile(`(?s)(.+?[.!?])(\s+|$)`)

// sentences breaks text into sentences, dropping markdown markers and very short fragments.
func sentences(text string) []string {
	var out []string
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		line = strings.TrimLeft(line, "#- •*0123456789.) ")
		if line == "" {
			continue
		}
		if !strings.ContainsAny(line, ".!?") {
			if len(line) >= 25 {
				out = append(out, line+".")
			}
			continue
		}
		for _, m := range sentenceSplit.FindAllStringSubmatch(line, -1) {
			s := strings.TrimSpace(m[1])
			if len(s) >= 25 {
				out = append(out, s)
			}
		}
	}
	return out
}

func clip(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	cut := string(r[:n])
	if i := strings.LastIndex(cut, " "); i > n/2 {
		cut = cut[:i]
	}
	return strings.TrimRight(cut, " ,;:-") + "…"
}

// cleanTitle drops a trailing " | Site" or " - Site" from a page title.
func cleanTitle(t string) string {
	for _, sep := range []string{" | ", " – ", " — ", " - "} {
		if i := strings.LastIndex(t, sep); i > 10 && len(t)-i-len(sep) <= 28 {
			return strings.TrimSpace(t[:i])
		}
	}
	return strings.TrimSpace(t)
}

var stop = map[string]bool{}

func init() {
	for _, w := range strings.Fields(`about after again being between could would should their there these those which while where
	other through under until because before during every first another using really still thing things people your yours
	that this with from have been were what when will into more than them then they also just like some such only over
	make made many much most very here does done doing each both even ever well`) {
		stop[w] = true
	}
}

// keywords picks up to n words to use as hashtags: long, not common, most frequent first, ties by first appearance.
func keywords(text string, n int) []string {
	type kw struct {
		word  string
		count int
		first int
	}
	seen := map[string]*kw{}
	pos := 0
	for _, w := range strings.FieldsFunc(text, func(r rune) bool { return !unicode.IsLetter(r) && !unicode.IsDigit(r) }) {
		pos++
		lw := strings.ToLower(w)
		if len([]rune(lw)) < 5 || stop[lw] {
			continue
		}
		if k, ok := seen[lw]; ok {
			k.count++
		} else {
			seen[lw] = &kw{word: w, count: 1, first: pos}
		}
	}
	list := make([]*kw, 0, len(seen))
	for _, k := range seen {
		list = append(list, k)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].count != list[j].count {
			return list[i].count > list[j].count
		}
		return list[i].first < list[j].first
	})
	var out []string
	for _, k := range list {
		r := []rune(k.word)
		out = append(out, strings.ToUpper(string(r[:1]))+strings.ToLower(string(r[1:])))
		if len(out) == n {
			break
		}
	}
	return out
}

// Respond writes a draft from the source and the instructions so far.
func (m *Mock) Respond(ctx context.Context, in agent.Input, emit func(agent.Event)) (agent.Output, error) {
	sid := in.SessionID
	if sid == "" {
		sid, _ = m.CreateSession(ctx)
	}
	o := parse(in.Messages)

	// material: the source, or failing that the person's own longest message
	var material, srcTitle string
	added := false
	if len(in.Sources) > 0 {
		var all []string
		for _, s := range in.Sources {
			all = append(all, s.Text)
			added = added || s.New
		}
		material = strings.Join(all, "\n\n")
		if len(in.Sources) == 1 {
			srcTitle = in.Sources[0].Title
		}
	} else {
		for _, msg := range in.Messages {
			if msg.Role == "user" && len(msg.Content) > len(material) {
				material = msg.Content
			}
		}
	}
	sents := sentences(material)

	var out agent.Output
	out.SessionID = sid
	switch {
	case len(sents) == 0:
		out.Reply = "I could not find enough text to write from. Attach a file, add a link, or paste the text."
	case !o.understood && !added: // a new source is reason enough to redraft
		out.Reply = "I am a demo agent with no AI model behind me, so I only understand a few instructions: shorter, longer, make it an article, make it a post, no hashtags, add #YourTag, no question. Say one of those and I will redraft."
	default:
		p := draft(o, sents, srcTitle, material)
		if err := p.Normalize(); err != nil {
			return agent.Output{}, fmt.Errorf("the demo agent produced an invalid proposal: %w", err)
		}
		out.Proposal = &p
		what := "post"
		if p.Kind == agent.KindArticle {
			what = "article"
		}
		from := "your text"
		if srcTitle != "" {
			from = "“" + clip(cleanTitle(srcTitle), 60) + "”"
		}
		out.Reply = fmt.Sprintf("Here is a draft %s from %s. Approve it to copy it into your draft, edit it first, or tell me what to change.", what, from)
	}
	out.Reply = agent.CleanReply(out.Reply)

	// stream the reply word by word
	words := strings.Fields(out.Reply)
	for i, w := range words {
		if m.Delay > 0 {
			select {
			case <-ctx.Done():
				return agent.Output{}, ctx.Err()
			case <-time.After(m.Delay):
			}
		} else if err := ctx.Err(); err != nil {
			return agent.Output{}, err
		}
		if i > 0 {
			w = " " + w
		}
		emit(agent.Event{Type: "delta", Text: w})
	}
	return out, nil
}

func draft(o options, sents []string, srcTitle, material string) agent.Proposal {
	title := cleanTitle(srcTitle)
	if title == "" {
		title = strings.TrimRight(clip(sents[0], 90), ".…")
	}
	title = clip(title, 120)

	var body strings.Builder
	points := []int{1, 3, 5}[o.level]
	pick := func(from, n int) []string {
		var chosen []string
		for _, s := range sents[min(from, len(sents)):] {
			if len(s) >= 40 && len(s) <= 220 {
				chosen = append(chosen, s)
			}
			if len(chosen) == n {
				break
			}
		}
		return chosen
	}
	closer := "What would you try first?"
	if o.kind == agent.KindArticle {
		n := []int{4, 8, 14}[o.level]
		body.WriteString("## " + title + "\n\n")
		body.WriteString(strings.Join(sents[:min(3, len(sents))], " "))
		if rest := sents[min(3, len(sents)):]; len(rest) > 0 {
			body.WriteString("\n\n## Key points\n\n")
			for _, s := range rest[:min(n, len(rest))] {
				body.WriteString("- " + clip(s, 220) + "\n")
			}
		}
		if o.question {
			body.WriteString("\n## Over to you\n\n" + closer)
		}
	} else {
		body.WriteString(clip(sents[0], 220))
		if pts := pick(1, points); len(pts) > 0 {
			body.WriteString("\n\n")
			for _, s := range pts {
				body.WriteString("- " + s + "\n")
			}
		}
		if o.question {
			body.WriteString("\n" + closer)
		}
	}

	var tags []string
	if !o.noTags && o.kind == agent.KindPost {
		tags = keywords(material, 3)
	}
	tags = append(tags, o.extraTags...)
	if o.kind == agent.KindArticle {
		tags = nil
	}
	norm, err := agent.NormalizeHashtags(tags)
	if err != nil {
		norm = nil
	}
	if len(norm) > 5 {
		norm = norm[:5]
	}
	n := strings.Count(body.String(), "- ")
	return agent.Proposal{
		Kind:     o.kind,
		Title:    title,
		Body:     strings.TrimSpace(body.String()),
		Hashtags: norm,
		AltText:  fmt.Sprintf("A social card titled “%s”.", title),
		Rationale: fmt.Sprintf("Demo agent (no AI model): opened with the source's first sentence, listed %d point(s), %s. Try: “shorter”, “longer”, “make it an article”, “no hashtags”, “add #YourTag”.",
			n, map[bool]string{true: "and ended with a question", false: "with no closing question"}[o.question]),
	}
}

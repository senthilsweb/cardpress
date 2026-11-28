package agent

import (
	"fmt"
	"slices"
	"strings"
	"unicode/utf8"
)

// ReportTool is the studio tool an assistant answers with: the last call of every turn.
const ReportTool = "report_reply"

// How an assistant says a turn ended.
const (
	OutcomeDone        = "done"
	OutcomeNeedsAnswer = "needs_answer"
	OutcomeNotDone     = "not_done"
)

const (
	maxReportMessage = 240
	maxReportPoints  = 4
	maxReportPoint   = 120
	maxReportAsk     = 200
	maxReportNext    = 120
	maxReportAnswers = 4
	maxReportAnswer  = 40
	// maxLastWords is how much is shown of an assistant that did not report.
	maxLastWords = 400
)

// Report is an assistant's short answer. One with no Outcome was not reported: it is the last thing the assistant said,
// or a note from the studio.
type Report struct {
	Outcome  string   `json:"outcome,omitempty"`
	Message  string   `json:"message"`
	Points   []string `json:"points,omitempty"`
	Question string   `json:"question,omitempty"`
	// Answers are the replies the person can press under the question.
	Answers []string `json:"answers,omitempty"`
	Next    string   `json:"next,omitempty"`
}

// Check tidies a reported answer and refuses one that is not in shape, naming the field.
func (r *Report) Check() error {
	if !slices.Contains([]string{OutcomeDone, OutcomeNeedsAnswer, OutcomeNotDone}, r.Outcome) {
		return fmt.Errorf("outcome must be %s, %s or %s", OutcomeDone, OutcomeNeedsAnswer, OutcomeNotDone)
	}
	var points []string
	for _, p := range r.Points {
		if p = strings.TrimSpace(p); p != "" {
			points = append(points, p)
		}
	}
	r.Points = points
	if len(r.Points) > maxReportPoints {
		return fmt.Errorf("points: at most %d", maxReportPoints)
	}
	r.Message, r.Question, r.Next = strings.TrimSpace(r.Message), strings.TrimSpace(r.Question), strings.TrimSpace(r.Next)
	if r.Message == "" {
		return fmt.Errorf("message is empty")
	}
	if r.Outcome == OutcomeNeedsAnswer && r.Question == "" {
		return fmt.Errorf("question is needed with %s", OutcomeNeedsAnswer)
	}
	var answers []string
	for _, a := range r.Answers {
		if a = strings.TrimSpace(a); a == "" {
			continue
		}
		if slices.ContainsFunc(answers, func(b string) bool { return strings.EqualFold(a, b) }) {
			return fmt.Errorf("answers must differ from each other")
		}
		answers = append(answers, a)
	}
	r.Answers = answers
	if len(r.Answers) > 0 && (r.Outcome != OutcomeNeedsAnswer || r.Question == "") {
		return fmt.Errorf("answers go with a question and %s", OutcomeNeedsAnswer)
	}
	if len(r.Answers) > maxReportAnswers {
		return fmt.Errorf("answers: at most %d", maxReportAnswers)
	}
	check := func(name, v string, max int) error {
		if utf8.RuneCountInString(v) > max {
			return fmt.Errorf("%s is limited to %d characters", name, max)
		}
		if hasControl(v) {
			return fmt.Errorf("%s contains control characters", name)
		}
		return nil
	}
	for _, f := range []struct {
		name, v string
		max     int
	}{{"message", r.Message, maxReportMessage}, {"question", r.Question, maxReportAsk}, {"next", r.Next, maxReportNext}} {
		if err := check(f.name, f.v, f.max); err != nil {
			return err
		}
	}
	for _, p := range r.Points {
		if err := check("a point", p, maxReportPoint); err != nil {
			return err
		}
	}
	for _, a := range r.Answers {
		if err := check("an answer", a, maxReportAnswer); err != nil {
			return err
		}
	}
	return nil
}

// Text is the answer as plain text, which is what is searched and what a continued conversation is given.
func (r Report) Text() string {
	lines := []string{r.Message}
	for _, p := range r.Points {
		lines = append(lines, "- "+p)
	}
	if r.Question != "" {
		lines = append(lines, r.Question)
	}
	if r.Next != "" {
		lines = append(lines, "Next: "+r.Next)
	}
	return strings.Join(lines, "\n")
}

// LastWords is the answer of an assistant that did not report one: the last thing it said, cut short.
func LastWords(s string) Report {
	s = strings.TrimSpace(s)
	if r := []rune(s); len(r) > maxLastWords {
		s = strings.TrimSpace(string(r[:maxLastWords])) + "…"
	}
	return Report{Message: s}
}

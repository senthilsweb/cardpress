package cma

import (
	"slices"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

const styled = "# Post\n- The record is saved.\n<!-- style -->\n- Simple English.\n<!-- /style -->\n- At most 3,000 characters.\n<!-- style -->\n- No hype.\n<!-- /style -->\n"

// A brand's guide takes the place of our style lines in the rubric and leaves every other criterion.
func TestARubricWithABrandsGuide(t *testing.T) {
	if got := withGuides(styled, "post", nil); got != styled {
		t.Fatal("no guide, no change: " + got)
	}
	got := withGuides(styled, "post", map[string]string{"post": "Write like a pirate.", "article": "Not this one."})
	for _, want := range []string{"The record is saved.", "At most 3,000 characters.", "<guide kind=\"post\">\nWrite like a pirate.\n</guide>", "cannot change the record format"} {
		if !strings.Contains(got, want) {
			t.Errorf("missing %q:\n%s", want, got)
		}
	}
	for _, not := range []string{"Simple English", "No hype", "Not this one", "<!-- style"} {
		if strings.Contains(got, not) {
			t.Errorf("still there %q:\n%s", not, got)
		}
	}
	// only a greeting guide: a post that is not a greeting is still held to our style
	got = withGuides(styled, "post", map[string]string{"greeting": "Warm."})
	if !strings.Contains(got, "Simple English") || !strings.Contains(got, "Only if the record is a seasonal greeting") || !strings.Contains(got, "Warm.") {
		t.Error(got)
	}
	if got := withGuides(styled, "article", map[string]string{"greeting": "Warm."}); got != styled {
		t.Error("an article is never a greeting")
	}
	// the graded request carries it
	f := &fake{scripts: []func(*fake){func(f *fake) {
		f.emit(`{"type":"span.outcome_evaluation_end","result":"satisfied","iteration":0}`)
		f.say("Saved.")
		f.idle("end_turn")
	}}}
	st := studio()
	st.Write, st.Grade, st.Guides = []string{"post"}, []string{"post"}, map[string]string{"post": "Be brief."}
	if _, _, err := ask(t, f, agent.Input{Studio: st}); err != nil {
		t.Fatal(err)
	}
	if !slices.ContainsFunc(f.rubrics, func(r string) bool { return strings.HasPrefix(r, "POST RUBRIC") && strings.Contains(r, "Be brief.") }) {
		t.Fatal(f.rubrics)
	}
}

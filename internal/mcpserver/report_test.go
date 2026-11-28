package mcpserver

import (
	"strings"
	"testing"
)

func TestAReplyIsAcceptedOnlyInShapeAndInAConversationThatExists(t *testing.T) {
	r := newRig(t, stubFetcher{})
	if _, err := r.db.Exec(`INSERT INTO profiles (id, owner_id, data, position, updated_at) VALUES ('p', '', '{"id":"p","name":"P"}', 0, '')`); err != nil {
		t.Fatal(err)
	}
	if _, err := r.db.Exec(`INSERT INTO conversations (id, profile_id, title, source_kind, source_text, created_at, updated_at) VALUES ('c', 'p', 'T', 'topic', '', ?, ?)`,
		"2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z"); err != nil {
		t.Fatal(err)
	}
	cs := connect(t, r.deps)
	ok := map[string]any{"conversationId": "c", "outcome": "done", "message": "Saved the post.", "points": []string{"Opens with the number"}}
	if res, out := call(t, cs, "report_reply", ok); res.IsError || out["shown"] != true {
		t.Fatalf("%q %v", errText(res), out)
	}
	asked := map[string]any{"conversationId": "c", "outcome": "needs_answer", "message": "The article is ready.", "question": "Write the post as well?", "answers": []string{"Yes", "No"}}
	if res, out := call(t, cs, "report_reply", asked); res.IsError || out["shown"] != true {
		t.Fatalf("%q %v", errText(res), out)
	}
	for want, change := range map[string]map[string]any{
		"message is limited": {"message": strings.Repeat("x", 241)},
		"at most 4":          {"points": []string{"a", "b", "c", "d", "e"}},
		"outcome must be":    {"outcome": "finished"},
		"question is needed": {"outcome": "needs_answer"},
		"not found":          {"conversationId": "gone"},
		"go with a question": {"answers": []string{"Yes", "No"}},
		"answers: at most 4": {"outcome": "needs_answer", "question": "Which?", "answers": []string{"a", "b", "c", "d", "e"}},
		"must differ":        {"outcome": "needs_answer", "question": "Go on?", "answers": []string{"Yes", " yes "}},
		"an answer is limit": {"outcome": "needs_answer", "question": "Which?", "answers": []string{strings.Repeat("x", 41)}},
	} {
		in := map[string]any{}
		for k, v := range ok {
			in[k] = v
		}
		for k, v := range change {
			in[k] = v
		}
		if res, _ := call(t, cs, "report_reply", in); !res.IsError || !strings.Contains(strings.ToLower(errText(res)), want) {
			t.Errorf("%s: %q", want, errText(res))
		}
	}
}

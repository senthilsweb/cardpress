package service

import (
	"slices"
	"testing"
)

// An assistant reads the card headline as "headline"; what it saw is still kept under the stored name.
func TestTheAssistantCallsTheCardHeadlineByItsName(t *testing.T) {
	card := defaultCard()
	card.Title = "Ship less"
	m, err := CardForAssistant(card)
	if err != nil || m[Headline] != "Ship less" || m[StoredHeadline] != nil {
		t.Fatalf("%v %v", err, m)
	}
	was := sight{Card: map[string]any{StoredHeadline: "Ship less"}}
	now := sight{Card: map[string]any{StoredHeadline: "Ship more"}}
	if got := changedSince(was, now); !slices.Equal(got, []string{`headline: "Ship more"`}) {
		t.Fatalf("%v", got)
	}
}

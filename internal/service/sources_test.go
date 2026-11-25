package service

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/senthilsweb/cardpress/internal/agent"
)

func TestATopicConversationGathersSourcesAlongTheWay(t *testing.T) {
	spy := &spyAgent{out: agent.Output{Reply: "Noted."}}
	c, ctx := newChat(t, spy, &fakeFetcher{}), context.Background()
	conv, err := c.Start(ctx, "p", "", "")
	if err != nil || conv.SourceKind != "topic" || conv.Title != untitledTopic || conv.SourceChars != 0 {
		t.Fatalf("%v %+v", err, conv)
	}
	_, emit := collect()
	if err := c.Send(ctx, conv.ID, "", emit); !errors.Is(err, ErrInvalid) {
		t.Fatalf("nothing to send: %v", err)
	}
	if err := c.Send(ctx, conv.ID, "A post about data contracts, please.", emit); err != nil {
		t.Fatal(err)
	}
	file, err := c.AddSource(ctx, conv.ID, SourceInput{FileName: `C:\docs\notes.md`, Data: []byte("# Notes\n\nTeams agree on tables.")})
	if err != nil || file.Kind != "md" || file.Name != "notes.md" || file.MessageID != "" {
		t.Fatalf("%v %+v", err, file)
	}
	spare, err := c.AddSource(ctx, conv.ID, SourceInput{Text: pasted})
	if err != nil {
		t.Fatal(err)
	}
	if err := c.RemoveSource(ctx, conv.ID, spare.ID); err != nil {
		t.Fatal(err)
	}
	if err := c.Send(ctx, conv.ID, "", emit); err != nil { // a source can be sent on its own
		t.Fatal(err)
	}
	last := spy.inputs[len(spy.inputs)-1]
	if len(last.Sources) != 1 || !last.Sources[0].New || last.Messages[len(last.Messages)-1].Content != defaultNewSource {
		t.Fatalf("%+v", last)
	}
	got, _ := c.Get(ctx, conv.ID)
	if got.Title != "A post about data contracts, please." || len(got.Sources) != 1 || got.Sources[0].MessageID != got.Messages[2].ID || got.SourceChars == 0 {
		t.Fatalf("%+v", got)
	}
	if err := c.RemoveSource(ctx, conv.ID, file.ID); !errors.Is(err, ErrNotFound) {
		t.Fatalf("a source that was sent stays: %v", err)
	}
	if err := c.Send(ctx, conv.ID, "shorter", emit); err != nil {
		t.Fatal(err)
	}
	if last = spy.inputs[len(spy.inputs)-1]; last.Sources[0].New {
		t.Fatal("a source is new only until it has been answered")
	}
}

func TestSourceLimitsAndRefusals(t *testing.T) {
	c, ctx := newChat(t, &spyAgent{}, &fakeFetcher{}), context.Background()
	conv, _ := c.Start(ctx, "p", "", "")
	for name, in := range map[string]SourceInput{
		"nothing": {}, "two": {URL: "https://x.io", Text: pasted}, "short": {Text: "tiny"}, "type": {FileName: "a.exe", Data: []byte("x")},
	} {
		if _, err := c.AddSource(ctx, conv.ID, in); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
	for i := 0; i < maxSources; i++ {
		if _, err := c.AddSource(ctx, conv.ID, SourceInput{Text: pasted + strings.Repeat("!", i)}); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := c.AddSource(ctx, conv.ID, SourceInput{Text: pasted}); !errors.Is(err, ErrConflict) {
		t.Fatalf("the eleventh: %v", err)
	}
	if err := c.Delete(ctx, conv.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	if err := c.db.QueryRow(`SELECT COUNT(*) FROM conversation_sources`).Scan(&n); err != nil || n != 0 {
		t.Fatalf("sources go with the conversation: %d %v", n, err)
	}
}

type cancelling struct {
	spyAgent
	stop context.CancelFunc
}

func (a *cancelling) Respond(ctx context.Context, _ agent.Input, _ func(agent.Event)) (agent.Output, error) {
	a.stop() // the person presses stop while the reply is being written
	<-ctx.Done()
	return agent.Output{}, ctx.Err()
}

func TestAStoppedReplyIsRecordedAndTheConversationGoesOn(t *testing.T) {
	a := &cancelling{}
	c := newChat(t, a, &fakeFetcher{})
	conv, _ := c.Start(context.Background(), "p", "", pasted)
	ctx, cancel := context.WithCancel(context.Background())
	a.stop = cancel
	_, emit := collect()
	if err := c.Send(ctx, conv.ID, "", emit); err == nil {
		t.Fatal("a stopped turn is not a success")
	}
	got, err := c.Get(context.Background(), conv.ID)
	if err != nil || len(got.Messages) != 2 || got.Messages[1].Content != stoppedReply || len(got.Proposals) != 0 {
		t.Fatalf("%v %+v", err, got.Messages)
	}
	c.agent = &spyAgent{out: agent.Output{Reply: "Here."}}
	if err := c.Send(context.Background(), conv.ID, "go on", emit); err != nil {
		t.Fatalf("the next message works: %v", err)
	}
}

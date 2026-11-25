package service

import (
	"context"
	"errors"
	"testing"
)

var testJPEG = append([]byte("\xff\xd8\xff\xe0"), []byte("a small picture")...)

func TestAPostCanCarryItsOwnPictureInPlaceOfTheCard(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	st := New(h.db.DB)
	id := h.approvedDraft("p")

	// an approved post goes back to draft when its attachment changes: what was approved is what goes out
	d, err := st.SetAttachment(ctx, id, testJPEG)
	if err != nil || d.Attachment != AttachImage || d.Status != StatusDraft {
		t.Fatalf("%+v %v", d, err)
	}
	if b, typ, err := st.AttachmentImage(ctx, id); err != nil || typ != "image/jpeg" || string(b) != string(testJPEG) {
		t.Fatalf("stored picture: %q %v", typ, err)
	}
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}

	// the job sends the post's own picture, whatever the caller sent, and needs no card at all
	for _, sent := range [][]byte{testPNG, nil} {
		j, err := h.p.Create(ctx, JobInput{ProfileID: "p", DraftID: id, Body: "Hello", Image: sent})
		if err != nil || j.Attachment != AttachImage {
			t.Fatalf("%+v %v", j, err)
		}
		h.p.Execute(ctx, j.ID)
		c := h.li.calls[len(h.li.calls)-1]
		if string(c.Image) != string(testJPEG) || c.ContentType != "image/jpeg" {
			t.Fatalf("sent %q as %s", c.Image, c.ContentType)
		}
		if b, typ, _ := h.p.Image(ctx, j.ID); typ != "image/jpeg" || string(b) != string(testJPEG) {
			t.Fatalf("job picture: %s", typ)
		}
		// make the draft approved again for the second round
		if _, err := h.db.DB.Exec(`UPDATE drafts SET status = 'approved' WHERE id = ?`, id); err != nil {
			t.Fatal(err)
		}
	}

	// back to the card: the picture is gone and the post must be approved again
	d, err = st.ClearAttachment(ctx, id)
	if err != nil || d.Attachment != AttachCard || d.Status != StatusDraft {
		t.Fatalf("%+v %v", d, err)
	}
	if _, _, err := st.AttachmentImage(ctx, id); !errors.Is(err, ErrNotFound) {
		t.Fatalf("the picture should be gone: %v", err)
	}
	// a card post still needs its card
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}
	if _, err := h.p.Create(ctx, JobInput{ProfileID: "p", DraftID: id, Body: "Hello"}); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a card post without a card: %v", err)
	}
}

func TestAnAttachmentIsRefusedWhenItIsNotAPictureOrThePostIsWaiting(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	st := New(h.db.DB)
	id := h.approvedDraft("p")
	for name, data := range map[string][]byte{
		"empty":      nil,
		"not a pic":  []byte("<svg onload=alert(1)>"),
		"pdf":        []byte("%PDF-1.7"),
		"too large":  append(append([]byte{}, pngSignature...), make([]byte, maxImageBytes)...),
		"gif":        []byte("GIF89a"),
		"short jpeg": []byte("\xff\xd8"),
	} {
		if _, err := st.SetAttachment(ctx, id, data); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
	if d, _ := st.GetDraft(ctx, id); d.Status != StatusApproved || d.Attachment != AttachCard {
		t.Fatalf("a refused picture must change nothing: %+v", d)
	}
	// a post waiting to be sent cannot change
	at := h.clk.Add(3600e9)
	if _, err := h.p.Create(ctx, JobInput{ProfileID: "p", DraftID: id, Body: "Hello", Image: testPNG, ScheduledAt: &at, Timezone: "Europe/London"}); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SetAttachment(ctx, id, testJPEG); !errors.Is(err, ErrConflict) {
		t.Fatalf("waiting post: %v", err)
	}
	if _, err := st.ClearAttachment(ctx, id); !errors.Is(err, ErrConflict) {
		t.Fatalf("waiting post: %v", err)
	}
	// an article has no attachment
	if _, err := h.db.DB.Exec(`UPDATE drafts SET kind = 'article', status = 'draft' WHERE id = ?`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SetAttachment(ctx, id, testJPEG); !errors.Is(err, ErrInvalid) {
		t.Fatalf("article: %v", err)
	}
}

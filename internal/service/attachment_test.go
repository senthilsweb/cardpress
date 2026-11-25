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
	d, err := st.SetAttachment(ctx, id, testJPEG, "photo.jpg")
	if err != nil || d.Attachment != AttachImage || d.Status != StatusDraft {
		t.Fatalf("%+v %v", d, err)
	}
	if b, typ, err := st.AttachmentFile(ctx, id); err != nil || typ != "image/jpeg" || string(b) != string(testJPEG) {
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
	if _, _, err := st.AttachmentFile(ctx, id); !errors.Is(err, ErrNotFound) {
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
		"big pdf":    append([]byte("%PDF-1.7"), make([]byte, maxDocumentBytes)...),
		"too large":  append(append([]byte{}, pngSignature...), make([]byte, maxImageBytes)...),
		"gif":        []byte("GIF89a"),
		"short jpeg": []byte("\xff\xd8"),
	} {
		if _, err := st.SetAttachment(ctx, id, data, "x"); !errors.Is(err, ErrInvalid) {
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
	if _, err := st.SetAttachment(ctx, id, testJPEG, "photo.jpg"); !errors.Is(err, ErrConflict) {
		t.Fatalf("waiting post: %v", err)
	}
	if _, err := st.ClearAttachment(ctx, id); !errors.Is(err, ErrConflict) {
		t.Fatalf("waiting post: %v", err)
	}
	// an article has no attachment
	if _, err := h.db.DB.Exec(`UPDATE drafts SET kind = 'article', status = 'draft' WHERE id = ?`, id); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SetAttachment(ctx, id, testJPEG, "photo.jpg"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("article: %v", err)
	}
}

var testPDF = []byte("%PDF-1.7 three pages of slides")

func TestAPostCanCarryADocumentWithATitle(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	st := New(h.db.DB)
	id := h.approvedDraft("p")

	d, err := st.SetAttachment(ctx, id, testPDF, `C:\decks\Q4 plan.final.pdf`)
	if err != nil || d.Attachment != AttachDocument || d.AttachmentTitle != "Q4 plan.final" || d.Status != StatusDraft {
		t.Fatalf("%+v %v", d, err)
	}
	if b, typ, err := st.AttachmentFile(ctx, id); err != nil || typ != "application/pdf" || string(b) != string(testPDF) {
		t.Fatalf("stored document: %q %v", typ, err)
	}

	// the title is one line, not empty, not too long; changing it of an approved post returns it to draft
	for _, bad := range []string{"", "   ", "two\nlines", string(make([]rune, maxAttachmentTitle+1))} {
		if _, err := st.SetAttachmentTitle(ctx, id, bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("title %q: %v", bad, err)
		}
	}
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}
	if d, err := st.SetAttachmentTitle(ctx, id, "Q4 plan.final"); err != nil || d.Status != StatusApproved {
		t.Fatalf("the same title changes nothing: %+v %v", d, err)
	}
	if d, err := st.SetAttachmentTitle(ctx, id, "  Our Q4 plan "); err != nil || d.AttachmentTitle != "Our Q4 plan" || d.Status != StatusDraft {
		t.Fatalf("%+v %v", d, err)
	}
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}

	// the job sends the document with its title and no alt text, and needs no card
	j, err := h.p.Create(ctx, JobInput{ProfileID: "p", DraftID: id, Body: "Hello", AltText: "ignored"})
	if err != nil || j.Attachment != AttachDocument || j.Title != "Our Q4 plan" {
		t.Fatalf("%+v %v", j, err)
	}
	h.p.Execute(ctx, j.ID)
	c := h.li.calls[len(h.li.calls)-1]
	if !c.Document || c.Title != "Our Q4 plan" || string(c.Image) != string(testPDF) || c.ContentType != "application/pdf" {
		t.Fatalf("sent %+v", c)
	}
	if b, typ, _ := h.p.Image(ctx, j.ID); typ != "application/pdf" || string(b) != string(testPDF) {
		t.Fatalf("job file: %s", typ)
	}

	// a picture has no title
	other := h.approvedDraft("p")
	if _, err := st.SetAttachment(ctx, other, testJPEG, "a.jpg"); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SetAttachmentTitle(ctx, other, "x"); !errors.Is(err, ErrInvalid) {
		t.Fatalf("a picture has no title: %v", err)
	}
	for name, want := range map[string]string{"": "Document", ".pdf": ".pdf", "/a/b/report.pdf": "report", "x\x00y.pdf": "xy"} {
		if got := documentTitle(name); got != want {
			t.Errorf("documentTitle(%q) = %q, want %q", name, got, want)
		}
	}
}

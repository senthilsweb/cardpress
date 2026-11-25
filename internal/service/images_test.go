package service

import (
	"context"
	"errors"
	"fmt"
	"testing"
)

func pngN(n int) []byte {
	return append(append([]byte{}, pngSignature...), []byte(fmt.Sprintf("picture-%d", n))...)
}

func TestAPostCanCarrySeveralPictures(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	st := New(h.db.DB)
	id := h.approvedDraft("p")

	// a single picture first; adding to a set replaces it
	if _, err := st.SetAttachment(ctx, id, testJPEG, "a.jpg"); err != nil {
		t.Fatal(err)
	}
	var d Draft
	var err error
	for i := 1; i <= 3; i++ {
		if d, err = st.AddImage(ctx, id, pngN(i)); err != nil {
			t.Fatal(err)
		}
	}
	if d.Attachment != AttachImages || len(d.Images) != 3 || d.Status != StatusDraft || d.Images[0].Size != int64(len(pngN(1))) || d.AttachmentSize != 0 {
		t.Fatalf("%+v", d)
	}
	if _, _, err := st.AttachmentFile(ctx, id); !errors.Is(err, ErrNotFound) {
		t.Fatalf("the single picture should be gone: %v", err)
	}
	a, b, c := d.Images[0].ID, d.Images[1].ID, d.Images[2].ID
	if data, typ, err := st.ImageFile(ctx, id, b); err != nil || typ != "image/png" || string(data) != string(pngN(2)) {
		t.Fatalf("picture 2: %s %v", typ, err)
	}

	// alt text each, and a new order
	if _, err := st.SetImageAlt(ctx, id, a, " the first one "); err != nil {
		t.Fatal(err)
	}
	if _, err := st.SetImageAlt(ctx, id, "nope", "x"); !errors.Is(err, ErrNotFound) {
		t.Fatalf("unknown picture: %v", err)
	}
	for _, bad := range [][]string{{a, b}, {a, b, b}, {a, b, "x"}, {a, b, c, a}} {
		if _, err := st.OrderImages(ctx, id, bad); !errors.Is(err, ErrInvalid) {
			t.Errorf("order %v: %v", bad, err)
		}
	}
	if d, err = st.OrderImages(ctx, id, []string{c, a, b}); err != nil || d.Images[0].ID != c || d.Images[1].ID != a || d.Images[1].AltText != "the first one" {
		t.Fatalf("%+v %v", d.Images, err)
	}

	// every change of an approved post returns it to draft; the same value changes nothing
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}
	if d, _ := st.OrderImages(ctx, id, []string{c, a, b}); d.Status != StatusApproved {
		t.Fatal("the same order must change nothing")
	}
	if d, _ := st.SetImageAlt(ctx, id, a, "the first one"); d.Status != StatusApproved {
		t.Fatal("the same alt text must change nothing")
	}
	if d, _ := st.SetImageAlt(ctx, id, b, "second"); d.Status != StatusDraft {
		t.Fatal("a new alt text returns the post to draft")
	}
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}

	// the job carries its own copy, in order, and sends them as a multi-image post with no card
	j, err := h.p.Create(ctx, JobInput{ProfileID: "p", DraftID: id, Body: "Hello"})
	if err != nil || j.Attachment != AttachImages || j.ImageCount != 3 {
		t.Fatalf("%+v %v", j, err)
	}
	if img, _, _ := h.p.Image(ctx, j.ID); string(img) != string(pngN(3)) {
		t.Fatal("the job's thumbnail is its first picture")
	}
	h.p.Execute(ctx, j.ID)
	call := h.li.calls[len(h.li.calls)-1]
	if len(call.Pictures) != 3 || call.Image != nil || call.Pictures[1].AltText != "the first one" || call.Pictures[2].AltText != "second" {
		t.Fatalf("sent %+v", call)
	}
	for i, want := range []int{3, 1, 2} {
		if string(h.li.loaded[i]) != string(pngN(want)) {
			t.Fatalf("picture %d: %q", i, h.li.loaded[i])
		}
	}
	if got := status(t, h, j.ID); got.Status != JobPublished {
		t.Fatalf("%+v", got)
	}

	// deleting the job removes its copies; the draft keeps its own
	if err := h.p.Delete(ctx, j.ID); err != nil {
		t.Fatal(err)
	}
	var n int
	_ = h.db.DB.QueryRow(`SELECT COUNT(*) FROM job_images`).Scan(&n)
	if n != 0 {
		t.Fatalf("job pictures left behind: %d", n)
	}
}

func TestOnePictureOfASetIsAnOrdinaryImagePostAndNoneGoesBackToTheCard(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	st := New(h.db.DB)
	id := h.approvedDraft("p")
	d, _ := st.AddImage(ctx, id, pngN(1))
	d, _ = st.AddImage(ctx, id, pngN(2))
	first, second := d.Images[0].ID, d.Images[1].ID
	if _, err := st.SetImageAlt(ctx, id, second, "the one that is left"); err != nil {
		t.Fatal(err)
	}
	if d, err := st.RemoveImage(ctx, id, first); err != nil || len(d.Images) != 1 || d.Attachment != AttachImages {
		t.Fatalf("%+v %v", d, err)
	}
	if _, err := st.Approve(ctx, id); err != nil {
		t.Fatal(err)
	}
	j, err := h.p.Create(ctx, JobInput{ProfileID: "p", DraftID: id, Body: "Hello", AltText: "the post's own alt text"})
	if err != nil || j.Attachment != AttachImage || j.ImageCount != 0 || j.AltText != "the one that is left" {
		t.Fatalf("%+v %v", j, err)
	}
	h.p.Execute(ctx, j.ID)
	call := h.li.calls[len(h.li.calls)-1]
	if len(call.Pictures) != 0 || string(call.Image) != string(pngN(2)) || call.AltText != "the one that is left" {
		t.Fatalf("sent %+v", call)
	}

	// removing the last picture goes back to the card
	other := h.approvedDraft("p")
	d, _ = st.AddImage(ctx, other, pngN(1))
	if d, err := st.RemoveImage(ctx, other, d.Images[0].ID); err != nil || d.Attachment != AttachCard || len(d.Images) != 0 {
		t.Fatalf("%+v %v", d, err)
	}
	// a single file replaces a set, and so does going back to the card
	_, _ = st.AddImage(ctx, other, pngN(1))
	_, _ = st.AddImage(ctx, other, pngN(2))
	if d, err := st.SetAttachment(ctx, other, testPDF, "deck.pdf"); err != nil || d.Attachment != AttachDocument || len(d.Images) != 0 {
		t.Fatalf("%+v %v", d, err)
	}
	_, _ = st.AddImage(ctx, other, pngN(1))
	if d, err := st.ClearAttachment(ctx, other); err != nil || d.Attachment != AttachCard || len(d.Images) != 0 {
		t.Fatalf("%+v %v", d, err)
	}
	var n int
	_ = h.db.DB.QueryRow(`SELECT COUNT(*) FROM draft_images WHERE draft_id = ?`, other).Scan(&n)
	if n != 0 {
		t.Fatalf("pictures left behind: %d", n)
	}
}

func TestPicturesAreLimitedAndChecked(t *testing.T) {
	h, ctx := newHarness(t, nil), context.Background()
	st := New(h.db.DB)
	id := h.approvedDraft("p")
	for name, data := range map[string][]byte{"pdf": testPDF, "text": []byte("hello"), "too large": append(append([]byte{}, pngSignature...), make([]byte, maxImageBytes)...)} {
		if _, err := st.AddImage(ctx, id, data); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v", name, err)
		}
	}
	for i := 0; i < maxPostImages; i++ {
		if _, err := st.AddImage(ctx, id, pngN(i)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := st.AddImage(ctx, id, pngN(99)); !errors.Is(err, ErrInvalid) {
		t.Fatalf("one too many: %v", err)
	}
	// the list of a brand's drafts carries the pictures' descriptions, never their bytes
	list, err := st.ListDrafts(ctx, "p")
	if err != nil || len(list) != 1 || len(list[0].Images) != maxPostImages {
		t.Fatalf("%v %d", err, len(list))
	}
}

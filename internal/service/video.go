package service

import (
	"context"
	"errors"
	"fmt"
	"io"

	"github.com/senthilsweb/cardpress/internal/source"
)

// A post can carry a video in place of the card. Only its public address is kept: the file is read when the post is
// sent, passed to LinkedIn and not stored.

// AttachVideo is the attachment kind of a post with a video.
const AttachVideo = "video"

// VideoChecker reports whether an address can be used for a video. *source.Videos implements it.
type VideoChecker interface {
	Check(ctx context.Context, url string) (source.VideoInfo, error)
}

// VideoSource reads a video from its address. *source.Videos implements it.
type VideoSource interface {
	Open(ctx context.Context, url string) (io.ReadCloser, int64, error)
}

// SetVideo gives a post a video, by its public https address, to go out in place of the card. The address is checked
// now (it answers, it is an MP4, its size is within the limit) and read again when the post is sent. The card is kept.
func (s *Studio) SetVideo(ctx context.Context, id, address string) (Draft, error) {
	d, err := s.attachmentChange(ctx, id)
	if err != nil {
		return Draft{}, err
	}
	if s.Videos == nil {
		return Draft{}, invalid("video is not available on this server")
	}
	info, err := s.Videos.Check(ctx, address)
	if err != nil {
		var se *source.Error
		if errors.As(err, &se) {
			return Draft{}, invalid("%s", se.Message)
		}
		return Draft{}, err
	}
	if d.Attachment == AttachVideo && d.VideoURL == info.URL && d.VideoSize == info.Size {
		return d, nil
	}
	title := documentTitle(info.Name)
	switch {
	case d.Attachment == AttachVideo: // a new address keeps the title the person wrote
		title = d.AttachmentTitle
	case info.Name == "":
		title = "Video"
	}
	if _, err := s.db.ExecContext(ctx, `UPDATE drafts SET attachment_kind = ?, attachment = NULL, attachment_type = '', attachment_title = ?, video_url = ?, video_size = ?, `+backToDraft+`, revision = revision + 1, updated_at = ? WHERE id = ?`,
		AttachVideo, title, info.URL, info.Size, s.draftStamp(), id); err != nil {
		return Draft{}, err
	}
	if _, err := s.db.ExecContext(ctx, `DELETE FROM draft_images WHERE draft_id = ?`, id); err != nil {
		return Draft{}, fmt.Errorf("remove the pictures: %w", err)
	}
	after, err := s.GetDraft(ctx, id)
	if err == nil {
		s.changed(after)
	}
	return after, err
}

package api

import (
	"context"
	"errors"
	"io"
	"mime"
	"net/http"
	"strings"

	"github.com/senthilsweb/cardpress/internal/service"
)

// Media is the part of the media library the HTTP API needs.
type Media interface {
	List(ctx context.Context, profileID string) (service.Assets, error)
	Add(ctx context.Context, profileID string, in service.NewAsset) (service.Asset, error)
	Update(ctx context.Context, profileID, id, name string, tags []string) (service.Asset, error)
	Delete(ctx context.Context, profileID, id string) error
	File(ctx context.Context, profileID, id string) (service.AssetFile, error)
	Thumb(ctx context.Context, profileID, id string) (service.AssetFile, error)
}

// maxUpload is a whole upload: the largest file, its thumbnail and the form around them.
const maxUpload = service.MaxPDFBytes + 1<<20

// uploads lets one file be taken in at a time: each is held in memory while it is checked and stored.
var uploads = make(chan struct{}, 1)

// media answers "not found" on a server that was given no library.
func (s *server) media(w http.ResponseWriter, r *http.Request) bool {
	if s.Media == nil {
		writeError(w, r, http.StatusNotFound, "not_found", "no such endpoint")
		return false
	}
	return true
}

func (s *server) listAssets(w http.ResponseWriter, r *http.Request) {
	if !s.media(w, r) {
		return
	}
	list, err := s.Media.List(r.Context(), r.PathValue("id"))
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, list)
}

// addAsset takes a multipart form: "name", "tags" (comma separated), and either "file" with its "thumb", or "link".
func (s *server) addAsset(w http.ResponseWriter, r *http.Request) {
	if !s.media(w, r) {
		return
	}
	select {
	case uploads <- struct{}{}:
		defer func() { <-uploads }()
	case <-r.Context().Done():
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUpload)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var tooBig *http.MaxBytesError
		if errors.As(err, &tooBig) {
			writeError(w, r, http.StatusRequestEntityTooLarge, "too_large", "the file is too large: pictures up to 10 MB, PDFs up to 20 MB")
		} else {
			writeError(w, r, http.StatusBadRequest, "bad_form", "expected a multipart form with a name and a file or a link")
		}
		return
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck
	in := service.NewAsset{Name: r.FormValue("name"), Tags: strings.Split(r.FormValue("tags"), ","), Link: r.FormValue("link")}
	for field, into := range map[string]*[]byte{"file": &in.Data, "thumb": &in.Thumb} {
		f, _, err := r.FormFile(field)
		if errors.Is(err, http.ErrMissingFile) {
			continue
		}
		if err == nil {
			*into, err = io.ReadAll(f)
			f.Close()
		}
		if err != nil {
			writeError(w, r, http.StatusBadRequest, "invalid", "the file could not be read")
			return
		}
	}
	a, err := s.Media.Add(r.Context(), r.PathValue("id"), in)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, a)
}

func (s *server) updateAsset(w http.ResponseWriter, r *http.Request) {
	if !s.media(w, r) {
		return
	}
	var body struct {
		Name string   `json:"name"`
		Tags []string `json:"tags"`
	}
	if !decode(w, r, &body) {
		return
	}
	a, err := s.Media.Update(r.Context(), r.PathValue("id"), r.PathValue("asset"), body.Name, body.Tags)
	if err != nil {
		fail(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, a)
}

func (s *server) deleteAsset(w http.ResponseWriter, r *http.Request) {
	if !s.media(w, r) {
		return
	}
	if err := s.Media.Delete(r.Context(), r.PathValue("id"), r.PathValue("asset")); err != nil {
		fail(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// sendAsset writes a stored file so that a browser never runs anything in it.
func sendAsset(w http.ResponseWriter, f service.AssetFile, cache string) {
	h := w.Header()
	h.Set("Content-Type", f.Mime)
	h.Set("X-Content-Type-Options", "nosniff")
	h.Set("Content-Security-Policy", "default-src 'none'; sandbox")
	h.Set("Cache-Control", cache)
	_, ext, _ := strings.Cut(f.Mime, "/")
	h.Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": strings.NewReplacer("/", "-", `\`, "-").Replace(f.Name) + "." + ext}))
	_, _ = w.Write(f.Data)
}

func (s *server) assetFile(w http.ResponseWriter, r *http.Request) {
	if !s.media(w, r) {
		return
	}
	f, err := s.Media.File(r.Context(), r.PathValue("id"), r.PathValue("asset"))
	if err != nil {
		fail(w, r, err)
		return
	}
	sendAsset(w, f, "private, no-store")
}

func (s *server) assetThumb(w http.ResponseWriter, r *http.Request) {
	if !s.media(w, r) {
		return
	}
	f, err := s.Media.Thumb(r.Context(), r.PathValue("id"), r.PathValue("asset"))
	if err != nil {
		fail(w, r, err)
		return
	}
	sendAsset(w, f, "private, max-age=86400") // an entry's thumbnail never changes
}

package source

import (
	"archive/zip"
	"bytes"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"path"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/ledongthuc/pdf"
)

// File kinds a person can attach as source material.
const (
	KindMarkdown = "md"
	KindDocx     = "docx"
	KindPDF      = "pdf"

	MaxFileBytes = 10 << 20
	MaxFileChars = 200_000

	maxDocxXML  = 40 << 20 // unpacked: a small file must not unfold into a huge one
	maxPDFPages = 300
	pdfTimeout  = 20 * time.Second
)

// ReadFile turns an attached file into the text the assistant writes from. The type comes from the name and is checked
// against the content. Every refusal is an *Error whose message is meant for the person.
func ReadFile(name string, data []byte) (kind, text string, truncated bool, err error) {
	if len(data) == 0 {
		return "", "", false, &Error{"That file is empty."}
	}
	if len(data) > MaxFileBytes {
		return "", "", false, &Error{fmt.Sprintf("That file is over %d MB.", MaxFileBytes>>20)}
	}
	switch strings.ToLower(path.Ext(name)) {
	case ".md", ".markdown", ".txt":
		kind = KindMarkdown
		if !utf8.Valid(data) || bytes.IndexByte(data, 0) >= 0 {
			return "", "", false, &Error{"That is not a text file."}
		}
		text = string(data)
	case ".docx":
		kind = KindDocx
		text, err = docxText(data)
	case ".pdf":
		kind = KindPDF
		text, err = pdfText(data)
	default:
		return "", "", false, &Error{"Attach a PDF, Word (.docx), Markdown or text file."}
	}
	if err != nil {
		return "", "", false, err
	}
	text = tidy(text)
	if text == "" {
		if kind == KindPDF {
			return "", "", false, &Error{"No text could be read from that PDF. A scanned PDF holds only pictures."}
		}
		return "", "", false, &Error{"That file has no text."}
	}
	if utf8.RuneCountInString(text) > MaxFileChars {
		text, truncated = string([]rune(text)[:MaxFileChars]), true
	}
	return kind, text, truncated, nil
}

// tidy drops control characters and runs of blank lines.
func tidy(s string) string {
	s = strings.ToValidUTF8(strings.ReplaceAll(s, "\r\n", "\n"), "")
	s = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' {
			return r
		}
		if r == '\r' {
			return '\n'
		}
		if unicode.IsControl(r) || r == '\uFEFF' {
			return -1
		}
		return r
	}, s)
	var out []string
	blank := 0
	for _, l := range strings.Split(s, "\n") {
		if l = strings.TrimRight(l, " \t"); l == "" {
			if blank++; blank > 1 {
				continue
			}
		} else {
			blank = 0
		}
		out = append(out, l)
	}
	return strings.TrimSpace(strings.Join(out, "\n"))
}

// docxText reads the paragraphs of word/document.xml. A heading style becomes a "## " line.
func docxText(data []byte) (string, error) {
	bad := &Error{"That Word file could not be read."}
	z, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return "", bad
	}
	f, err := z.Open("word/document.xml")
	if err != nil {
		return "", bad
	}
	defer f.Close()
	lim := &io.LimitedReader{R: f, N: maxDocxXML + 1}
	d := xml.NewDecoder(lim)
	var out, para strings.Builder
	inText, heading, listed := false, false, false
	for {
		tok, err := d.Token()
		if lim.N <= 0 {
			return "", &Error{"That Word file is too large once unpacked."}
		}
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return "", bad
		}
		switch t := tok.(type) {
		case xml.StartElement:
			switch t.Name.Local {
			case "t":
				inText = true
			case "tab":
				para.WriteByte('\t')
			case "br", "cr":
				para.WriteByte('\n')
			case "numPr":
				listed = true
			case "pStyle":
				for _, a := range t.Attr {
					if a.Name.Local == "val" && strings.HasPrefix(strings.ToLower(a.Value), "heading") {
						heading = true
					}
				}
			}
		case xml.EndElement:
			switch t.Name.Local {
			case "t":
				inText = false
			case "p":
				if line := strings.TrimSpace(para.String()); line != "" {
					switch {
					case heading:
						out.WriteString("\n## ")
					case listed:
						out.WriteString("- ")
					}
					out.WriteString(line)
					out.WriteString("\n")
					if !listed {
						out.WriteString("\n")
					}
				}
				para.Reset()
				heading, listed = false, false
			}
		case xml.CharData:
			if inText {
				para.Write(t)
			}
		}
	}
	return out.String(), nil
}

// pdfText reads the text of a PDF's pages. The file comes from outside, so a crash in the reader is caught and a read
// that takes too long is given up.
func pdfText(data []byte) (string, error) {
	if !bytes.HasPrefix(data, []byte("%PDF-")) {
		return "", &Error{"That file is not a PDF."}
	}
	type result struct {
		text string
		err  error
	}
	done := make(chan result, 1)
	deadline := time.Now().Add(pdfTimeout)
	go func() {
		defer func() {
			if v := recover(); v != nil {
				done <- result{err: &Error{"That PDF could not be read."}}
			}
		}()
		r, err := pdf.NewReader(bytes.NewReader(data), int64(len(data)))
		if err != nil {
			done <- result{err: &Error{"That PDF could not be read. A password-protected PDF cannot be used."}}
			return
		}
		var b strings.Builder
		for i := 1; i <= min(r.NumPage(), maxPDFPages) && b.Len() < 4*MaxFileChars && time.Now().Before(deadline); i++ {
			page, err := r.Page(i).GetPlainText(nil)
			if err != nil {
				continue // one unreadable page does not lose the rest
			}
			b.WriteString(page)
			b.WriteString("\n\n")
		}
		done <- result{text: b.String()}
	}()
	select {
	case v := <-done:
		return v.text, v.err
	case <-time.After(pdfTimeout + time.Second):
		return "", &Error{"That PDF took too long to read."}
	}
}

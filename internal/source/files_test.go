package source

import (
	"archive/zip"
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"
)

// makePDF builds a one-page PDF that shows the given lines.
func makePDF(lines ...string) []byte {
	var content strings.Builder
	for i, l := range lines {
		fmt.Fprintf(&content, "BT /F1 12 Tf 72 %d Td (%s) Tj ET\n", 720-i*20, l)
	}
	objs := []string{
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
		fmt.Sprintf("<< /Length %d >>\nstream\n%sendstream", content.Len(), content.String()),
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
	}
	var b bytes.Buffer
	b.WriteString("%PDF-1.4\n")
	var at []int
	for i, o := range objs {
		at = append(at, b.Len())
		fmt.Fprintf(&b, "%d 0 obj\n%s\nendobj\n", i+1, o)
	}
	xref := b.Len()
	fmt.Fprintf(&b, "xref\n0 %d\n0000000000 65535 f \n", len(objs)+1)
	for _, o := range at {
		fmt.Fprintf(&b, "%010d 00000 n \n", o)
	}
	fmt.Fprintf(&b, "trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n", len(objs)+1, xref)
	return b.Bytes()
}

func makeDocx(body string) []byte {
	var b bytes.Buffer
	z := zip.NewWriter(&b)
	f, _ := z.Create("word/document.xml")
	fmt.Fprintf(f, `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>%s</w:body></w:document>`, body)
	z.Close()
	return b.Bytes()
}

func TestReadFile(t *testing.T) {
	docx := makeDocx(`<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Why it matters</w:t></w:r></w:p>` +
		`<w:p><w:r><w:t xml:space="preserve">First </w:t></w:r><w:r><w:t>paragraph.</w:t></w:r></w:p>` +
		`<w:p><w:pPr><w:numPr/></w:pPr><w:r><w:t>A point</w:t></w:r></w:p>`)
	for _, c := range []struct {
		name string
		data []byte
		kind string
		want []string
	}{
		{"notes.md", []byte("\uFEFF# Title\r\n\r\n\r\n\r\nText\x07 here."), KindMarkdown, []string{"# Title\n\nText here."}},
		{"a.TXT", []byte("plain words"), KindMarkdown, []string{"plain words"}},
		{"b.docx", docx, KindDocx, []string{"## Why it matters", "First paragraph.", "- A point"}},
		{"c.pdf", makePDF("Small teams lose hours.", "We moved the questions."), KindPDF, []string{"Small teams lose hours.", "We moved the questions."}},
	} {
		kind, text, cut, err := ReadFile(c.name, c.data)
		if err != nil || kind != c.kind || cut {
			t.Fatalf("%s: %v %q %v", c.name, err, kind, cut)
		}
		for _, w := range c.want {
			if !strings.Contains(text, w) {
				t.Errorf("%s: %q lacks %q", c.name, text, w)
			}
		}
	}
	if _, text, cut, err := ReadFile("long.txt", []byte(strings.Repeat("é", MaxFileChars+5))); err != nil || !cut || len([]rune(text)) != MaxFileChars {
		t.Fatalf("long: %v %v", err, cut)
	}
}

func TestReadFileRefusals(t *testing.T) {
	for name, c := range map[string]struct {
		file string
		data []byte
		want string
	}{
		"empty":         {"a.txt", nil, "empty"},
		"type":          {"a.exe", []byte("x"), "Attach a PDF"},
		"too big":       {"a.txt", make([]byte, MaxFileBytes+1), "over 10 MB"},
		"binary text":   {"a.md", []byte{0xff, 0xfe, 0}, "not a text file"},
		"not a zip":     {"a.docx", []byte("hello"), "could not be read"},
		"not a pdf":     {"a.pdf", []byte("hello"), "not a PDF"},
		"broken pdf":    {"a.pdf", []byte("%PDF-1.4\ngarbage"), "could not be read"},
		"scanned":       {"a.pdf", makePDF(), "No text"},
		"empty docx":    {"a.docx", makeDocx(""), "no text"},
		"zip bomb":      {"a.docx", makeDocx("<w:p><w:r><w:t>" + strings.Repeat("a", maxDocxXML) + "</w:t></w:r></w:p>"), "too large"},
		"truncated pdf": {"a.pdf", makePDF("text")[:200], "could not be read"},
	} {
		_, _, _, err := ReadFile(c.file, c.data)
		var se *Error
		if !errors.As(err, &se) || !strings.Contains(se.Message, c.want) {
			t.Errorf("%s: %v, want %q", name, err, c.want)
		}
	}
}

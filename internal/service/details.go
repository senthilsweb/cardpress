package service

import (
	"context"
	"database/sql"
	"errors"
	"net/mail"
	"regexp"
	"strings"
	"unicode"
	"unicode/utf8"
)

// BrandDetails is who a brand is. It is personal data: read and changed only by the brand's owner and administrators,
// and never part of the brand's look, a public page, an export or anything the assistant is sent.
type BrandDetails struct {
	Kind       string `json:"kind"` // "", "company" or "individual"
	LegalName  string `json:"legalName"`
	Line1      string `json:"line1"`
	Line2      string `json:"line2"`
	City       string `json:"city"`
	Region     string `json:"region"`
	PostalCode string `json:"postalCode"`
	Country    string `json:"country"` // ISO 3166-1 alpha-2
	Mobile     string `json:"mobile"`
	Email      string `json:"email"`
}

var (
	countryRe = regexp.MustCompile(`^[A-Z]{2}$`)
	mobileRe  = regexp.MustCompile(`^\+?[0-9][0-9 ()./-]{2,29}$`)
)

// clean trims every field and refuses what cannot be right.
func (d *BrandDetails) clean() error {
	for name, f := range map[string]struct {
		value *string
		max   int
	}{
		"legal name": {&d.LegalName, 160}, "address line 1": {&d.Line1, 160}, "address line 2": {&d.Line2, 160}, "city": {&d.City, 80},
		"state or region": {&d.Region, 80}, "postal code": {&d.PostalCode, 20}, "mobile": {&d.Mobile, 31}, "email": {&d.Email, 254},
		"country": {&d.Country, 2}, "type": {&d.Kind, 10},
	} {
		*f.value = strings.TrimSpace(*f.value)
		if utf8.RuneCountInString(*f.value) > f.max {
			return invalid("the %s is too long (at most %d characters)", name, f.max)
		}
		if !utf8.ValidString(*f.value) || strings.IndexFunc(*f.value, unicode.IsControl) >= 0 {
			return invalid("the %s holds characters that cannot be kept", name)
		}
	}
	if d.Kind != "" && d.Kind != "company" && d.Kind != "individual" {
		return invalid("the type is company or individual")
	}
	if d.Country != "" && !countryRe.MatchString(d.Country) {
		return invalid("the country is a two-letter code")
	}
	if d.Mobile != "" && !mobileRe.MatchString(d.Mobile) {
		return invalid("the mobile number holds digits, spaces and + ( ) . / - only")
	}
	if d.Email != "" {
		a, err := mail.ParseAddress(d.Email)
		if err != nil || a.Address != d.Email || !strings.Contains(d.Email[strings.LastIndex(d.Email, "@")+1:], ".") {
			return invalid("that is not an email address")
		}
	}
	return nil
}

// BrandDetails reads a brand's details; a brand with none gives empty ones.
func (s *Studio) BrandDetails(ctx context.Context, profileID string) (BrandDetails, error) {
	var d BrandDetails
	if err := brandVisible(ctx, s.db, profileID); err != nil {
		return d, err
	}
	if err := s.brandExists(ctx, profileID); err != nil {
		return d, err
	}
	err := s.db.QueryRowContext(ctx, `SELECT kind, legal_name, line1, line2, city, region, postal_code, country, mobile, email FROM brand_details WHERE profile_id = ?`, profileID).
		Scan(&d.Kind, &d.LegalName, &d.Line1, &d.Line2, &d.City, &d.Region, &d.PostalCode, &d.Country, &d.Mobile, &d.Email)
	if errors.Is(err, sql.ErrNoRows) {
		return d, nil
	}
	return d, err
}

// SaveBrandDetails replaces a brand's details. All empty removes them.
func (s *Studio) SaveBrandDetails(ctx context.Context, profileID string, d BrandDetails) (BrandDetails, error) {
	if err := brandVisible(ctx, s.db, profileID); err != nil {
		return d, err
	}
	if err := s.brandExists(ctx, profileID); err != nil {
		return d, err
	}
	if err := d.clean(); err != nil {
		return d, err
	}
	if d == (BrandDetails{}) {
		_, err := s.db.ExecContext(ctx, `DELETE FROM brand_details WHERE profile_id = ?`, profileID)
		return d, err
	}
	_, err := s.db.ExecContext(ctx, `INSERT INTO brand_details (profile_id, kind, legal_name, line1, line2, city, region, postal_code, country, mobile, email, updated_by, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT (profile_id) DO UPDATE SET kind = excluded.kind, legal_name = excluded.legal_name, line1 = excluded.line1, line2 = excluded.line2,
			city = excluded.city, region = excluded.region, postal_code = excluded.postal_code, country = excluded.country, mobile = excluded.mobile,
			email = excluded.email, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
		profileID, d.Kind, d.LegalName, d.Line1, d.Line2, d.City, d.Region, d.PostalCode, d.Country, d.Mobile, d.Email, actorID(ctx), s.stamp())
	return d, err
}

func (s *Studio) brandExists(ctx context.Context, id string) error {
	var one int
	err := s.db.QueryRowContext(ctx, `SELECT 1 FROM profiles WHERE id = ?`, id).Scan(&one)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	return err
}

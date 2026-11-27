# Brand details: who the brand is

**Status:** proposed (asked for by the owner on 2026-11-27). Not built.

## Why
A brand holds what a card shows. It does not say who the client is. A light customer record (contacts, invoices) is
planned later and needs this first.

## What changes
Optional fields on a brand, none required to create one:

| Field | Form |
|---|---|
| Type | drop-down: Company, Individual |
| Legal name | the company's or the person's name |
| Address | line 1, line 2, city, state or region, postal code, country (drop-down, ISO 3166) |
| Website | the brand's existing website field |
| Mobile | text, with country code |
| Email | checked for form only |

- **New brand:** a folded section **Contact details (optional)**.
- **Settings → Brand look:** a **Details** section with the same fields, saved with a button (unsaved changes ask first).
- **Settings → Brands:** the type is shown beside the name when set.

## Privacy
These are personal data. They are **not** part of the brand's look:
- never on a card, a public page, a feed preview or a profile export;
- never sent to the assistant or listed over MCP;
- read and changed only by the brand's owner and admins;
- removed when the brand is deleted.

## Storage
A table of its own, `brand_details` (one row per brand, plain columns), with `GET` and `PUT
/api/v1/profiles/{id}/details`. Separate from the brand's JSON so that contacts and invoices can refer to it later.

## Out of scope
Contacts, invoices, several addresses, tax numbers, verifying email or phone.

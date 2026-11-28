# User guide

**Status:** released and deployed. Source: `web/guide/`; the docs workflow publishes the web copy under `/guide/`.

## Why
The documentation mixes use of the product with installation and code. Someone writing posts needs only how to use it.

## What changes
One guide, **inside the app** (the owner's decision): **User guide** in the navigation and in the account menu opens the page `/help/`, with grouped contents, search and the sections of the page. The same pages are also built as plain static HTML for the web.

Order: Getting started; Brands and multiple accounts; Connect social accounts; LinkedIn posts; LinkedIn articles; Posts and articles together; Seasonal greetings; then chat, the card, backgrounds, publishing, library, calendar, roles and problems. A box on the background pages says that new backgrounds can be plugged in, and that any custom picture can be used instead.

- **One source folder** of text files; a small build script writes plain static HTML. Contents on the left, page contents on the right, previous and next, search. A little JavaScript, no documentation framework.
- **Writing:** short numbered steps, exact button names, one task per page. No technical terms, no setup of the server, no marketing language.
- **Screenshots** from a test copy with example brands only.
- A change that a user can see updates its page in the same pull request.
- The present documentation stays as the technical documentation.

### Brands
- A brand is one identity: name, handle, logo, fonts and colours, with its own posts, chats, calendar entries and social accounts.
- Uses: one person with one brand; a company with several products; an agency handling several clients' social media, one brand per client (examples use TemplrPress as the second brand).
- Adding, switching, renaming, archiving. A post goes out only through its own brand's account.
- Who sees a brand: its owner and admins. A brand cannot yet be shared between editors, and the page says so.

### Connect social accounts
Per brand, step by step, from creating the developer app to pasting the values and testing.

| Network | The guide covers | Publishing from CardPress |
|---|---|---|
| LinkedIn | App, permissions, access token, author URN (person or company page), Test connection, renewing the token (about 60 days) | Yes |
| X | Getting and saving the keys | Not yet: download the image and post by hand |
| Instagram | Business or Creator account, getting and saving the values | Not yet: download the image and post by hand |

Facebook has card sizes only, with no account to connect.

Steps on the networks' own sites change; each is checked against the network's current developer pages when written, and carries the date checked.

## Publishing on the web
GitHub Pages at `/cardpress/guide/`, beside the technical documentation.

## Out of scope
Server installation, the API, other languages.

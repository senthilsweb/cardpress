# Design

## Sign-in: a server session, not a JWT
The session stays an unguessable token in an `HttpOnly` cookie, with its hash in the database. A signed token (JWT)
holds its claims until it expires: signing out, disabling a person or changing a role would not take effect at once,
and a limit without use needs server state anyway. The role is read from the database on every request, so it is never
kept in the browser.

Cookie: `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` over HTTPS (then named `__Host-cardpress_session`), `Max-Age`
equal to the longest a session may last.

## Session times
| Setting | Default | Range |
|---|---|---|
| Without use (`CARDPRESS_SESSION_IDLE`) | 20m | 5m to 24h |
| In all (`CARDPRESS_SESSION_MAX`) | 12h | 15m to 30 days, not below the first |

- The server decides, from `created_at` and `last_seen_at`. A change applies to sessions that are open.
- A request marked `X-CardPress-Background: 1` is answered but does not count as use: job and chat polling.
- The event stream does not count as use and closes when its session ends.
- The app counts typing, pointer and touch as use, and then tells the server at most once a minute. One minute before
  the end it asks "Stay signed in?"; at the end it goes to sign-in and returns afterwards. Open tabs share the session,
  so the app asks the server for the time left before it signs anyone out.
- `GET /auth/session` gives the seconds left (background); `POST /auth/session` counts as use.

## Preferences
- On the server, per person: `theme`, `palette` and the rest as before, and a new `ui` object for view choices
  (list or grid, columns, page sizes, dashboard period, calendar view, compact side bar, folded sections).
- Cookie `cardpress_look` (readable by the page, one year, `SameSite=Lax`): theme and palette only, set by the server
  at sign-in and when either changes. It holds nothing personal and is not trusted by the server.
- The app removes the keys earlier versions left in `localStorage` and `sessionStorage`. The import of data saved by
  versions before the database goes with them.
- A typed API token (servers without accounts) is kept in memory and asked for again after a reload.
- A test fails if the web app's source uses browser storage.

## Security settings
Stored in `preferences` under `security`. The environment gives the starting values; what an administrator saves
replaces them. `Use defaults` removes the saved values.

| Setting | Default | Environment |
|---|---|---|
| Sign-up | open | `CARDPRESS_SIGNUP` |
| Role of a new person | editor | `CARDPRESS_DEFAULT_ROLE` |
| Without use / in all | 20m / 12h | `CARDPRESS_SESSION_IDLE`, `_MAX` |
| Shortest password | 10 (10 to 64) | |
| Failed sign-ins before a pause | 5 (3 to 20) | |
| Length of the pause | 15 minutes (1 to 1440) | |

The first account can always be created. Only an administrator signed in to the app may read or change these: not an
API key.

## Behind a proxy
`CARDPRESS_CLIENT_IP_HEADER` names the header the proxy sets with the client's address (`Fly-Client-IP` on Fly, set in
`fly.toml`). Unset, the connection's address is used. Never set it without a proxy that overwrites the header.

## Headers
On every answer of the app: `Content-Security-Policy` (own scripts plus the hashes of the inline scripts in the built
pages; no framing; no plugins), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`,
and `Strict-Transport-Security` over HTTPS. API answers: `Cache-Control: no-store`.

## Security log
Table `security_events`: time, event, who, whom, address. Events: sign-in, failed sign-in, pause, sign-out, sign-up,
password changed or set, role or status changed, security settings changed, everyone signed out. Never a password or
token. The newest 2000 are kept. Administrators read it on the Security page.

## Upgrade
Sessions open at the upgrade end if unused for longer than the new time, so most people sign in again once.

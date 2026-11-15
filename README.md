# Website Screenshot World for Make

The [Make](https://www.make.com) app for [Website Screenshot World](https://www.websitescreenshotworld.com):
screenshots, PDFs, videos and readable text of web pages, and events from scheduled captures, in Make scenarios.

This repository holds the app as code. `scripts/definitions.mjs` describes the whole app, `npm run build` writes
Make's component files under `app/`, and `npm run upload` sends them to Make with Make's own SDK
(`@makehq/sdk`). Change the definitions, never `app/` by hand; CI fails when `app/` is out of date.

## What it has

| Module | Type | Connection |
|---|---|---|
| Take a screenshot, Create a PDF, Record a video, Get page content | Action | Instant Snap |
| Get a capture | Action | Instant Snap |
| Capture a scheduled page now | Action | Auto Schedule |
| Watch succeeded captures, Watch failed captures, Watch page changes, Watch completed deliveries, Watch paused schedules, Watch completed sitemap runs | Instant trigger | either |
| Make an API call | Universal | Instant Snap |

- **Connections.** One per product, because each key works only with its own API. A connection checks its key
  with `GET /account` (no capture is spent) and is named like "you@example.com (Laptop)": the member who created
  the key and the key's name, never the key.
- **Captures.** A capture module starts the capture asynchronously, reads it every 3 seconds until it has finished
  (2 minutes for images, PDFs and text, 4 for video), then fetches the file or the text from its signed link, and
  outputs the capture as the API returned it (dates parsed) with the file. A capture that did not succeed (failed,
  timed out, expired, or still running at the end) stops the module with the reason and the capture's ID. The
  request body is every parameter the user filled in, under the API's own name.
- **The key.** Set once in the Base, like the API address and the error message, so every module and webhook
  inherits it. The download from a capture's signed link is on another host and must never receive the key: that
  one request sets `x-api-key` to empty, which replaces the inherited header (checked live: with it, the API answers
  401). "Make an API call" appends the user's path to the fixed Instant Snap address, so a full URL typed by the
  user cannot take the key elsewhere.
- **Events.** Each trigger has its own webhook. Creating the webhook in a scenario adds an endpoint for that one
  event to the organization (`POST /webhook-endpoints`, shown under Developer Tools, Webhooks as "Make: ...");
  deleting it removes the endpoint. A trigger outputs the event as the API sent it, with its dates parsed (dates
  inside an array, such as a delivery's destinations, stay ISO 8601 text: parsing them needs a custom IML function,
  which Make enables only on request). Other event types, such as the dashboard's test delivery, are acknowledged and
  dropped. Make gives an app no access to a delivery's raw bytes, so the `X-WSW-Signature` header cannot be
  checked here; the endpoint's address is Make's unguessable webhook URL, and it is hidden in the logs.

## Develop

Node.js 22 or later.

```sh
npm ci
npm run build      # writes app/ from scripts/definitions.mjs
npm run check      # app/ up to date, Make's editor schemas, tests
```

`npm run validate` checks every component file against the JSON schemas Make's own editor uses
(`tools/editor-schemas/`). The tests check what the schemas cannot: the key is set only in the Base and blanked on
every download link, every other request stays on the API, detach deletes exactly what attach created, outputs
spread the API's answer with dates parsed, fields are typed the same everywhere, and the upload script creates,
binds and re-reads everything (against an in-memory stand-in for Make).

## Upload to Make

1. In Make: your profile, **API access**, **Add token**, with the scopes `sdk-apps:read` and `sdk-apps:write`.
2. Create `.env.local` in this folder (it is git-ignored) with the token and your Make zone, the host you see in
   the address bar, such as `eu2.make.com`:
   ```
   MAKE_API_KEY=...
   MAKE_ZONE=eu2.make.com
   ```
3. `npm run upload` checks the settings without sending anything; `npm run upload -- --live` uploads.

The upload creates the app as **private** (version 1) the first time and updates it afterwards. It looks up the
connections and webhooks by label, because Make names them itself, so running it again creates nothing twice. It
reads every section back and stops at the first difference. It never publishes the app, requests a review,
creates a connection or runs a scenario.

## Publishing

See [PUBLISHING.md](PUBLISHING.md).

## License

MIT. See [LICENSE](LICENSE).

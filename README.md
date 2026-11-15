# Website Screenshot World for Make

The [Make](https://www.make.com) app for [Website Screenshot World](https://www.websitescreenshotworld.com):
screenshots, PDFs, videos and readable text of web pages, and events from scheduled captures, in Make scenarios.

This repository holds the app as code. `scripts/definitions.mjs` describes the whole app, `npm run build` writes
Make's component files under `app/`, and `npm run upload` sends them to Make with Make's own SDK
(`@makehq/sdk`). Change the definitions, never `app/` by hand; CI fails when `app/` is out of date.

## What it has

| Module | Type | Connection |
|---|---|---|
| Take a Screenshot, Create a PDF, Record a Video, Get Page Content | Action | Instant Snap |
| Get a Capture | Action | Instant Snap |
| Capture a Scheduled Page Now | Action | Auto Schedule |
| Watch Captures Succeeded, Watch Captures Failed, Watch Page Changes, Watch Deliveries Completed, Watch Schedules Paused, Watch Sitemap Runs Completed | Instant trigger | either |
| Make an API Call | Universal | Instant Snap |

- **Connections.** One per product, because each key works only with its own API. A connection checks its key
  with `GET /account` (no capture is spent) and is named like "you@example.com (Laptop)": the member who created
  the key and the key's name, never the key.
- **Captures.** A capture module starts the capture asynchronously, reads it every 3 seconds until it has finished
  (2 minutes for images, PDFs and text, 4 for video), then fetches the file or the text from its signed link. The
  key is never sent to that link: it is set on each API request, not in the Base. A failed capture stops the module
  with the API's reason. A capture still running at the end is returned with its ID for "Get a Capture".
- **Events.** Each trigger has its own webhook. Creating the webhook in a scenario adds an endpoint for that one
  event to the organization (`POST /webhook-endpoints`, shown under Developer Tools, Webhooks as "Make: ...");
  deleting it removes the endpoint. Other event types, such as the dashboard's test delivery, are acknowledged and
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
(`tools/editor-schemas/`). The tests check what the schemas cannot: the key never reaches a download link and is
hidden in every log, detach deletes exactly what attach created, outputs match interfaces, and the upload script
creates, binds and re-reads everything (against an in-memory stand-in for Make).

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

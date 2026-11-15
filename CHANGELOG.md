# Changelog

## 1.0.0 - Unreleased

The first version of the Make app.

- Connections for Instant Snap and Auto Schedule keys, each checked with `GET /account` and named after the member
  who created the key and the key's name.
- Take a screenshot, Create a PDF, Record a video and Get page content (each returns the file or the text, and
  stops with the reason when the capture does not succeed), Get a capture, Capture a scheduled page now, and Make an
  API call. Outputs are the API's answers as they are, with dates parsed.
- Instant triggers for captures succeeded and failed (optionally one product), page changes, deliveries, paused
  schedules and completed sitemap runs, each adding its own webhook endpoint and removing it again.

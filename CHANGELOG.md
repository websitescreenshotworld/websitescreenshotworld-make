# Changelog

## 1.0.0 - Unreleased

The first version of the Make app.

- Connections for Instant Snap and Auto Schedule keys, each checked with `GET /account` and named after the member
  who created the key and the key's name.
- Take a Screenshot, Create a PDF, Record a Video and Get Page Content (each returns the file or the text), Get a
  Capture, Capture a Scheduled Page Now, and Make an API Call.
- Instant triggers for captures succeeded and failed (optionally one product), page changes, deliveries, paused
  schedules and completed sitemap runs, each adding its own webhook endpoint and removing it again.

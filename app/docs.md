# Website Screenshot World

[Website Screenshot World](https://www.websitescreenshotworld.com) captures web pages: screenshots, PDFs, scrolling
videos and the readable text of a page, on demand (Instant Snap) or on a schedule (Auto Schedule), with change
detection and delivery to your own cloud storage.

## Connect

Each product has its own API key. Create keys in the Website Screenshot World dashboard, under **Developer Tools,
API Keys**:

- **Instant Snap** (keys start with `wsw_api_`) for the capture modules, "Get a Capture" and "Make an API Call".
- **Auto Schedule** (keys start with `wsw_autoapi_`) for "Capture a Scheduled Page Now".

The event triggers work with either key. A connection is named after the member who created the key and the key's
name, never the key itself.

## Modules

- **Take a Screenshot**, **Create a PDF**, **Record a Video** and **Get Page Content** capture a page and return the
  file (or the text) with its details. Ads and cookie banners are blocked unless you switch that off.
- **Get a Capture** reads a capture back by its ID, with a fresh download link. Files are kept for 24 hours.
- **Capture a Scheduled Page Now** starts the capture of a page set up in Auto Schedule.
- **Watch** triggers fire on capture, change, delivery, pause and sitemap-run events. Each adds a webhook endpoint
  to your organization (Developer Tools, Webhooks) and removes it when its webhook is deleted.
- **Make an API Call** calls any Instant Snap API endpoint with your key.

Every capture counts toward your plan's allowance; failed captures are not charged.

Documentation: https://www.websitescreenshotworld.com/api-documentation
Support: support@websitescreenshotworld.com

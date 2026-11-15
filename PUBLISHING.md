# Publishing the Make app

From Make's developer documentation (custom apps: App visibility, App review: Prerequisites and Request app
review), read 15 Nov 2026. Read those pages again before each step: Make changes them.

## 1. Test every module (private app)

The private app works only in the account that owns it. Make's reviewers ask for links to scenarios that use
every module, run shortly before the review, with no personal or sensitive data in their logs.

1. Create both connections (an Instant Snap key and an Auto Schedule key from the demo account). Check that each
   is named "email (key name)".
2. One scenario per action: Take a Screenshot, Create a PDF, Record a Video, Get Page Content, Get a Capture (with
   the ID the screenshot returned), Capture a Scheduled Page Now, and Make an API Call (`GET /account`). Use the
   demo sites, such as `https://gazette.demoscreenshot.com`, never a third-party site.
3. One scenario per trigger, as for the Zapier review: Captures Succeeded and Failed (one each with a product
   picked), Page Changes, Deliveries Completed (the Google Drive destination), Schedules Paused (the 401 test
   schedule) and Sitemap Runs Completed. Check in Developer Tools, Webhooks that each adds a "Make: ..." endpoint,
   and that deleting the webhook in Make removes it.
   Producing each event: a Quick Capture of the gazette schedule sends Captures Succeeded and Deliveries
   Completed, and Page Changes only when the page really changed. A Quick Capture of the 401 schedule sends
   Captures Failed; for Schedules Paused, resume that schedule and Quick Capture it until it pauses again (twice,
   on 15 Nov 2026). A sitemap schedule cannot be started on demand (the API answers 409): edit the sitemap
   schedule, set Start to "Immediately" and save, and its run sends Sitemap Runs Completed. Make keeps events that
   arrive while no run is listening: click Run once and choose "Use existing data".
4. Run every scenario once, as close to the review request as you can.

## 2. Publish (cannot be undone)

Publishing gives the app an invite link. A published app cannot be made private again and its modules cannot be
deleted (only hidden), so remove anything that is only for testing first.

1. More, Custom Apps, the app, **Publish** (done 15 Nov 2026).
2. Modules tab: switch every module to "visible" (done 15 Nov 2026).

## 3. Request the review

1. The app's **Review** tab: the API documentation link (`https://www.websitescreenshotworld.com/api-documentation`),
   one scenario link per module (`https://eu1.make.com/<team>/scenarios/<id>/edit`), and a link to a scenario that
   shows an API error (Get a Capture with the ID `00000000-0000-0000-0000-000000000000` answers 404
   `capture_not_found`). Make the latest run of each linked scenario a successful one: reviewers read the history.
2. **Request review** on the Review tab submits at once (no further form on 15 Nov 2026); the app shows "pending
   approval". The developer contact shown is the Make account's (admin@websitescreenshotworld.com).
3. Make runs an automatic check, then a manual review; feedback comes by email. "Update review" on the Review tab
   resubmits after changes.

Submitted 15 Nov 2026. Scenarios linked: actions 8592379; triggers 8592868 (failed), 8592784 (succeeded), 8592841
(deliveries), 8592824 (page changes), 8592884 (paused), 8592898 (sitemap runs); API error 8593353.

After approval, every change to the app (new modules, code, logo or theme) needs Make's approval again.

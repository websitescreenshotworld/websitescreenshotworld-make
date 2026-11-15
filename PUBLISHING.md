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
   Captures Failed; Schedules Paused needs that schedule resumed first, since it fires only when a schedule is
   paused. A sitemap schedule cannot be started on demand (the API answers 409), so for Sitemap Runs Completed
   create a sitemap schedule that starts now. Make keeps events that arrive while no run is listening: click
   Run once and choose "Use existing data".
4. Run every scenario once, as close to the review request as you can.

## 2. Publish (cannot be undone)

Publishing gives the app an invite link. A published app cannot be made private again and its modules cannot be
deleted (only hidden), so remove anything that is only for testing first.

1. Developers (Custom apps), the app, **Publish**.
2. Modules tab: make every module public.

## 3. Request the review

1. The app's **Review** tab: the API documentation link (`https://www.websitescreenshotworld.com/api-documentation`)
   and the links to the test scenarios.
2. **Request review**, then the form: developer and support contact (admin@websitescreenshotworld.com and
   support@websitescreenshotworld.com), categories, the company logo (`assets/logo-512.png`, 512 × 512 PNG), the
   service address (`https://www.websitescreenshotworld.com`), and the trademark and terms declarations.
3. Make runs an automatic check, which sends a PDF of issues, then a manual review; feedback comes by email.

After approval, every change to the app (new modules, code, logo or theme) needs Make's approval again.

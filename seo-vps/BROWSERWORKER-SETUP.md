# BrowserWorker on VinaHost — deployment checklist

BrowserWorker documentation: https://browserworker.app/
Status: **NOT DEPLOYED**. This is a preparation checklist, not evidence of a connected worker.

## Prerequisites
- Linux VPS with desktop-capable Chromium/Google Chrome and a display server (Xvfb or desktop session); browser extension requires a running browser.
- Official BrowserWorker Chrome extension obtained through the vendor's documentation.
- Worker token configured privately **on the VPS**, not committed to GitHub, pasted into chat, or placed in a public URL.
- API bearer token stored separately, with least-privilege access to the automation process.
- Browser profile dedicated to directory submissions; do not reuse profiles for lottery, football, customer accounts or bots.

## Connection verification
1. Install the official extension in the dedicated browser profile.
2. Connect the extension using the private worker token.
3. Confirm dashboard changes from 0/1 to 1/1 connected and worker becomes online.
4. Use API Playground for a harmless read-only test on a public page.
5. Run **one** permitted directory submission as a pilot, respecting site terms and any manual review.
6. Store evidence (timestamp, destination, submission response); count a backlink only when the public listing URL is independently verified.

## Limits and safeguards
Free plan as advertised: one concurrent browser, 50 tasks/day, one-minute task cap. One task is not necessarily one successful listing.
Do not bypass CAPTCHA, rate limits, anti-bot controls or directory eligibility restrictions. Never flood third-party sites with repetitive submissions.
Keep the browser worker and automation isolated from existing VPS services and monitor CPU/RAM. Do not install anything on production without checking capacity and permissions.

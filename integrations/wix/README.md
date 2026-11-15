# Rate 1 on a Wix site: install guide

About 15 minutes. You need to be the site owner (or an admin) in Wix, and you need two things from us:

| From us | Looks like | Where it goes |
| --- | --- | --- |
| **Site key** | `pk_` followed by 24 letters and digits | Step 1 (the tracking code) |
| **Webhook address** | `https://collect.bazed.live/v1/w/wh_…` | Step 3 (the form automation) |

Treat the webhook address like a password: anyone who has it can send fake "form submitted" messages. Don't post it anywhere public.

> **Before you start:** adding custom code to Wix needs a **paid Premium plan with a connected domain**. On a free `*.wixsite.com` site the *Custom Code* section isn't available, and you can't install Rate 1.

---

## Step 1: Add the tracking code

1. Open your site's **Dashboard** in Wix.
2. Go to **Settings** (left menu, near the bottom).
3. Scroll to **Development & integrations** and click **Custom Code**.
4. Click **+ Add Custom Code** (top right).
5. Paste this into the code box. Replace `pk_YOUR_SITE_KEY` with your site key; keep everything else exactly as it is:

   ```html
   <script defer src="https://collect.bazed.live/v1/r1.js" data-site="pk_YOUR_SITE_KEY"></script>
   ```

6. **Name:** type `Rate 1`.
7. **Add Code to Pages:** choose **All pages**, and in the drop-down next to it choose **Load code once**.
   *Why "once"? Wix changes pages without reloading. Rate 1 notices every page change by itself; loading the code again on each page would count visits twice.*
8. **Place Code in:** choose **Head**.
9. Click the **Code Type** tab and choose a category: see [the open question below](#open-question-which-code-category). Until we tell you otherwise, choose **Essential**.
10. Click **Apply**.
11. **Publish** your site (top right in the Editor). Custom code only runs on the published site, never in the Editor or Preview.

### Check that it works

1. Open your live site in a normal browser window and add `?r1_debug=1` to the address, for example `https://www.your-site.com/?r1_debug=1`.
2. A small black box appears in the bottom-right corner. After about a second it shows lines starting with `→ {"type":"pageview"` and then `← 204`.
   - `← 204` means it works. Click to another page in your menu: a new `pv …` line and another `← 204` should appear.
   - `← network error` usually means the site address isn't on our list yet (for example `www.` vs. no `www.`), or an ad blocker is active. Try without the ad blocker; if it stays, send us the exact address from the browser bar.
   - No black box at all: the code isn't on the page. Check that the site is published, the code is set to **All pages**, and the site key has no extra spaces.
3. Visits opened with `?r1_debug=1` are marked as test visits and never appear in your numbers.

---

## Step 2: Mark the contact form (optional)

Rate 1 counts a request when your Wix form shows its "thank you" message. We set this up for you in the Rate 1 dashboard. You only need to tell us:

- which page the form is on, and
- the exact text of the form's success message (for example *"Thanks for submitting!"*).

---

## Step 3: Tell Rate 1 when a form is submitted (Wix Automations)

This sends a short "a form was submitted" message to Rate 1. It contains only the form's name and a submission number: **never** the visitor's name, email, phone number or message.

1. In the Wix **Dashboard**, open **Automations** (left menu; sometimes under **Marketing & SEO** or **More**).
2. Click **+ Create Automation** → **Start from scratch**.
3. **Name** it `Rate 1 – form submitted`.
4. **Trigger:** choose **Wix Forms** → **Form submitted**. Pick your contact form (create one automation per form if you have several).
5. **Action:** click **+**, choose **Send HTTP request** (it may be listed under *Developer tools* or *Webhooks*).
6. **Target URL:** paste your webhook address `https://collect.bazed.live/v1/w/wh_…`.
7. **Method:** **POST**. **Content type:** **JSON**.
8. **Body / Payload:** choose **Custom structure** (sometimes called *Customize body*).

   > ⚠️ **Do not choose "All keys and values"** (or "Send all data"). That would send everything your visitors type, including names, emails and phone numbers. Rate 1 throws that away unread, but it should never leave your site in the first place.

9. Build this structure with exactly two keys:

   | Key | Value |
   | --- | --- |
   | `form` | Type the form's name as plain text, e.g. `Kontakt` (use the same name for the same form every time) |
   | `submission_id` | Click **+ Add dynamic value** and pick the submission's **ID** (may be called *Submission ID* or *Form submission ID*). If there's no such field, leave this key out. |

   The result must look like this, nothing more:

   ```json
   {"form": "Kontakt", "submission_id": "<the submission ID>"}
   ```

10. Click **Save** / **Activate**.

### Check that it works

Submit your own form once on the live site. Within a minute the Rate 1 dashboard's setup checklist shows **Wix webhook** as passed. If Wix shows the automation as failed, check the URL for typos (it must start with `https://collect.bazed.live/v1/w/wh_`).

---

## What Rate 1 does and does not collect on your site

- **Does:** which pages are viewed, how long and how far people read, clicks on phone, email, WhatsApp and booking buttons, whether a form was sent, the referring website's name (e.g. `www.google.com`) and campaign tags (`utm_…`).
- **Does not:** set cookies, store anything on the visitor's device, read what visitors type into forms, store IP addresses or full browser identifiers.

## Open question: which code category

Wix asks whether custom code is **Essential**, **Functional**, **Analytics** or **Advertising**. Wix's cookie banner (if you use one) blocks non-essential code until the visitor agrees.

- **Essential:** Rate 1 runs for every visitor. Our argument: no cookies, no device storage, no personal data stored.
- **Analytics:** Rate 1 runs only after the visitor accepts analytics cookies; numbers will be lower and skewed toward visitors who accept.

**This is not decided yet.** It's with our data protection specialist (contract §14). Until then, use **Essential** on test sites only; for client sites, wait for the decision. If the answer is *Analytics*, the only change is the category in step 1.9.

## Removing Rate 1

Settings → Custom Code → `Rate 1` → **⋯** → **Delete**, then publish. Automations → `Rate 1 – form submitted` → **Delete**.

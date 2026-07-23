# Service Intake — Planning & Scope

_Last updated: 2026-07-14_

## 1. Goal

A simple, mobile- and desktop-friendly web form that lets clients submit a
service request. On submit, the app emails the request details (and any
uploaded photos) to the Innova Developments team.

Keep it simple. This is a lightweight intake form, not a portal — no client
login, no database dashboard required for v1.

## 2. Recipients

Submissions are emailed to:

| Email | Send now? | Notes |
|-------|-----------|-------|
| `adil@innovadevelopments.ca` | ✅ Yes | Only active recipient for v1 |
| `jeff@innovadevelopments.ca` | ❌ Not yet | Enable at production. **Note:** the address you gave was `jeff@innvoadevelopments.ca` — that looks like a typo (`innvoa` → `innova`). Please confirm the correct spelling. |
| `dayton@innovadevelopments.ca` | ❌ Not yet | Enable at production |

**Implementation note (email path):** put the recipient list in config/env, not
hard-coded. Jeff's and Dayton's addresses stay commented out / feature-flagged
until production, so flipping them on is a one-line change.

**Implementation note (Teams path — preferred, see §5):** if requests post to a
Teams channel instead of email, "who gets notified" is controlled by channel
membership, not a recipient list. For the same "only Adil for now" effect,
either keep only Adil in the channel initially and add Jeff/Dayton at
production, or route @mentions in the Adaptive Card. Confirm which the team
prefers.

## 3. Form Fields

| # | Field | Type | Details |
|---|-------|------|---------|
| 1 | Contact Name | Text | Who's submitting. Required. |
| 2 | Email | Email | Submitter's email. Required, validated format. |
| 3 | Phone | Tel | Submitter's phone. Required, `tel` input for mobile keypad. |
| 4 | New or Existing Client | Choice | Two options: **New** / **Existing**. (Your note said "yes/no" but these aren't yes/no answers — confirm if you'd rather it be a different question.) |
| 5 | Site Address | Text + autocomplete | Google Maps Places Autocomplete for address suggestions. Must still allow free-typed entry as a fallback. |
| 6 | When was it built? | Dropdown | Years, e.g. current year down to ~1900, plus an "Unknown / Not sure" option. |
| 7 | Describe the work | Textarea | Free text, multi-line. |
| 8 | Photos | File upload | Up to **5** images. Restrict to image types (jpg/png/heic/webp), cap file size (e.g. 10 MB each), show thumbnails/previews. |

At least one contact method is now required (email + phone), so every submission
has a reply path.

## 4. Non-Functional Requirements

- **Responsive:** works well on phone and desktop.
- **Simple UX:** single page, minimal steps, clear submit + confirmation state.
- **Validation:** required fields, image type/size limits, friendly errors.
- **Spam protection:** basic protection (e.g. hCaptcha/reCAPTCHA or a honeypot)
  since this form is public and emails out.
- **Confirmation:** after submit, show a "Thanks, we got your request" message.
  Optionally send the client a confirmation email if we collect their address.

## 5. Delivery / Notification Setup (decide this first)

How does a submission reach the team? Two families of approach: **post to a
Teams channel** (Adil's preference) or **send an email**. Teams is a good fit
since the team already lives in Microsoft 365.

### ⭐ Preferred — Power Automate → Teams channel (via HTTP trigger)

Flow: the web app sends a JSON payload to a Power Automate flow, which posts a
nicely-formatted message (Adaptive Card) into a Teams channel.

1. In Power Automate, create a flow with the **"When an HTTP request is
   received"** trigger. This gives you a webhook URL.
2. The app POSTs the form data (name, email, phone, address, year, description,
   photo links) to that URL on submit.
3. Flow action **"Post card in a chat or channel"** posts an Adaptive Card to
   your chosen Teams channel (e.g. a "Service Requests" channel).

**Why this is nice:**
- No email credentials, no domain DNS/SPF/DKIM setup.
- Requests land in a shared Teams channel the whole team sees — better than a
  buried inbox. Can @mention or add approve/assign buttons later.
- The web app only needs one secret: the webhook URL (stored in Vercel env).

**Watch-outs / decisions:**
- ⚠️ **Licensing:** the "When an HTTP request is received" trigger is a
  **premium** Power Automate connector. Need to confirm the tenant has the
  right Power Automate plan (or per-flow/per-user premium license). **This is
  the key thing to verify.**
- **Photos:** don't push 5 images through the HTTP trigger — it's awkward and
  hits size limits. Instead the app uploads photos to storage (Vercel Blob or
  SharePoint/OneDrive) and passes **links** in the payload; the Teams card shows
  thumbnails/links. (See Section 7 photo handling.)
- **Security:** the HTTP trigger URL is a secret. Keep it server-side (call it
  from the Next.js API route, never the browser) and optionally validate a
  shared token in the flow.

> **Note on the old shortcut:** Teams "Incoming Webhook" (Office 365 connector)
> is simpler but Microsoft is **retiring** Office 365 connectors, so we should
> use the Power Automate flow above rather than a legacy incoming webhook.

### Alternative — Email

If Teams/Power Automate licensing is a blocker, fall back to email:

- **Option A — Microsoft Graph API:** send as `adil@innovadevelopments.ca` from
  the existing M365 mailbox. Needs an Azure AD app registration with `Mail.Send`
  + admin consent.
- **Option B — Office 365 SMTP:** ⚠️ Microsoft is phasing out Basic Auth /
  SMTP AUTH; fragile. Not recommended.
- **Option C — Transactional service (Resend / Postmark / SendGrid):** verify
  the domain once (SPF/DKIM), simple API, best deliverability. Adds a
  third-party service.

**Recommendation:** Go with **Power Automate → Teams** if the tenant has (or can
get) the premium connector. Otherwise fall back to email **Option C (Resend)**
for the least friction.

**➡️ Decisions needed before build:**
1. Confirm Power Automate premium licensing is available on the tenant.
2. Which Teams channel should requests post to?
3. Who has admin access to build the flow / M365 tenant?

## 6. Google Maps Autocomplete — Prerequisites

- Requires a **Google Cloud project** with the **Places API** enabled and an
  **API key**.
- Key must be restricted (HTTP referrer restriction) to our domain to prevent
  abuse — the key is exposed client-side.
- Billing must be enabled on the Google Cloud project (Places has a free
  monthly credit; low-volume intake will likely stay within it).
- **Decision needed:** who owns/creates the Google Cloud project?

## 7. Proposed Tech Stack (draft — open to change)

Keeping it simple and cheap to host:

- **Framework:** Next.js (React) — one project handles both the form UI and a
  small server-side API route for sending email + handling uploads. Good mobile
  responsiveness with minimal effort.
- **Styling:** Tailwind CSS (fast, responsive).
- **Email:** per Section 5 decision.
- **Photo handling:** attach directly to the email, or upload to storage
  (e.g. S3/Cloud storage) and email links. For "up to 5 images" and small
  volume, attaching directly is simplest for v1.
- **Hosting:** **Vercel** ✅ (decided). Pairs naturally with Next.js, free tier,
  HTTPS + custom domain included. Deploy via Git integration (auto-deploy on
  push). Env vars (email keys, Maps key, recipient list) live in Vercel project
  settings.

**Vercel-specific notes:**
- Serverless API routes have a **request body size limit** (~4.5 MB on the
  default plan). Five photos could exceed this if attached directly through the
  API route. Two ways to handle it:
  - Compress/resize images client-side before upload (often enough for phone
    photos), **or**
  - Upload photos directly from the browser to storage (e.g. Vercel Blob / S3)
    and email links instead of attachments.
- Serverless function **execution timeout** is short on the free tier — sending
  email + handling uploads should be quick, but keep the handler lean.

## 8. Open Questions / Decisions Needed

1. **Delivery path:** Power Automate → Teams (preferred) vs. email fallback?
2. **Power Automate premium licensing** — is the HTTP-trigger connector
   available on the tenant? (Blocker for the preferred path.)
3. **Which Teams channel** should requests post to?
4. **Tenant admin:** who can build the flow / register an Azure app if we need email?
5. **Google Cloud:** who owns the project + API key for Maps autocomplete?
6. **Confirm Jeff's email spelling** (`innvoa` typo?) — only relevant if we do email.
7. **"New or Existing Client"** — confirm the intended options.
8. ~~**Contact fields**~~ — ✅ Decided: name, email, phone (all required).
9. ~~**Hosting**~~ — ✅ Decided: Vercel.

## 9. Rough Build Phases

1. **Setup & decisions** — resolve Section 8, provision email + Maps keys.
2. **Form UI** — build responsive form with all fields + validation.
3. **Photo upload** — up to 5 images with previews.
4. **Email sending** — server-side send to `adil@` only, with attachments.
5. **Polish** — spam protection, confirmation screen, mobile QA.
6. **Production** — enable Jeff + Dayton recipients, deploy, final testing.

## 10. Power Automate Integration — Working Config

> ⚠️ **The webhook URL below is a secret.** Anyone with it can post to the Teams
> channel. Do **not** commit it to a public repo. For production, store it as a
> Vercel **environment variable** (e.g. `POWER_AUTOMATE_WEBHOOK_URL`) and call it
> only from the server-side API route — never expose it to the browser. Rotate
> it (regenerate the flow trigger) if it leaks.

### Webhook URL (HTTP trigger, POST) — ✅ VERIFIED WORKING (2026-07-14)

```
https://defaultd4b21964731f4ce686a8ff8ee17fd2.15.environment.api.powerplatform.com:443/powerautomate/automations/direct/cu/20/workflows/48264cc311ed4c408ea9aa8cc8a42410/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=gir9onx_gIG9zWkMPm6igetI8WaDHa2El5ind7y3MXM
```

- Method: **POST**
- Content-Type: `application/json`
- Auth: **Shared Access Signature (SAS)** — the `sig` token in the URL authorizes
  the call. No OAuth header needed.
- Tested end-to-end: external `curl` POST → **HTTP 202** → card posted to Teams. ✅

**Config notes learned during setup:**
- The trigger's authentication had to be set to the **SAS / Shared Access**
  scheme (not the default OAuth), which regenerates the URL with the
  `sp`/`sv`/`sig` params.
- The flow must be **saved, published, and turned On** — "Test mode" alone
  reports the trigger as `Disabled` and returns HTTP 400.
- ⚠️ **Rotate this `sig` token before production** since it has appeared in chat
  logs / this file. Regenerate by toggling the trigger auth or recreating the URL.

### Sample payload (the JSON the web app POSTs)

```json
{
  "contactName": "Test Client",
  "email": "test@example.com",
  "phone": "403-555-0123",
  "clientType": "New",
  "siteAddress": "123 Main St SW, Calgary, AB",
  "yearBuilt": "1998",
  "description": "Kitchen renovation — replace cabinets and countertops.",
  "photoLinks": [
    "https://example.com/photo1.jpg",
    "https://example.com/photo2.jpg"
  ],
  "submittedAt": "2026-07-14T12:00:00Z"
}
```

Paste this into the trigger's **"Use sample payload to generate schema"** so the
field names show up as dynamic content.

### Adaptive Card JSON (for "Post card in a chat or channel")

```json
{
  "type": "AdaptiveCard",
  "$schema": "http://adaptivecards.io/schemas/adaptive-card.json",
  "version": "1.4",
  "body": [
    {
      "type": "TextBlock",
      "text": "🛠️ New Service Request",
      "weight": "Bolder",
      "size": "Large",
      "wrap": true
    },
    {
      "type": "TextBlock",
      "text": "Submitted @{triggerBody()?['submittedAt']}",
      "isSubtle": true,
      "spacing": "None",
      "wrap": true
    },
    {
      "type": "FactSet",
      "facts": [
        { "title": "Client Type", "value": "@{triggerBody()?['clientType']}" },
        { "title": "Name", "value": "@{triggerBody()?['contactName']}" },
        { "title": "Email", "value": "@{triggerBody()?['email']}" },
        { "title": "Phone", "value": "@{triggerBody()?['phone']}" },
        { "title": "Site Address", "value": "@{triggerBody()?['siteAddress']}" },
        { "title": "Year Built", "value": "@{triggerBody()?['yearBuilt']}" },
        { "title": "Photos", "value": "@{triggerBody()?['photoCount']}" }
      ]
    },
    {
      "type": "TextBlock",
      "text": "Work Description",
      "weight": "Bolder",
      "spacing": "Medium",
      "wrap": true
    },
    {
      "type": "TextBlock",
      "text": "@{triggerBody()?['description']}",
      "wrap": true
    },
    {
      "type": "ImageSet",
      "imageSize": "large",
      "images": @{triggerBody()?['photoImages']}
    }
  ],
  "actions": [
    {
      "type": "Action.OpenUrl",
      "title": "🔎 Open Request",
      "url": "@{triggerBody()?['detailLink']}"
    },
    {
      "type": "Action.OpenUrl",
      "title": "✉️ Email Client",
      "url": "mailto:@{triggerBody()?['email']}"
    }
  ]
}
```

**Detail-page link (added 2026-07-23).** `/api/submit` now sends `detailLink` —
the `/r/<id>` URL of the saved request (the same link the SMS carries). Like
`photoImages`, it isn't in the trigger's generated schema, but a `triggerBody()`
expression resolves it from the live payload regardless. The **"Open Request"**
button above opens the record's detail page. `detailLink` is always a valid URL
(it falls back to the site root if a record somehow wasn't saved), so the action
never breaks the card post. To enable it, add that first action to the card in
the Power Automate flow's **"Post card in a chat or channel"** step.

**Photos — DONE, working in prod (2026-07-14).** History of how we got here:
1. Original card hard-coded `photoLinks[0]`/`[1]` as button URLs → crashed on an
   empty array (`"array index '0' cannot be selected from empty array"`).
2. Tried a Power Automate **"Select"** action mapping `photoLinks` → image
   objects, referenced via `body('Select_Photos')` → repeated
   `"invalid reference to 'Select'"` errors (fragile: reference must match the
   action's internal name and sit before the Post-card step).
3. **Winning approach:** the app's `/api/submit` route now builds a `photoImages`
   array (ready-to-use Adaptive Card `Image` elements) from `photoLinks`. The
   card injects them directly with `"images": @{triggerBody()?['photoImages']}`.
   A **trigger** reference always resolves → no more errors, and the Select
   action was deleted from the flow. Empty array renders nothing (safe).

Note: `photoImages` / `photoCount` aren't in the trigger's generated schema, but
`triggerBody()` expressions resolve from the live payload regardless. The
`"images": @{...}` value is intentionally **unquoted** so the array injects at
runtime.

---

### Status (2026-07-14)
Core app is **built and live in production** (https://innovadevelopments.vercel.app/):
form → Vercel API → Power Automate → Teams card, **including photo upload** (via
Vercel Blob) rendering inline in the card. Delivery is Teams (not email).

Remaining before wide release:
- Spam protection (honeypot/captcha)
- Rotate the Power Automate `sig` token
- Add Jeff + Dayton to the Teams channel
- Optional: visual polish (Oswald/Arimo fonts + hero image), Google Maps autocomplete

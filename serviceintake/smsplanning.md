# Service Intake — SMS Alerts + Durable Records Planning

_Draft, 2026-07-23. Companion to `serviceintakescope.md`._

## Status — BUILT on `feature-sms-intake` (2026-07-23)

Built and verified locally end to end; **not merged, not deployed.** `main` still
runs the old Teams-only flow.

**What's in:**
- `db/migrations/001_intake.sql` — `intake` schema + `service_requests`, applied to the shared Neon project
- `lib/db.js` — insert / stamp-notifications / get-by-id (Neon HTTP driver)
- `lib/sms.js` — Twilio send + `formatIntakeSms` (GSM-7 safe, description truncated, photo count + `/r/<id>` link)
- `app/r/[id]/page.js` — capability-URL detail page (all fields, tap-to-call/email/map, photo thumbnails); 404 on unknown/malformed id
- `app/api/submit/route.js` — record-first: insert row → Teams + SMS in parallel (best-effort) → stamp delivery → return ok
- `jsconfig.json` — added the `@/` path alias serviceintake was missing
- Deps: `twilio`, `@neondatabase/serverless`

**Verified:** a submission saved a row (status `new`), posted the Teams card, delivered the SMS to the test number (2 segments, correct format), and the `/r/<id>` page rendered it with photos. Malformed/unknown ids 404.

**Before deploy:**
- Set the new env vars in Vercel (`DATABASE_URL`, the three `TWILIO_*`, `SERVICE_SMS_RECIPIENTS`, `NEXT_PUBLIC_SITE_URL=https://innovadevelopments.vercel.app`). Until deployed, the SMS link (prod URL) 404s.
- Add real team numbers to `SERVICE_SMS_RECIPIENTS` when ready (currently just the test number).
- One test row (`Jane Smith`) exists in the DB from verification — harmless demo data.

---

## 1. Goal

Two things, and they're related:

1. **Save every intake submission to a database** so there's a durable record —
   an ID, a timestamp, a status — instead of the Teams post being the only copy.
2. When a submission comes in, notify the team by **SMS** in addition to the
   existing Teams card. Start by texting one test number (**587-436-4125**),
   then expand to the real team.

The SMS is an **internal team alert** — we text *Innova staff*, not the client
who submitted the form. (A client-facing confirmation text is a possible later
feature; see §8.)

> **Why these belong together.** This is the ResQ "Tier 2" idea from
> `notes/resq-app-notes.md`: *give every submission an ID and a status.* Once a
> row is saved first, Teams and SMS stop being the delivery mechanism and become
> best-effort *notifications on top of a durable record* — which is the same
> record-first shape we used for the contact oracle. If a notification fails, the
> request isn't lost; it's still in the database.

## 2. Where we are today

```
Form → POST /api/submit → Power Automate webhook → Adaptive Card in Teams
                        ↳ (photos already uploaded to Vercel Blob, passed as links)
```

`/api/submit` (`app/api/submit/route.js`) validates the body, shapes a payload,
and POSTs it to the Power Automate webhook. If Power Automate returns non-2xx,
the whole request fails with 502. There is **no database** — the Teams post *is*
the delivery.

## 3. Database infrastructure — what we have

Checked 2026-07-23. We already run **two separate Neon Postgres databases**, both
on Neon (us-west-2):

| Database | Endpoint | Used by | Notes |
|---|---|---|---|
| **Contact oracle** | `ep-twili…` / `neondb` | `contactlistwebapp` | The DB set up for the contact-list re-upload feature. Live, but on the unmerged `feature-reupload` branch. Holds `contacts`, `job_contacts`, etc. |
| odysseymovie | `ep-dark…` / `neondb` | `odysseymovie` | A separate, unrelated Neon project. |
| **serviceintake** | — | — | **No database today.** |

So the realistic choice is: **put intake records in the contact-oracle Neon
project** (that's what "the Neon DB we set up for contactlist" refers to), or
stand up a third Neon project just for intake.

### Where should intake records live? (decision)

| Option | Trade-off |
|---|---|
| **A. Same Neon project as the contact oracle, own schema (recommended)** | One project, one bill, one connection string family; I already have a working `@neondatabase/serverless` client for it. Put intake tables in a dedicated `intake` schema (or clearly-prefixed tables) so the public form's writes never touch the `contacts` tables. |
| **B. New dedicated Neon project for serviceintake** | Hard isolation — a public, internet-facing form gets its own blast radius, fully separate from the internal contact oracle. Cost is a second project + connection string to manage. |

**DECIDED 2026-07-23: Option A** — shared Neon project, dedicated `intake`
schema. The schema boundary keeps the public form's writes clear of the
`contacts` tables while staying on one project / one connection string.

> Note: the contact oracle DB currently lives on the unmerged `feature-reupload`
> branch. Pointing serviceintake at the same Neon project is independent of that
> branch (it's the *database* we share, not the code), so this isn't blocked by
> the merge.

### Proposed schema

```sql
create schema if not exists intake;

create table intake.service_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  -- submitted fields
  contact_name  text not null,
  email         text not null,
  phone         text not null,
  client_type   text not null,          -- New | Existing
  site_address  text not null,
  year_built    text,
  description   text not null,
  photo_links   jsonb not null default '[]',
  -- workflow (the ResQ "next action" idea)
  status        text not null default 'new',   -- new | contacted | scheduled | closed | spam
  -- delivery observability: did each channel go out?
  teams_sent_at timestamptz,
  sms_sent_at   timestamptz,
  notify_error  text,
  source        text not null default 'web',
  user_agent    text,
  ip            text
);

create index on intake.service_requests (created_at desc);
create index on intake.service_requests (status);
```

`status` is what turns this from a log into a worklist — the same
next-action framing from the ResQ notes (`new → contacted → scheduled → closed`,
plus `spam`). A tiny admin view can come later; v1 just needs the rows saved.

### Revised flow (record-first)

```
Form → /api/submit → validate
                   → INSERT intake.service_requests   ← durable record
                   → best-effort, in parallel:
                        • Power Automate → Teams card
                        • Twilio → SMS to the team
                   → stamp teams_sent_at / sms_sent_at (or notify_error)
                   → 200 ok
```

This flips today's failure model in a good way: **the DB write is now the thing
that must succeed.** If the insert works, the request is safe and we return ok
even if Teams *and* SMS both fail — the row is there to act on later. If the
insert fails, fall back to today's behaviour (still try Teams; return 502 only if
we truly couldn't record the request anywhere). See §6 for the SMS specifics.

### Request-detail page (the SMS link target)

**DECIDED 2026-07-23: capability URL, no login.** The SMS links to
`/r/<id>` where `<id>` is the row's unguessable UUID; possession of the link is
the access grant. No login to build, consistent with the demo posture taken on
contactlist. Photos are already public+permanent via Vercel Blob, so the page's
only added exposure is the *aggregated* contact info, which the unguessable id
adequately gates for this use. Can be upgraded to a password gate later if it
ever leaves demo status.

- Route: `serviceintake/app/r/[id]/page.js` — server component, reads the row
  from Neon by id, renders all fields + photo thumbnails. 404 on unknown id.
- The SMS `Details:` link points here.

## 4. The Twilio account (already proven)

Reusing the same Twilio account as the `odysseymovie` project — verified active
today (full account, not trial). Its `lib/twilio.ts` is a clean, working
reference we can copy the pattern from.

- Env vars: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`
- `twilio` npm package, called server-side from an API route
- The FROM number is a NANP (+1) number that already sends successfully to
  Canadian mobiles, so texting a Calgary (587) number should just work.

⚠️ **Shared number caveat:** this Twilio number is also odysseymovie's sender.
Sharing is fine for outbound alerts, but *replies* and STOP/opt-out state are
shared across both apps. Since this is a one-way internal alert we don't read
replies, so low risk — but worth knowing. If it ever matters, provision a
second Twilio number for Innova.

## 5. The core decision: where does the SMS get sent from?

| Option | How | Trade-off |
|---|---|---|
| **A. From `/api/submit` (recommended)** | After (or alongside) the Power Automate POST, call Twilio directly with the `twilio` package — same pattern as odysseymovie. | We own the message wording, it's independent of Power Automate licensing, and we already have working code to copy. One more secret set in Vercel. |
| **B. From Power Automate** | Add an SMS action (Twilio connector) inside the existing flow. | Keeps all notification logic in one place, but the Twilio connector is a **premium** Power Automate connector (same licensing worry flagged in `serviceintakescope.md` §5), and message formatting lives in the flow UI, which is harder to version. |

**DECIDED 2026-07-23: Option A** — send directly from `/api/submit`. Mirrors a
pattern we've already shipped, avoids another premium-connector dependency, and
keeps Teams and SMS as two independent best-effort sends.

## 6. Proposed design (Option A)

### Recipients — an env list, not hard-coded

Mirror the email-recipients approach in `serviceintakescope.md §2`: keep the
list in config so adding Jeff/Dayton later is a one-line change, not a deploy of
new code.

```
SERVICE_SMS_RECIPIENTS=+15874364125          # comma-separated; start with the test number
```

Parse on comma, trim, skip blanks. Text each recipient (a small fan-out).

### Message content

SMS is short and plain-text — **no photos** (MMS costs more and adds little when
the Teams card already has them). Keep it to the essentials, and point to Teams
for the full detail + photos:

```
🛠️ New Innova service request
Jane Smith · New client
403-555-0123
214 12a St NE, Calgary
"Kitchen reno — replace cabinets and coun…"
Full details + photos in Teams.
```

Notes:
- Truncate the description (~80 chars) so the text stays 1–2 segments.
- Twilio bills per 160-char segment (70 if any emoji/unicode pushes it to
  UCS-2). A couple of segments per alert is negligible, but keep it tight.
- Include city/address since "which site" is the first thing the team asks.

### Failure handling — with a DB, notifications are best-effort

Once the row is saved first (§3), both Teams and SMS are best-effort
notifications on top of a durable record. A Twilio *or* Power Automate failure
must not fail the request — the request is already recorded and can be acted on
from the database.

- **DB insert succeeds → return 200**, then fire Teams + SMS in parallel and
  stamp `teams_sent_at` / `sms_sent_at` (or `notify_error`) as each resolves.
  If both notifications fail, the row is still there — surface it in an admin
  view / a retry later.
- **DB insert fails** → fall back to today's behaviour: still attempt Teams so a
  notification goes out, and return 502 only if we couldn't record the request
  anywhere. Losing the row silently is the one outcome to avoid.

This is strictly better than today, where a Power Automate hiccup means the
request evaporates.

### Shape of the change

- Add `serviceintake/lib/db.js` — `@neondatabase/serverless` client + an
  `insertServiceRequest()` helper. Same driver/pattern as `contactlistwebapp`.
- Add `serviceintake/lib/sms.js` — `isSmsConfigured()`, `sendSMS(to, body)`,
  `formatIntakeSms(payload)`. Ported from odysseymovie's `lib/twilio.ts`,
  trimmed to what we need.
- In `/api/submit`: validate → insert the row → fan out Teams + SMS with
  `Promise.allSettled`, each `.catch()`-logged and independent → stamp delivery
  columns → return ok. Keep the two channels from blocking each other.
- Add `twilio` and `@neondatabase/serverless` to `serviceintake/package.json`.
- Env: `DATABASE_URL`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
  `TWILIO_FROM_NUMBER`, `SERVICE_SMS_RECIPIENTS` — in `.env.local` and Vercel.
  (`DATABASE_URL` = the contact-oracle Neon project, per the §3 decision.)

## 7. Test plan

1. Add the four env vars locally, with `SERVICE_SMS_RECIPIENTS=+15874364125`.
2. Submit a test intake through the real form.
3. Confirm: Teams card posts **and** the test phone gets the SMS.
4. Check the message renders cleanly (segments, truncation, the address line).
5. Only after it looks right: add the real team numbers and deploy.

We can also send a single throwaway test text before wiring the form, to
confirm the number reaches 587-436-4125 at all — cheap sanity check.

## 8. Open questions

1. **Where do intake records live? (§3)** Same Neon project as the contact
   oracle with an `intake` schema (recommended), or a separate Neon project for
   hard isolation of the public form? *This is the one that gates building.*
2. **Recipients (team):** who gets the alert once we're past the test number —
   Adil only, or Adil + Jeff + Dayton? (Same "enable at production" question as
   the email recipients in the scope doc.)
3. **Client confirmation text?** Out of scope for v1 (we're alerting the team).
   But we *have* the submitter's phone — do we ever want to text *them* a
   "got your request, we'll be in touch" receipt? That crosses into
   customer-facing messaging (opt-out/compliance matters more there).
4. **Message fields:** is the draft in §6 the right content? Anything to add
   (year built? client email?) or cut?
5. **Send even if Teams/DB fails?** Confirm the §6 model — Teams stays primary,
   SMS is a best-effort add-on.
6. **Dedicated Innova number?** Fine to share odysseymovie's sender for now
   given it's one-way. Provision a separate number if/when replies matter.

## 9. Risks / notes

- **A2P / 10DLC:** US A2P messaging needs 10DLC registration. This number
  already sends via odysseymovie, so it's presumably handled — but Innova adding
  volume to it is worth a glance if throughput ever grows. For internal,
  low-volume alerts this is not a v1 blocker.
- **Cost:** pennies per segment. Immaterial at intake volume.
- **Secrets:** the auth token is a real credential — server-side only, never
  `NEXT_PUBLIC_*`, gitignored locally, set as Vercel env vars. Same discipline
  as the Power Automate webhook URL.

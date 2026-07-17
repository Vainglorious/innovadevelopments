# Contact List Web App — Planning

**Goal:** A simple Vercel-hosted web app where a user picks a JobTread project from a
dropdown and clicks a button to download a formatted **Contact List** as **`.xlsx`** and
**`.pdf`** — the same 6-sheet format we already produce by hand in `notes/`.

---

## 0. The big question first: do we need AI (Claude) for this?

**No. Not at runtime.** This is the important thing to be clear about.

The work we did "by hand above" is *already fully scripted*. Two plain Python scripts in
`innovadevelopments/notes/` do the whole job with **no AI at all**:

- **`jt_contacts.py`** — calls the JobTread API, pulls the job's documents + contacts, and
  writes the 6 CSV sheets (Master, Owner, Owner Suppliers, Vendors, Innova Team, Notes).
- **`build_outputs.py`** — reads those 6 CSVs and renders the formatted `.xlsx` (6 tabs) and
  the landscape `.pdf`.

JobTread's data **is** structured (it's a real database behind a GraphQL-like API), so the
extraction is deterministic: "find documents where `type = vendorOrder` and
`status = approved`, group by vendor account, pull each account's contacts, format the phone
numbers." That's ordinary code — a pipeline — not AI.

**Where AI actually helped (one time only):**
- Figuring out *which* JobTread fields map to which columns (the design decision).
- Writing the Innova Team template and the human-readable Notes/caveats.
- Judgement calls like "scope-of-work text → the Role/Context column."

Those decisions are now **baked into the scripts**. So the app can be a pure, deterministic
pipeline. We do **not** need to call Claude every time someone generates a list.

> **Rule of thumb:** if the data is structured and the mapping is fixed → script it.
> Only reach for an AI call when input is messy/free-text and the mapping is fuzzy.
> (See "Optional AI enhancements" at the end for the few spots where AI *could* add value.)

---

## 1. What the app does (user's view)

1. User opens the site (protected — see Auth below).
2. Page loads a **dropdown of jobs** pulled live from JobTread (name + job number).
3. User selects a project → clicks **"Generate Contact List."**
4. App shows a short "working…" state, then presents **two download buttons**: `.xlsx` and `.pdf`.
   (Optionally a preview of the Master sheet on-screen.)

That's the entire product. Everything else is plumbing.

---

## 2. How it works (system view)

```
Browser (dropdown + button)
   │  1. GET /api/jobs                → list of jobs for the dropdown
   │  2. POST /api/generate {jobId}   → triggers the pipeline
   ▼
Vercel Serverless Function (the pipeline — no AI)
   │  a. Query JobTread API (documents + contacts)     [jt_contacts.py logic]
   │  b. Build the 6 sheets in memory
   │  c. Render .xlsx (6 tabs) + .pdf (landscape)       [build_outputs.py logic]
   ▼
Return files → browser downloads .xlsx and .pdf
```

The two existing Python scripts already contain steps (a)–(c). The app is essentially:
**"put a dropdown + button in front of the scripts, run them on Vercel, stream back the files."**

---

## 3. Tech stack (mirror the existing `serviceintake` app)

The repo already has a working Next.js app at `innovadevelopments/serviceintake` deployed to
the Vercel project `innovadevelopments`. We should copy that setup for consistency:

- **Next.js 14 (App Router)** + **React 18** + **TypeScript**
- **Tailwind CSS** for styling
- **Vercel** for hosting + serverless API routes
- **`@vercel/blob`** (already a dependency in serviceintake) if we want to cache/serve
  generated files, though streaming them straight back is simpler and probably enough.

### Language decision: port the Python to TypeScript (recommended)

There are two viable ways to run the existing logic on Vercel:

| Option | How | Trade-off |
|---|---|---|
| **A. Port to TypeScript (recommended)** | Rewrite the ~200 lines of `jt_contacts.py` + `build_outputs.py` in TS as API routes. XLSX via **`exceljs`**, PDF via **`pdf-lib`** or **`@react-pdf/renderer`**. | One language, one runtime, matches `serviceintake`, cleanest Vercel deploy, fastest cold starts. Small upfront rewrite. |
| **B. Keep Python** | Deploy the scripts as **Vercel Python Serverless Functions** (`api/*.py`), keep `openpyxl` + `fpdf2`. | Reuse code as-is, but mixes two runtimes, heavier cold starts, and the Next front-end + Python back-end is more awkward to wire and deploy. |

**Recommendation: Option A.** The scripts are short and the logic is simple; porting to TS is
a few hours and gives us a clean single-stack app. Keep the Python scripts in `notes/` as the
reference implementation / source of truth for the mapping.

---

## 4. JobTread integration details (already proven)

From `notes/2026-05-19-jobthread.txt` and `jt_contacts.py`, these are known-working:

- **Endpoint:** `POST https://api.jobtread.com/pave`
- **Auth:** grant key in the request **body** at `query.$.grantKey` (NOT a header).
  Stored server-side only as `JOB_THREAD_API_KEY` (see Secrets below). Grant keys expire after
  ~3 months of inactivity — plan a refresh path.
- **Query shape:** "Pave" — GraphQL-like nested objects.
- **Jobs list (for the dropdown):** query the organization's jobs (135 exist), returning
  `{ id, name, number }` per job. Paginate via `nextPage`.
- **Per-job data (for generation):** documents (`type`, `status`, `account{id,name,type}`),
  document descriptions (for scope-of-work), and per-account `contacts` (name, title,
  email/phone via `customFieldValues`). All already implemented in `jt_contacts.py`.

---

## 5. Secrets & config

- **Do not hard-code the grant key.** In `serviceintake`/`jt_contacts.py` today it's read from
  `innovadevelopments/.env` (`JOB_THREAD_API_KEY`). For the web app, store it as a **Vercel
  Environment Variable** (`JOB_THREAD_API_KEY`), server-side only, never exposed to the browser.
- `.env.local` (already present at repo root, Vercel-managed) holds the Vercel OIDC token for
  local dev — that's Vercel's own auth, separate from the JobTread key.
- Keep `.env` / `.env.local` gitignored (they already are).

---

## 6. Auth (keep it simple, but don't leave it open)

The JobTread grant key controls access to real company data, so the app must not be public.
Cheapest good-enough options:

- **Vercel password protection** (Pro plan — the account is on Pro per the OIDC token) — a
  single toggle, no code. Recommended for v1.
- Or a lightweight shared-password gate / Vercel Access, upgradable to real SSO later.

---

## 7. File/route layout (proposed)

```
contactlistwebapp/
├── planning.md                 ← this file
├── package.json                ← copy from serviceintake, add exceljs + pdf-lib
├── next.config.mjs
├── tailwind.config.js
├── app/
│   ├── page.tsx                ← dropdown + Generate button + download UI
│   ├── layout.tsx
│   └── api/
│       ├── jobs/route.ts       ← GET: list jobs for the dropdown
│       └── generate/route.ts   ← POST {jobId}: run pipeline, return .xlsx + .pdf
├── lib/
│   ├── jobtread.ts             ← Pave API client (port of jt_contacts.py calls)
│   ├── contacts.ts             ← build the 6 sheets (port of jt_contacts.py logic)
│   ├── xlsx.ts                 ← render .xlsx via exceljs (port of build_outputs.py)
│   └── pdf.ts                  ← render .pdf via pdf-lib (port of build_outputs.py)
└── public/                     ← logo etc.
```

---

## 8. Build plan (phased)

**Phase 1 — Scaffold (½ day)**
- Copy the `serviceintake` Next.js/Tailwind/Vercel setup into `contactlistwebapp`.
- Add `exceljs` and `pdf-lib` to `package.json`.
- Add `JOB_THREAD_API_KEY` to Vercel env. Confirm `next dev` runs.

**Phase 2 — JobTread client + jobs dropdown (½ day)**
- Port the Pave API calls to `lib/jobtread.ts`.
- `GET /api/jobs` → returns `[{id, name, number}]`.
- Front-end dropdown populated from that route.

**Phase 3 — Generation pipeline (1 day)**
- Port `jt_contacts.py` sheet-building into `lib/contacts.ts` (returns the 6 sheets in memory).
- Port `build_outputs.py` into `lib/xlsx.ts` (exceljs) and `lib/pdf.ts` (pdf-lib), matching the
  navy header / 6-tab / landscape formatting.
- `POST /api/generate` → runs pipeline, returns both files.

**Phase 4 — UI polish + download (½ day)**
- "Working…" state, two download buttons, optional Master-sheet preview, error handling
  (e.g. empty Owner-Suppliers), Innova logo/branding.

**Phase 5 — Auth + deploy (½ day)**
- Turn on Vercel password protection, deploy, smoke-test against 2–3 real jobs
  (Crowfoot Crossing, Leopold's, Canna Cabana Ogden) and diff output vs. the versions in `notes/`.

*Rough total: ~3 focused days for a clean v1.*

---

## 9. Known gaps / decisions to make

- **Empty sheets:** the current PDF **drops** any group sheet with no data rows, so today's
  PDFs are **5 pages** (Owner-Suppliers is empty in all 3 jobs) while the XLSX keeps all 6 tabs.
  Decide: force all 6 PDF pages, or keep skipping empties? (Currently: skip.)
- **Data not in JobTread:** Landlord, Consultant, and Owner-Supplier groups don't exist in
  JobTread and come out blank. If we want them, we'd need a manual-entry step in the UI or
  another data source.
- **Grant key expiry:** keys die after ~3 months idle — need a documented refresh procedure.
- **Caching:** regenerate on every click (simple) vs. cache generated files in Vercel Blob
  (faster repeat downloads). Start simple.

---

## 10. Optional AI enhancements (later, not required for v1)

The core app needs no AI. But a few genuinely fuzzy spots *could* use a Claude API call later:

- **Cleaning messy contact data** — dedupe near-duplicate people, normalize inconsistent
  company names, infer a missing role from free-text notes.
- **Auto-writing the Notes sheet** — a natural-language project summary instead of the template.
- **Filling non-JobTread groups** — parse an uploaded PDF/email to extract consultant or
  landlord contacts (messy input → structured rows is exactly where AI earns its keep).

These are add-ons. **v1 is a deterministic pipeline: dropdown → button → JobTread API → files.**

# Contact List Web App

Pick a JobTread project from a dropdown and generate a formatted **Contact List** as
`.xlsx` (6 tabs) and landscape `.pdf` — the same format we build by hand in `../notes/`.

**No AI at runtime.** This is a deterministic pipeline: it reads structured data from the
JobTread API and renders the files. See `planning.md` for the full rationale.

## Stack

- Next.js 14 (App Router) + React 18, plain JS — mirrors the sibling `serviceintake` app
- Tailwind CSS
- `exceljs` for the workbook, `pdfkit` for the PDF
- Deploys to Vercel (project `innovadevelopments`)

## How it works

```
app/page.js            Dropdown of projects + Generate button + downloads/preview
app/api/jobs           GET  → list JobTread jobs for the dropdown
app/api/generate       POST {jobId} → runs the pipeline, returns xlsx + pdf (base64) + preview
lib/jobtread.js        JobTread "Pave" API client (ported from ../notes/jt_contacts.py)
lib/contacts.js        Builds the 6 sheets from a job's documents + contacts
lib/xlsx.js            Renders the workbook (ported from ../notes/build_outputs.py)
lib/pdf.js             Renders the PDF   (ported from ../notes/build_outputs.py)
lib/format.js          Phone / scope-of-work helpers
```

The two Python scripts in `../notes/` remain the reference implementation. The logic here is a
faithful TypeScript-free JS port — verified to produce byte-identical data to the hand-made
Leopold's Tavern Fort Saskatchewan output.

## Local dev

```bash
cp .env.example .env.local          # then paste the JobTread grant key
npm install
npm run dev                         # http://localhost:3000
```

`JOB_THREAD_API_KEY` is the JobTread Pave grant key (same one in `../.env`). It is used
server-side only and is **never** exposed to the browser. Grant keys expire after ~3 months of
inactivity — refresh from JobTread when calls start failing with auth errors.

## Deploy (Vercel)

1. Add `JOB_THREAD_API_KEY` as a Vercel Environment Variable (Production + Preview).
2. Deploy (the repo is already linked to the `innovadevelopments` Vercel project).
3. Turn on **Vercel password protection** so the app isn't public — it exposes company data.

## Known behaviour

- The PDF **skips group sheets that have no data rows**, so today's outputs are **5 pages**
  (Owner-Suppliers is empty in JobTread) while the XLSX keeps all **6 tabs**. This matches the
  hand-made files. To force a 6th PDF page, remove the empty-sheet skip in `lib/pdf.js`.
- Landlord, Consultant, and Owner-Supplier groups don't exist in JobTread and come out blank.

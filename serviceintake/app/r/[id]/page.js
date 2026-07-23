// Request-detail page — the target of the SMS "Details:" link.
//
// Capability URL: the unguessable id in the path is the access grant, so there's
// no login (see smsplanning.md). Server component: reads the row from Neon and
// renders it. Unknown / malformed id -> 404.
import { notFound } from "next/navigation";
import { getServiceRequest } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function fmtDateTime(ts) {
  if (!ts) return "";
  try {
    return new Date(ts).toLocaleString("en-CA", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return String(ts);
  }
}

function Field({ label, children }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
        {label}
      </dt>
      <dd className="mt-0.5 text-slate-800">{children || "—"}</dd>
    </div>
  );
}

export default async function RequestDetail({ params }) {
  const { id } = await params;
  const r = await getServiceRequest(id);
  if (!r) notFound();

  const photos = Array.isArray(r.photo_links) ? r.photo_links : [];

  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <header className="mb-6">
        <p className="font-heading text-sm font-medium uppercase tracking-widest text-brand-accent">
          Innova Developments
        </p>
        <h1 className="mt-1 font-heading text-2xl font-bold text-brand sm:text-3xl">
          Service Request
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Submitted {fmtDateTime(r.created_at)}
          {r.status ? (
            <span className="ml-2 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-slate-600">
              {r.status}
            </span>
          ) : null}
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Contact">{r.contact_name}</Field>
          <Field label="Client type">{r.client_type}</Field>
          <Field label="Phone">
            <a href={`tel:${r.phone}`} className="text-brand-accent underline underline-offset-2">
              {r.phone}
            </a>
          </Field>
          <Field label="Email">
            <a href={`mailto:${r.email}`} className="text-brand-accent underline underline-offset-2 break-all">
              {r.email}
            </a>
          </Field>
          <Field label="Site address">
            <a
              href={`https://maps.google.com/?q=${encodeURIComponent(r.site_address)}`}
              target="_blank"
              rel="noreferrer"
              className="text-brand-accent underline underline-offset-2"
            >
              {r.site_address}
            </a>
          </Field>
          <Field label="Year built">{r.year_built}</Field>
        </dl>

        <div className="mt-5">
          <dt className="text-xs font-semibold uppercase tracking-wide text-slate-400">
            Work described
          </dt>
          <dd className="mt-1 whitespace-pre-wrap text-slate-800">{r.description}</dd>
        </div>
      </section>

      <section className="mt-6">
        <h2 className="font-heading text-sm font-semibold uppercase tracking-wide text-slate-500">
          Photos ({photos.length})
        </h2>
        {photos.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No photos submitted.</p>
        ) : (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {photos.map((url, i) => (
              <a
                key={i}
                href={url}
                target="_blank"
                rel="noreferrer"
                className="block overflow-hidden rounded-lg border border-slate-200 bg-white"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={url}
                  alt={`Submitted photo ${i + 1}`}
                  className="h-32 w-full object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </section>

      <p className="mt-8 text-center text-xs text-slate-400">
        Internal record. This link was sent to the Innova team.
      </p>
    </main>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";

function base64ToBlob(b64, type) {
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type });
}

function download(b64, type, filename) {
  const url = URL.createObjectURL(base64ToBlob(b64, type));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export default function Home() {
  const [jobs, setJobs] = useState([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [filter, setFilter] = useState("");
  const [city, setCity] = useState(""); // "" = all cities
  const [selectedId, setSelectedId] = useState("");

  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState(null);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/jobs");
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Failed to load projects");
        if (alive) setJobs(data.jobs || []);
      } catch (err) {
        if (alive) setJobsError(err.message || "Failed to load projects");
      } finally {
        if (alive) setLoadingJobs(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Cities present in the job list, with a count each, most projects first.
  const cities = useMemo(() => {
    const counts = new Map();
    for (const j of jobs) {
      const c = (j.city || "").trim();
      if (!c) continue;
      counts.set(c, (counts.get(c) || 0) + 1);
    }
    return [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || a[0].localeCompare(b[0])
    );
  }, [jobs]);

  const withoutCity = useMemo(
    () => jobs.filter((j) => !(j.city || "").trim()).length,
    [jobs]
  );

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    // Multi-word search: every word must match somewhere, so "leopolds calgary"
    // narrows instead of returning nothing.
    const terms = q ? q.split(/\s+/) : [];

    return jobs.filter((j) => {
      if (city && (j.city || "") !== city) return false;
      if (!terms.length) return true;

      const haystack = [j.name, j.number, j.address, j.city, j.state]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return terms.every((t) => haystack.includes(t));
    });
  }, [jobs, filter, city]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedId) || null,
    [jobs, selectedId]
  );

  // If filtering hides the selected project, drop the selection. Otherwise the
  // choice stays invisibly active and Generate would build the wrong list.
  useEffect(() => {
    if (selectedId && !filtered.some((j) => j.id === selectedId)) {
      setSelectedId("");
    }
  }, [filtered, selectedId]);

  async function generate() {
    if (!selectedJob) return;
    setGenerating(true);
    setGenError("");
    setResult(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: selectedJob.id,
          jobNumber: selectedJob.number,
          jobName: selectedJob.name,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to generate");
      setResult(data);
    } catch (err) {
      setGenError(err.message || "Failed to generate contact list");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <header className="mb-8">
        <p className="font-heading text-sm font-medium uppercase tracking-widest text-brand-accent">
          Innova Developments
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold text-brand sm:text-4xl">
          Contact List Generator
        </h1>
        <p className="mt-2 max-w-prose text-slate-600">
          Pick a JobTread project and generate a formatted contact list — the
          same 6-sheet format we build by hand — as an <b>.xlsx</b> workbook and
          a landscape <b>.pdf</b>.
        </p>
      </header>

      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-sm font-semibold text-slate-700">
          Project
        </label>

        {loadingJobs ? (
          <p className="mt-2 text-sm text-slate-500">Loading projects…</p>
        ) : jobsError ? (
          <p className="mt-2 text-sm text-red-600">{jobsError}</p>
        ) : (
          <>
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Search name, number, city, or address…"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30"
              />
              <select
                value={city}
                onChange={(e) => setCity(e.target.value)}
                aria-label="Filter by city"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30 sm:w-56"
              >
                <option value="">All cities</option>
                {cities.map(([c, n]) => (
                  <option key={c} value={c}>
                    {c} ({n})
                  </option>
                ))}
              </select>
            </div>

            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              size={8}
              className="mt-3 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30"
            >
              {filtered.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} {j.number ? `(${j.number})` : ""}
                  {j.city ? ` — ${j.city}` : ""}
                </option>
              ))}
            </select>

            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-slate-400">
              <span>
                {filtered.length} of {jobs.length} projects
              </span>
              {(filter || city) && (
                <button
                  type="button"
                  onClick={() => {
                    setFilter("");
                    setCity("");
                  }}
                  className="text-brand-accent underline underline-offset-2 hover:text-brand"
                >
                  Clear filters
                </button>
              )}
              {withoutCity > 0 && !city && (
                <span>{withoutCity} without a city set in JobTread</span>
              )}
            </div>

            {filtered.length === 0 && (
              <p className="mt-2 text-sm text-slate-500">
                No projects match{city ? ` in ${city}` : ""}
                {filter ? ` for “${filter}”` : ""}.
              </p>
            )}
          </>
        )}

        <button
          onClick={generate}
          disabled={!selectedJob || generating}
          className="mt-5 inline-flex items-center justify-center rounded-lg bg-brand px-5 py-2.5 font-heading text-sm font-semibold uppercase tracking-wide text-white transition hover:bg-brand-light disabled:cursor-not-allowed disabled:opacity-40"
        >
          {generating ? "Generating…" : "Generate Contact List"}
        </button>

        {genError && <p className="mt-3 text-sm text-red-600">{genError}</p>}
      </section>

      {result && (
        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-heading text-lg font-semibold text-brand">
            {result.filename}
          </h2>
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={() =>
                download(result.xlsx, XLSX_MIME, `${result.filename}.xlsx`)
              }
              className="rounded-lg border border-brand bg-white px-4 py-2 text-sm font-semibold text-brand transition hover:bg-slate-50"
            >
              Download .xlsx
            </button>
            <button
              onClick={() =>
                download(result.pdf, "application/pdf", `${result.filename}.pdf`)
              }
              className="rounded-lg border border-brand bg-white px-4 py-2 text-sm font-semibold text-brand transition hover:bg-slate-50"
            >
              Download .pdf
            </button>
          </div>

          {result.preview && (
            <div className="mt-5 overflow-x-auto">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Master sheet preview
              </p>
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr>
                    {result.preview.header.map((h, i) => (
                      <th
                        key={i}
                        className="border border-slate-200 bg-brand px-2 py-1 font-semibold text-white"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.preview.rows.map((r, ri) => (
                    <tr key={ri} className={ri % 2 ? "bg-slate-50" : ""}>
                      {result.preview.header.map((_, ci) => (
                        <td
                          key={ci}
                          className="border border-slate-200 px-2 py-1 align-top text-slate-700"
                        >
                          {r[ci] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <footer className="mt-10 text-center text-xs text-slate-400">
        Data pulled live from JobTread. Owner-Suppliers, Landlord, and Consultant
        groups are not in JobTread and appear blank.
      </footer>
    </main>
  );
}

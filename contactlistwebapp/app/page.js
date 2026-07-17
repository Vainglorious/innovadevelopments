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

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return jobs;
    return jobs.filter(
      (j) =>
        j.name.toLowerCase().includes(q) ||
        String(j.number).toLowerCase().includes(q) ||
        (j.address || "").toLowerCase().includes(q)
    );
  }, [jobs, filter]);

  const selectedJob = useMemo(
    () => jobs.find((j) => j.id === selectedId) || null,
    [jobs, selectedId]
  );

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
            <input
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name, number, or address…"
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30"
            />
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              size={8}
              className="mt-3 w-full rounded-lg border border-slate-300 px-2 py-2 text-sm outline-none focus:border-brand-accent focus:ring-2 focus:ring-brand-accent/30"
            >
              {filtered.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.name} {j.number ? `(${j.number})` : ""}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              {filtered.length} of {jobs.length} projects
            </p>
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

"use client";

import { useMemo, useState } from "react";
import { upload } from "@vercel/blob/client";

const MAX_PHOTOS = 5;
const MAX_PHOTO_MB = 10;

export default function Home() {
  const [form, setForm] = useState({
    contactName: "",
    email: "",
    phone: "",
    clientType: "",
    siteAddress: "",
    yearBuilt: "",
    description: "",
  });
  const [photos, setPhotos] = useState([]); // { file, url }
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState("idle"); // idle | submitting | success | error
  const [phase, setPhase] = useState(""); // "uploading" | "sending"
  const [serverError, setServerError] = useState("");

  const years = useMemo(() => {
    // Most recent 10 years only (e.g. 2026 down to 2017).
    const current = new Date().getFullYear();
    const list = [];
    for (let y = current; y > current - 10; y--) list.push(y);
    return list;
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
  }

  function onPhotosSelected(e) {
    const incoming = Array.from(e.target.files || []);
    const next = [...photos];
    const rejected = [];

    for (const file of incoming) {
      if (next.length >= MAX_PHOTOS) {
        rejected.push(`${file.name} (max ${MAX_PHOTOS} photos)`);
        continue;
      }
      if (!file.type.startsWith("image/")) {
        rejected.push(`${file.name} (not an image)`);
        continue;
      }
      if (file.size > MAX_PHOTO_MB * 1024 * 1024) {
        rejected.push(`${file.name} (over ${MAX_PHOTO_MB}MB)`);
        continue;
      }
      next.push({ file, url: URL.createObjectURL(file) });
    }

    setPhotos(next);
    setErrors((prev) => ({
      ...prev,
      photos: rejected.length ? `Skipped: ${rejected.join(", ")}` : undefined,
    }));
    // reset input so the same file can be re-picked if removed
    e.target.value = "";
  }

  function removePhoto(index) {
    setPhotos((prev) => {
      const copy = [...prev];
      const [removed] = copy.splice(index, 1);
      if (removed) URL.revokeObjectURL(removed.url);
      return copy;
    });
  }

  function validate() {
    const next = {};
    if (!form.contactName.trim()) next.contactName = "Please enter your name.";
    if (!form.email.trim()) {
      next.email = "Please enter your email.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
      next.email = "Please enter a valid email address.";
    }
    if (!form.phone.trim()) next.phone = "Please enter your phone number.";
    if (!form.clientType) next.clientType = "Please select one.";
    if (!form.siteAddress.trim()) next.siteAddress = "Please enter the site address.";
    if (!form.description.trim()) next.description = "Please describe the work.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(e) {
    e.preventDefault();
    setServerError("");
    if (!validate()) return;

    setStatus("submitting");
    try {
      // 1. Upload photos DIRECTLY to Vercel Blob from the browser (bypasses the
      //    ~4.5MB serverless body limit). Returns permanent public URLs.
      let photoLinks = [];
      if (photos.length > 0) {
        setPhase("uploading");
        photoLinks = await Promise.all(
          photos.map(async (p) => {
            const blob = await upload(`service-intake/${p.file.name}`, p.file, {
              access: "public",
              handleUploadUrl: "/api/blob-upload",
              contentType: p.file.type || undefined,
            });
            return blob.url;
          })
        );
      }

      // 2. Send the request details (now with real photo URLs) to our API,
      //    which forwards to Power Automate -> Teams.
      setPhase("sending");
      const payload = {
        ...form,
        photoCount: photos.length,
        photoLinks,
        submittedAt: new Date().toISOString(),
      };

      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setStatus("success");
    } catch (err) {
      setServerError(
        err.message || "Something went wrong. Please try again."
      );
      setStatus("error");
    } finally {
      setPhase("");
    }
  }

  if (status === "success") {
    return (
      <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10">
        <div className="w-full rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Request received</h1>
          <p className="mt-2 text-slate-600">
            Thanks{form.contactName ? `, ${form.contactName.split(" ")[0]}` : ""}! Our
            team at Innova Developments has your request and will be in touch shortly.
          </p>
          <button
            onClick={() => {
              setForm({
                contactName: "",
                email: "",
                phone: "",
                clientType: "",
                siteAddress: "",
                yearBuilt: "",
                description: "",
              });
              photos.forEach((p) => URL.revokeObjectURL(p.url));
              setPhotos([]);
              setStatus("idle");
            }}
            className="mt-6 inline-flex items-center rounded-lg bg-brand px-5 py-2.5 text-sm font-medium text-white hover:bg-brand-light focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2"
          >
            Submit another request
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 sm:py-12">
      {/* Header */}
      <header className="mb-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/innova-logo.webp"
          alt="Innova Developments Ltd."
          className="mx-auto mb-5 h-auto w-full max-w-[280px]"
        />
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">
          Service Request
        </h1>
        <p className="mt-2 text-slate-600">
          Tell us about your site and the work you need done. We&apos;ll get back to you soon.
        </p>
      </header>

      <form
        onSubmit={onSubmit}
        noValidate
        className="space-y-6 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200 sm:p-8"
      >
        {/* Contact */}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <Field label="Your name" error={errors.contactName} className="sm:col-span-2">
            <input
              type="text"
              autoComplete="name"
              value={form.contactName}
              onChange={(e) => update("contactName", e.target.value)}
              className={inputCls(errors.contactName)}
              placeholder="Jane Smith"
            />
          </Field>

          <Field label="Email" error={errors.email}>
            <input
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(e) => update("email", e.target.value)}
              className={inputCls(errors.email)}
              placeholder="you@example.com"
            />
          </Field>

          <Field label="Phone" error={errors.phone}>
            <input
              type="tel"
              autoComplete="tel"
              inputMode="tel"
              value={form.phone}
              onChange={(e) => update("phone", e.target.value)}
              className={inputCls(errors.phone)}
              placeholder="(403) 555-0123"
            />
          </Field>
        </div>

        {/* Client type */}
        <Field label="Are you a new or existing client?" error={errors.clientType}>
          <div className="mt-1 grid grid-cols-2 gap-3">
            {["New", "Existing"].map((opt) => (
              <label
                key={opt}
                className={`flex cursor-pointer items-center justify-center rounded-lg border px-4 py-3 text-sm font-medium transition ${
                  form.clientType === opt
                    ? "border-brand bg-brand/5 text-brand ring-1 ring-brand"
                    : "border-slate-300 text-slate-700 hover:border-slate-400"
                }`}
              >
                <input
                  type="radio"
                  name="clientType"
                  value={opt}
                  checked={form.clientType === opt}
                  onChange={(e) => update("clientType", e.target.value)}
                  className="sr-only"
                />
                {opt} client
              </label>
            ))}
          </div>
        </Field>

        {/* Address */}
        <Field label="Site address" error={errors.siteAddress}>
          <input
            type="text"
            autoComplete="street-address"
            value={form.siteAddress}
            onChange={(e) => update("siteAddress", e.target.value)}
            className={inputCls(errors.siteAddress)}
            placeholder="123 Main St SW, Calgary, AB"
          />
        </Field>

        {/* Year built */}
        <Field label="When was it built?" error={errors.yearBuilt} optional>
          <select
            value={form.yearBuilt}
            onChange={(e) => update("yearBuilt", e.target.value)}
            className={inputCls(errors.yearBuilt)}
          >
            <option value="">Select a year…</option>
            <option value="Unknown">Not sure / Unknown</option>
            {years.map((y) => (
              <option key={y} value={String(y)}>
                {y}
              </option>
            ))}
          </select>
        </Field>

        {/* Description */}
        <Field label="Describe the work" error={errors.description}>
          <textarea
            rows={5}
            value={form.description}
            onChange={(e) => update("description", e.target.value)}
            className={inputCls(errors.description)}
            placeholder="Tell us what you'd like done — e.g. kitchen renovation, foundation repair, new deck…"
          />
        </Field>

        {/* Photos */}
        <Field
          label={`Photos (optional, up to ${MAX_PHOTOS})`}
          error={errors.photos}
          optional
        >
          {photos.length > 0 && (
            <div className="mb-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {photos.map((p, i) => (
                <div key={i} className="group relative aspect-square overflow-hidden rounded-lg ring-1 ring-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.url} alt={`Upload ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(i)}
                    aria-label="Remove photo"
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white opacity-90 hover:bg-black/80"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}

          {photos.length < MAX_PHOTOS && (
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 px-4 py-6 text-center hover:border-brand hover:bg-brand/5">
              <svg className="mb-2 h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" strokeWidth="1.5" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              <span className="text-sm font-medium text-slate-700">
                Tap to add photos
              </span>
              <span className="mt-0.5 text-xs text-slate-500">
                {photos.length}/{MAX_PHOTOS} · JPG, PNG, HEIC · up to {MAX_PHOTO_MB}MB each
              </span>
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={onPhotosSelected}
                className="sr-only"
              />
            </label>
          )}
        </Field>

        {serverError && (
          <p className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700 ring-1 ring-red-200">
            {serverError}
          </p>
        )}

        <button
          type="submit"
          disabled={status === "submitting"}
          className="flex w-full items-center justify-center rounded-lg bg-brand px-6 py-3.5 text-base font-semibold text-white transition hover:bg-brand-light focus:outline-none focus:ring-2 focus:ring-brand focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status === "submitting"
            ? phase === "uploading"
              ? "Uploading photos…"
              : "Submitting…"
            : "Submit request"}
        </button>
      </form>

      <p className="mt-6 text-center text-xs text-slate-500">
        Innova Developments · We&apos;ll only use your details to respond to this request.
      </p>
    </main>
  );
}

function Field({ label, error, optional, className = "", children }) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-slate-700">
        {label}
        {optional && <span className="ml-1 font-normal text-slate-400">(optional)</span>}
      </label>
      <div className="mt-1.5">{children}</div>
      {error && <p className="mt-1.5 text-sm text-red-600">{error}</p>}
    </div>
  );
}

function inputCls(error) {
  return `block w-full rounded-lg border px-3.5 py-2.5 text-slate-900 shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 ${
    error
      ? "border-red-400 focus:border-red-500 focus:ring-red-200"
      : "border-slate-300 focus:border-brand focus:ring-brand/30"
  }`;
}

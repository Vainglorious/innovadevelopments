import { NextResponse } from "next/server";
import { buildContactList } from "@/lib/contacts";
import { renderXlsx } from "@/lib/xlsx";
import { renderPdf } from "@/lib/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60; // JobTread pulls can involve many round-trips.

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { jobId, jobNumber, jobName } = body || {};
  if (!jobId) {
    return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  }

  const name = String(jobName || jobNumber || "Contact List");

  try {
    const sheets = await buildContactList({
      id: jobId,
      number: jobNumber || "",
      name,
    });

    // Build both files from a single JobTread pull.
    const [xlsxBuf, pdfBuf] = await Promise.all([
      renderXlsx(sheets),
      renderPdf(sheets),
    ]);

    // Master sheet, for the on-screen preview.
    const master = sheets.find((s) => s.name === "Master");

    return NextResponse.json({
      filename: `${name} Contact List`,
      xlsx: xlsxBuf.toString("base64"),
      pdf: pdfBuf.toString("base64"),
      preview: master ? { header: master.header, rows: master.rows } : null,
    });
  } catch (err) {
    console.error("Failed to generate contact list", err);
    return NextResponse.json(
      { error: "Couldn't generate the contact list. Please try again." },
      { status: 502 }
    );
  }
}

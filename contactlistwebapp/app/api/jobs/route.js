import { NextResponse } from "next/server";
import { listJobs } from "@/lib/jobtread";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const jobs = await listJobs();
    return NextResponse.json({ jobs });
  } catch (err) {
    console.error("Failed to list jobs", err);
    return NextResponse.json(
      { error: "Couldn't load projects from JobTread." },
      { status: 502 }
    );
  }
}

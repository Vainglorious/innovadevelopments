import { NextResponse } from "next/server";
import {
  insertServiceRequest,
  stampNotifications,
  isDbConfigured,
} from "@/lib/db";
import {
  isSmsConfigured,
  smsRecipients,
  sendSMS,
  formatIntakeSms,
} from "@/lib/sms";

export const runtime = "nodejs";

// Post the Adaptive Card payload to Power Automate -> Teams. Returns true on
// success. Never throws — the caller treats Teams as best-effort.
async function postToTeams(webhookUrl, payload) {
  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Power Automate rejected the request", res.status, text);
      return false;
    }
    return true;
  } catch (err) {
    console.error("Failed to reach Power Automate", err);
    return false;
  }
}

// Basic server-side validation so we never forward junk to Teams.
function validate(body) {
  const required = [
    "contactName",
    "email",
    "phone",
    "clientType",
    "siteAddress",
    "description",
  ];
  for (const key of required) {
    if (!body[key] || String(body[key]).trim() === "") {
      return `Missing required field: ${key}`;
    }
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email).trim())) {
    return "Invalid email address";
  }
  return null;
}

export async function POST(request) {
  const webhookUrl = process.env.POWER_AUTOMATE_WEBHOOK_URL;
  if (!webhookUrl) {
    console.error("POWER_AUTOMATE_WEBHOOK_URL is not set");
    return NextResponse.json(
      { error: "Server is not configured to receive requests yet." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const validationError = validate(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const photoLinks = Array.isArray(body.photoLinks) ? body.photoLinks : [];

  // Pre-build Adaptive Card Image objects so the Teams card can inject them
  // directly (`@{triggerBody()?['photoImages']}`) — no Power Automate "Select"
  // action needed. Empty array when there are no photos (renders nothing).
  const photoImages = photoLinks
    .filter((url) => typeof url === "string" && url.startsWith("http"))
    .map((url) => ({
      type: "Image",
      url,
      altText: "Client photo",
      size: "Large",
      selectAction: { type: "Action.OpenUrl", url },
    }));

  // Cleaned, canonical view of the submission — used for the DB row, the Teams
  // payload, and the SMS body alike.
  const record = {
    contactName: String(body.contactName).trim(),
    email: String(body.email).trim(),
    phone: String(body.phone).trim(),
    clientType: String(body.clientType).trim(),
    siteAddress: String(body.siteAddress).trim(),
    yearBuilt: body.yearBuilt ? String(body.yearBuilt).trim() : "",
    description: String(body.description).trim(),
    photoLinks,
    userAgent: request.headers.get("user-agent") || "",
    ip:
      request.headers.get("x-forwarded-for")?.split(",")[0].trim() ||
      request.headers.get("x-real-ip") ||
      "",
  };

  // 1. Durable record FIRST. If this succeeds the request is safe, and the
  //    notifications below become best-effort. If the DB isn't configured we
  //    fall back to the old Teams-only behaviour so nothing regresses.
  let requestId = null;
  if (isDbConfigured()) {
    try {
      requestId = await insertServiceRequest(record);
    } catch (err) {
      console.error("Failed to save intake record", err);
      // Don't fail yet — still try Teams below so the request isn't lost.
    }
  }

  // Shape the payload to match the Power Automate trigger schema.
  const payload = {
    contactName: record.contactName,
    email: record.email,
    phone: record.phone,
    clientType: record.clientType,
    siteAddress: record.siteAddress,
    yearBuilt: record.yearBuilt || "Not provided",
    description: record.description,
    photoCount: Number.isFinite(body.photoCount) ? body.photoCount : photoLinks.length,
    photoLinks,
    photoImages, // ready-to-render Adaptive Card image elements
    submittedAt: body.submittedAt || new Date().toISOString(),
  };

  const detailLink = requestId
    ? `${(process.env.NEXT_PUBLIC_SITE_URL || "").replace(/\/$/, "")}/r/${requestId}`
    : "";

  // 2. Notify: Teams + SMS in parallel, both best-effort.
  const smsBody = formatIntakeSms(record, detailLink);
  const [teamsOk, smsResults] = await Promise.all([
    postToTeams(webhookUrl, payload),
    isSmsConfigured()
      ? Promise.allSettled(
          smsRecipients().map((to) => sendSMS(to, smsBody))
        )
      : Promise.resolve([]),
  ]);

  const smsOk =
    smsResults.length > 0 && smsResults.some((r) => r.status === "fulfilled");
  smsResults
    .filter((r) => r.status === "rejected")
    .forEach((r) => console.error("intake sms failed", r.reason));

  // 3. Record how delivery went (best-effort; never fails the request).
  if (requestId) {
    const failed = [
      !teamsOk ? "teams" : null,
      isSmsConfigured() && !smsOk ? "sms" : null,
    ].filter(Boolean);
    stampNotifications(requestId, {
      teamsOk,
      smsOk,
      error: failed.length ? `failed: ${failed.join(", ")}` : null,
    }).catch((e) => console.error("stamp notifications failed", e));
  }

  // The record is saved -> success even if a notification channel failed.
  if (requestId) {
    return NextResponse.json({ ok: true, id: requestId });
  }

  // No DB (or the insert failed): fall back to "Teams is the delivery".
  if (teamsOk) {
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json(
    { error: "We couldn't submit your request. Please try again shortly." },
    { status: 502 }
  );
}

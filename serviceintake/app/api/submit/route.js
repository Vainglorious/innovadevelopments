import { NextResponse } from "next/server";

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

  // Shape the payload to match the Power Automate trigger schema.
  const payload = {
    contactName: String(body.contactName).trim(),
    email: String(body.email).trim(),
    phone: String(body.phone).trim(),
    clientType: String(body.clientType).trim(),
    siteAddress: String(body.siteAddress).trim(),
    yearBuilt: body.yearBuilt ? String(body.yearBuilt).trim() : "Not provided",
    description: String(body.description).trim(),
    photoCount: Number.isFinite(body.photoCount) ? body.photoCount : 0,
    photoLinks,
    photoImages, // ready-to-render Adaptive Card image elements
    submittedAt: body.submittedAt || new Date().toISOString(),
  };

  try {
    const res = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("Power Automate rejected the request", res.status, text);
      return NextResponse.json(
        { error: "We couldn't submit your request. Please try again shortly." },
        { status: 502 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Failed to reach Power Automate", err);
    return NextResponse.json(
      { error: "We couldn't reach our servers. Please try again shortly." },
      { status: 502 }
    );
  }
}

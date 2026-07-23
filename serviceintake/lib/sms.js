// SMS alerts via Twilio. Ported from odysseymovie's lib/twilio.ts, trimmed to
// what intake needs. Server-side only — never import into a client component.
import twilio from "twilio";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM_NUMBER;

let client = null;
function getClient() {
  if (!sid || !token) throw new Error("Twilio credentials missing");
  if (!client) client = twilio(sid, token);
  return client;
}

export function isSmsConfigured() {
  return Boolean(sid && token && from && smsRecipients().length > 0);
}

/** Team numbers to alert. Comma-separated env list; trimmed, blanks dropped. */
export function smsRecipients() {
  return (process.env.SERVICE_SMS_RECIPIENTS || "")
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean);
}

export async function sendSMS(to, body) {
  if (!from) throw new Error("TWILIO_FROM_NUMBER missing");
  return getClient().messages.create({ to, from, body });
}

// Keep the body GSM-7 (no emoji / em-dash / bullet) so it stays cheap, and
// trim the description so the whole thing is ~2 segments.
function truncate(s, n) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  // "..." not "…": the ellipsis char isn't GSM-7 and would force UCS-2 (pricier).
  return t.length > n ? t.slice(0, n - 3).trimEnd() + "..." : t;
}

/** Build the alert text. `link` is the /r/<id> detail URL (or empty). */
export function formatIntakeSms(r, link) {
  const lines = [
    "New Innova service request",
    `${r.contactName} - ${r.clientType} client`,
    r.phone,
    r.siteAddress,
    truncate(r.description, 90),
  ];
  const photos = Array.isArray(r.photoLinks) ? r.photoLinks.length : 0;
  const tail = [];
  if (photos > 0) tail.push(`${photos} photo${photos === 1 ? "" : "s"}.`);
  if (link) tail.push(`Details: ${link}`);
  if (tail.length) lines.push(tail.join(" "));
  return lines.join("\n");
}

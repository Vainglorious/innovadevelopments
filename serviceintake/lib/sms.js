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

// Reduce arbitrary user text to ASCII so the message stays GSM-7 (160 chars per
// segment). A single non-GSM-7 character anywhere — a smart quote, an em-dash, an
// accented name, an emoji — flips the WHOLE message to UCS-2 (70 chars/segment)
// and multiplies the cost. Customers paste that constantly, so normalize it out.
// The full, un-mangled text still lives on the linked detail page.
export function toGsm7(s) {
  return String(s || "")
    // de-accent: e-acute -> e, n-tilde -> n, u-umlaut -> u, ...
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // combining marks left by NFKD
    // typographic punctuation -> ASCII equivalents
    .replace(/[‐-―−]/g, "-") // hyphen/figure/en/em dash, minus
    .replace(/[‘’‚‛]/g, "'") // curly single quotes
    .replace(/[“”„‟]/g, '"') // curly double quotes
    .replace(/…/g, "...") // ellipsis
    .replace(/[•·]/g, "-") // bullets
    .replace(/ /g, " ") // non-breaking space
    // drop anything still outside printable ASCII + newline (emoji, symbols)
    .replace(/[^\x0a\x20-\x7e]/g, "")
    .trim();
}
// Normalize, collapse whitespace, and trim to n chars so the whole body stays
// ~1-2 segments regardless of what was pasted in.
function clean(s, n) {
  const t = toGsm7(String(s || "").replace(/\s+/g, " "));
  if (!n || t.length <= n) return t;
  return t.slice(0, n - 3).trimEnd() + "...";
}

/** Build the alert text. `link` is the /r/<id> detail URL (or empty). */
export function formatIntakeSms(r, link) {
  const lines = [
    "New Innova service request",
    `${clean(r.contactName, 60)} - ${clean(r.clientType, 20)} client`,
    clean(r.phone, 30),
    clean(r.siteAddress, 80),
    clean(r.description, 90),
  ];
  const photos = Array.isArray(r.photoLinks) ? r.photoLinks.length : 0;
  const tail = [];
  if (photos > 0) tail.push(`${photos} photo${photos === 1 ? "" : "s"}.`);
  if (link) tail.push(`Details: ${link}`);
  if (tail.length) lines.push(tail.join(" "));
  return lines.join("\n");
}

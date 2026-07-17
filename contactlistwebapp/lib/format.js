// Small formatting helpers ported from notes/jt_contacts.py.

// Normalise a JobTread phone value to "xxx-xxx-xxxx" (with optional extension).
export function fmtPhone(p) {
  if (!p) return "";
  let ext = "";
  const m = /;?ext=(\d+)/.exec(p);
  if (m) {
    ext = " ext. " + m[1];
    p = p.slice(0, m.index);
  }
  let digits = p.replace(/\D/g, "");
  if (digits.length === 11 && digits[0] === "1") digits = digits.slice(1);
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}${ext}`;
  }
  return p + ext;
}

// Pull the "SCOPE OF WORK:" line out of a vendor-order description, if present.
export function parseScope(desc) {
  if (!desc) return "";
  const m = /SCOPE OF WORK:\s*([^\n#]+)/.exec(desc);
  return m ? m[1].trim() : "";
}

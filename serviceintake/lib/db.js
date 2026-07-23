// Neon Postgres client for intake records. Same HTTP-driver pattern as
// contactlistwebapp — no pool to manage on serverless. Writes land in the
// `intake` schema, kept separate from the internal contact oracle.
import { neon } from "@neondatabase/serverless";

let _sql;
function getSql() {
  if (!_sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    _sql = neon(url);
  }
  return _sql;
}

export function isDbConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

/** Insert one submission. Returns the new row's id. */
export async function insertServiceRequest(r) {
  const sql = getSql();
  const [row] = await sql`
    insert into intake.service_requests
      (contact_name, email, phone, client_type, site_address, year_built,
       description, photo_links, source, user_agent, ip)
    values
      (${r.contactName}, ${r.email}, ${r.phone}, ${r.clientType}, ${r.siteAddress},
       ${r.yearBuilt || null}, ${r.description}, ${JSON.stringify(r.photoLinks || [])},
       'web', ${r.userAgent || null}, ${r.ip || null})
    returning id
  `;
  return row.id;
}

/** Record how the notifications went, for later observability / retry. */
export async function stampNotifications(id, { teamsOk, smsOk, error }) {
  const sql = getSql();
  await sql`
    update intake.service_requests set
      teams_sent_at = ${teamsOk ? new Date().toISOString() : null},
      sms_sent_at   = ${smsOk ? new Date().toISOString() : null},
      notify_error  = ${error || null}
    where id = ${id}
  `;
}

/** One request by id, for the /r/[id] detail page. Null if not found. */
export async function getServiceRequest(id) {
  const sql = getSql();
  // Guard: only well-formed UUIDs hit the DB, so a junk path is a clean 404.
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const rows = await sql`
    select * from intake.service_requests where id = ${id}
  `;
  return rows[0] || null;
}

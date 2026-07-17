// Build the 6-sheet contact list for a job. Ported from notes/jt_contacts.py.
// Returns an array of sheet objects consumed by lib/xlsx.js and lib/pdf.js:
//   { name, title, header, rows }            for group sheets
//   { name, isNotes: true, rows: [[k, v]] }  for the Notes sheet
import {
  getAllDocuments,
  getDocDescription,
  getContacts,
} from "./jobtread";
import { parseScope } from "./format";

const H6 = ["Group", "Name", "Company", "Role / Context", "Email", "Phone"];
const H8 = [...H6, "Source Type", "Notes"];

// Innova staff are not in JobTread as vendor/customer contacts — templated here.
const INNOVA_TEAM = [
  ["Innova Team", "Jeff Richards", "Innova Developments Ltd.", "President", "jeff@innovadevelopments.ca", "403-390-2228", "JobTread", "Primary Innova contact"],
  ["Innova Team", "Andrew Skurdal", "Innova Developments Ltd.", "Site Supervisor / Project Coordinator", "andrew@innovadevelopments.ca", "403-880-4535", "JobTread", "Internal project contact"],
  ["Innova Team", "Gurpreet Virdi", "Innova Developments Ltd.", "Supporting Project Coordinator", "gurpreet@innovadevelopments.ca", "431-293-3112", "JobTread", "Internal project contact"],
  ["Innova Team", "Dayton Kanius", "Innova Developments Ltd.", "Supporting Project Manager", "dayton@innovadevelopments.ca", "306-580-3092", "JobTread", "Internal project contact"],
];

function today() {
  return new Date().toISOString().slice(0, 10);
}

export async function buildContactList(job) {
  const { id: jobId, number: jobNumber, name: jobName } = job;
  const docs = await getAllDocuments(jobId);

  // Vendors: approved vendorOrder docs grouped by account.
  const vendors = new Map(); // aid -> { company, labels[], scopes[] }
  const owners = new Map(); // aid -> company (from customer docs)

  for (const d of docs) {
    const acct = d.account || {};
    const aid = acct.id;
    if (!aid) continue;

    if (d.type === "vendorOrder" && d.status === "approved") {
      let v = vendors.get(aid);
      if (!v) {
        v = { company: acct.name, labels: [], scopes: [] };
        vendors.set(aid, v);
      }
      v.labels.push(d.name || "Order");
      const sc = parseScope(await getDocDescription(d.id));
      if (sc && !v.scopes.includes(sc)) v.scopes.push(sc);
    }

    if (
      (d.type === "customerInvoice" || d.type === "customerOrder") &&
      acct.type === "customer"
    ) {
      owners.set(aid, acct.name);
    }
  }

  // Vendor rows (8 cols), sorted by company name.
  const vendorRows = [];
  const vendorEntries = [...vendors.entries()].sort((a, b) =>
    a[1].company.toLowerCase().localeCompare(b[1].company.toLowerCase())
  );
  for (const [aid, v] of vendorEntries) {
    const scope = v.scopes.join("; ");
    const labels = v.labels.join("; ");
    for (const c of await getContacts(aid)) {
      const role = scope || c.title;
      const note =
        "Approved: " + labels + (c.title && scope ? `  (title: ${c.title})` : "");
      vendorRows.push([
        "Vendor",
        c.name,
        v.company,
        role,
        c.email,
        c.phone,
        "JobTread",
        note,
      ]);
    }
  }

  // Owner rows (8 cols).
  const ownerRows = [];
  for (const [aid, name] of owners.entries()) {
    for (const c of await getContacts(aid)) {
      ownerRows.push([
        "Owner",
        c.name,
        name,
        c.title || "Owner / client contact",
        c.email,
        c.phone,
        "JobTread",
        "Customer on JobTread documents",
      ]);
    }
  }

  // Master (6 cols): all groups combined.
  const master = [];
  for (const r of ownerRows) master.push(r.slice(0, 6));
  for (const r of vendorRows) master.push(r.slice(0, 6));
  for (const r of INNOVA_TEAM) master.push(r.slice(0, 6));

  const notesRows = [
    ["Project", `${jobName} ${jobNumber}`.trim()],
    ["Generated", today()],
    ["Basis", "Compiled from JobTread API (read-only). Documents where type=vendorOrder & status=approved, grouped by vendor account; contacts from each account."],
    ["Includes", "Vendors (from approved orders), Owner/customer (if on documents), and Innova team (template)"],
    ["Caveat", "JobTread-only. Landlord, Consultant, and Owner-Supplier groups are NOT in JobTread and are left blank. Role/Context for vendors is the scope-of-work from the order; Source Type/Notes provenance is not available from the API."],
    ["Prepared by", "Contact List Web App (JobTread API)"],
  ];

  return [
    { name: "Master", title: `${jobName} Contact List`, header: H6, rows: master },
    { name: "Owner", title: "Owner Contacts", header: H8, rows: ownerRows },
    { name: "Owner Suppliers", title: "Owner Suppliers / Consultants", header: H8, rows: [] },
    { name: "Vendors", title: "Vendor Contacts", header: H8, rows: vendorRows },
    { name: "Innova Team", title: "Innova Team Contacts", header: H8, rows: INNOVA_TEAM.map((r) => [...r]) },
    { name: "Notes", isNotes: true, rows: notesRows },
  ];
}

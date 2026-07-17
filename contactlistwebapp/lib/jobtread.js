// JobTread "Pave" API client. Ported from notes/jt_contacts.py.
// The grant key is passed in the request BODY at query.$.grantKey (not a header).
import { fmtPhone } from "./format";

const API = "https://api.jobtread.com/pave";

async function pave(query) {
  const grantKey = process.env.JOB_THREAD_API_KEY;
  if (!grantKey) {
    throw new Error("JOB_THREAD_API_KEY is not set");
  }
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: { $: { grantKey }, ...query } }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`JobTread API ${res.status}: ${text.slice(0, 300)}`);
  }
  const json = await res.json();
  return json;
}

// All jobs in the org, newest first, for the dropdown.
// The human name lives in location.name (e.g. "Leopolds Tavern Okotoks");
// job.name/number is just the numeric code (e.g. "2026040").
export async function listJobs() {
  const jobs = [];
  let page;
  while (true) {
    const $ = page ? { size: 100, page } : { size: 100 };
    const data = await pave({
      currentGrant: {
        organization: {
          jobs: {
            $,
            nextPage: {},
            nodes: {
              id: {},
              name: {},
              number: {},
              createdAt: {},
              location: { name: {}, address: {} },
            },
          },
        },
      },
    });
    const j = data.currentGrant.organization.jobs;
    for (const n of j.nodes) {
      const label = (n.location && n.location.name) || n.name || n.number;
      jobs.push({
        id: n.id,
        number: n.number || n.name || "",
        name: label,
        address: (n.location && n.location.address) || "",
        createdAt: n.createdAt || "",
      });
    }
    page = j.nextPage;
    if (!page) break;
  }
  jobs.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  return jobs;
}

export async function getAllDocuments(jobId) {
  const docs = [];
  let page;
  while (true) {
    const $ = page ? { size: 40, page } : { size: 40 };
    const data = await pave({
      job: {
        $: { id: jobId },
        documents: {
          $,
          nextPage: {},
          nodes: {
            id: {},
            type: {},
            status: {},
            name: {},
            number: {},
            issueDate: {},
            account: { id: {}, name: {}, type: {} },
          },
        },
      },
    });
    const d = data.job.documents;
    docs.push(...d.nodes);
    page = d.nextPage;
    if (!page) break;
  }
  return docs;
}

export async function getDocDescription(docId) {
  const data = await pave({ document: { $: { id: docId }, description: {} } });
  return (data.document && data.document.description) || "";
}

export async function getContacts(accountId) {
  const out = [];
  let page;
  while (true) {
    const $ = page ? { size: 12, page } : { size: 12 };
    const data = await pave({
      account: {
        $: { id: accountId },
        contacts: {
          $,
          nextPage: {},
          nodes: {
            id: {},
            name: {},
            title: {},
            customFieldValues: {
              $: { size: 10 },
              nodes: { value: {}, customField: { type: {} } },
            },
          },
        },
      },
    });
    const c = data.account.contacts;
    for (const n of c.nodes) {
      let email = "";
      let phone = "";
      const cfvs = (n.customFieldValues && n.customFieldValues.nodes) || [];
      for (const cf of cfvs) {
        const t = cf.customField && cf.customField.type;
        if (t === "emailAddress" && !email) email = cf.value;
        else if (t === "phoneNumber" && !phone) phone = cf.value;
      }
      out.push({
        name: n.name,
        title: n.title || "",
        email,
        phone: fmtPhone(phone),
      });
    }
    page = c.nextPage;
    if (!page) break;
  }
  return out;
}

-- Service intake records. Lives in its own `intake` schema in the shared Neon
-- project so the public form's writes stay clear of the internal contact oracle
-- (the `public` schema tables: contacts, job_contacts, ...).
--
-- See serviceintake/smsplanning.md for the design.

create schema if not exists intake;

create table if not exists intake.service_requests (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),

  -- submitted fields (mirror the form payload)
  contact_name  text not null,
  email         text not null,
  phone         text not null,
  client_type   text not null,                 -- New | Existing
  site_address  text not null,
  year_built    text,
  description   text not null,
  photo_links   jsonb not null default '[]',

  -- workflow: turns the log into a worklist (the ResQ "next action" idea)
  status        text not null default 'new',   -- new | contacted | scheduled | closed | spam

  -- delivery observability: did each notification channel go out?
  teams_sent_at timestamptz,
  sms_sent_at   timestamptz,
  notify_error  text,

  -- provenance
  source        text not null default 'web',
  user_agent    text,
  ip            text
);

create index if not exists service_requests_created_idx
  on intake.service_requests (created_at desc);
create index if not exists service_requests_status_idx
  on intake.service_requests (status);

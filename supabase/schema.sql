-- HOA Tracker schema
-- Run this in the Supabase SQL Editor (Project -> SQL Editor -> New query)

create extension if not exists "uuid-ossp";

create table if not exists hoas (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  mgmt_co text default '',
  contact_name text default '',
  phone text default '',
  email text default '',
  address text default '',
  qualifications text default '',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists jobs (
  id uuid primary key default uuid_generate_v4(),
  hoa_id uuid references hoas(id) on delete cascade,
  job_number text default '',
  job_name text default '',
  address text not null,
  status text default 'Need to Submit',
  date_submitted date,
  date_approved date,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists documents (
  id uuid primary key default uuid_generate_v4(),
  hoa_id uuid references hoas(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  uploaded_at timestamptz default now()
);

-- Keep updated_at fresh
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_hoas_updated on hoas;
create trigger trg_hoas_updated before update on hoas
  for each row execute procedure set_updated_at();

drop trigger if exists trg_jobs_updated on jobs;
create trigger trg_jobs_updated before update on jobs
  for each row execute procedure set_updated_at();

-- Row Level Security: only logged-in staff (any authenticated user) can read/write.
-- This matches a small-team, all-staff-trusted model like Permit Inventory.
alter table hoas enable row level security;
alter table jobs enable row level security;
alter table documents enable row level security;

create policy "authenticated read hoas" on hoas for select using (auth.role() = 'authenticated');
create policy "authenticated write hoas" on hoas for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated read jobs" on jobs for select using (auth.role() = 'authenticated');
create policy "authenticated write jobs" on jobs for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated read documents" on documents for select using (auth.role() = 'authenticated');
create policy "authenticated write documents" on documents for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Storage bucket for HOA documents (create via Storage tab, or this also works if storage schema is available)
insert into storage.buckets (id, name, public) values ('hoa-documents', 'hoa-documents', false)
  on conflict (id) do nothing;

create policy "authenticated storage read" on storage.objects for select
  using (bucket_id = 'hoa-documents' and auth.role() = 'authenticated');
create policy "authenticated storage write" on storage.objects for insert
  with check (bucket_id = 'hoa-documents' and auth.role() = 'authenticated');
create policy "authenticated storage delete" on storage.objects for delete
  using (bucket_id = 'hoa-documents' and auth.role() = 'authenticated');

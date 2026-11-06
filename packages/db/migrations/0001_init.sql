create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

create table tenant (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  display_name text not null,
  status text not null default 'trial' check (status in ('trial','active','past_due','suspended','canceled')),
  is_internal boolean not null default false,
  legal_hold boolean not null default false,
  created_at timestamptz not null default now()
);

create table membership (
  tenant_id uuid not null references tenant on delete cascade,
  user_id uuid not null references auth.users on delete cascade,
  role text not null check (role in ('owner','editor','viewer')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create table authorized_source (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant,
  platform text not null check (platform in ('twitch','kick')),
  platform_channel_id text not null,
  channel_login text not null,
  permission_basis text not null check (permission_basis in ('owned','customer_contract','written_permission','campaign')),
  permission_reference text,
  permission_granted_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (platform, platform_channel_id)
);

create table source_connection (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant,
  authorized_source_id uuid not null references authorized_source,
  provider text not null,
  scopes text[] not null default '{}',
  token_ciphertext text not null,
  token_expires_at timestamptz,
  status text not null default 'connected',
  last_probe_at timestamptz,
  created_at timestamptz not null default now()
);

create table viral_profile (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant,
  source_id uuid references authorized_source,
  name text not null,
  version integer not null,
  is_active boolean not null default true,
  config jsonb not null,
  created_by uuid references auth.users,
  created_at timestamptz not null default now(),
  unique (tenant_id, source_id, name, version)
);

create table stream_session (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant,
  source_id uuid not null references authorized_source,
  provider_session_id text,
  title text,
  game_id text,
  game_name text,
  language text,
  started_at timestamptz not null,
  ended_at timestamptz,
  status text not null default 'connecting' check (status in ('connecting','live','degraded','ended','error')),
  capture_cursor jsonb not null default '{}',
  profile_id uuid not null,
  profile_version integer not null,
  recorder_worker text,
  recorder_lease_until timestamptz,
  recorder_epoch integer not null default 0,
  unique (tenant_id, source_id, started_at)
);

create table chat_event (
  id bigserial primary key,
  tenant_id uuid not null,
  session_id uuid not null references stream_session,
  provider_event_id text not null,
  occurred_at timestamptz not null,
  received_at timestamptz not null default now(),
  chatter_key text not null,
  message_redacted text,
  emotes jsonb not null default '[]',
  raw_ref text,
  unique (session_id, provider_event_id)
);

create table signal_bucket (
  tenant_id uuid not null,
  session_id uuid not null references stream_session on delete cascade,
  bucket_start timestamptz not null,
  message_count integer not null,
  unique_chatters integer not null,
  emote_count integer not null,
  viewer_count integer,
  audio_rms numeric,
  baseline jsonb not null,
  features jsonb not null,
  primary key (session_id, bucket_start)
);

create table media_segment (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  sequence bigint not null,
  object_key text not null,
  started_at timestamptz,
  duration_ms integer not null,
  sha256 text not null,
  expires_at timestamptz not null,
  unique (session_id, sequence)
);

create table candidate (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null,
  origin text not null check (origin in ('automatic','dashboard','chat_command','webhook')),
  anchor_at timestamptz,
  segment_cursor jsonb not null,
  start_offset_ms integer not null,
  end_offset_ms integer not null,
  state text not null default 'queued' check (state in ('queued','preparing','rendering','review','approved','rejected','publishing','published','failed','expired')),
  score numeric,
  reason jsonb not null default '{}',
  signal_snapshot jsonb not null default '{}',
  request_id text,
  requested_by uuid,
  profile_id uuid,
  profile_version integer,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key)
);

create table render (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  candidate_id uuid not null references candidate,
  version integer not null,
  profile_version integer not null,
  timeline jsonb not null,
  object_key text,
  checksum_sha256 text,
  duration_ms integer,
  width integer,
  height integer,
  status text not null default 'queued' check (status in ('queued','rendering','succeeded','failed')),
  error_code text,
  created_at timestamptz not null default now(),
  unique (candidate_id, version)
);

create table destination (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  platform text not null check (platform in ('youtube','tiktok')),
  label text not null,
  token_ciphertext text not null,
  scopes text[] not null default '{}',
  status text not null default 'connected',
  app_visibility text not null default 'unaudited',
  created_at timestamptz not null default now()
);

create table approval (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  candidate_id uuid not null,
  render_id uuid not null references render,
  render_checksum text not null,
  title text not null,
  description text not null,
  tags text[] not null default '{}',
  approved_by uuid not null,
  created_at timestamptz not null default now()
);

create table publication (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  approval_id uuid not null references approval,
  destination_id uuid not null references destination,
  provider_post_id text,
  status text not null default 'queued',
  attempts integer not null default 0,
  last_error_code text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (approval_id, destination_id)
);

create table job (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenant,
  kind text not null,
  payload jsonb not null,
  state text not null default 'queued' check (state in ('queued','leased','succeeded','failed','cancelled')),
  run_after timestamptz not null default now(),
  leased_by text,
  lease_until timestamptz,
  attempts integer not null default 0,
  max_attempts integer not null default 6,
  fencing_token bigint not null default 0,
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now()
);

create index job_lease_idx on job (state, run_after);

create table audit_event (
  id bigserial primary key,
  tenant_id uuid,
  actor_user_id uuid,
  actor_type text not null,
  action text not null,
  entity_type text not null,
  entity_id text not null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table subscription_entitlement (
  tenant_id uuid primary key references tenant,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  price_id text,
  status text not null,
  current_period_end timestamptz,
  seats integer not null default 1,
  caps jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

create table clip_hook (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant,
  public_id text not null unique,
  source_id uuid not null,
  name text not null,
  secret_ciphertext text not null,
  secret_hash text not null,
  disabled_at timestamptz,
  created_at timestamptz not null default now()
);

create table webhook_replay (
  hook_id uuid not null,
  event_id text not null,
  created_at timestamptz not null default now(),
  primary key (hook_id, event_id)
);

create table outbox (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid,
  type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create table discovery_hit (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenant,
  platform text not null,
  platform_channel_id text not null,
  login text not null,
  game_id text,
  viewer_count integer,
  authorized boolean not null default false check (authorized = false),
  created_at timestamptz not null default now()
);

create index candidate_tenant_state_idx on candidate (tenant_id, state, created_at desc);
create index segment_tenant_idx on media_segment (tenant_id, session_id);

create or replace function app_user() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function app_role() returns text language sql stable as $$
  select coalesce(nullif(current_setting('app.role', true), ''), 'member')
$$;

create or replace function is_member(tid uuid) returns boolean language sql stable as $$
  select exists (
    select 1 from membership m where m.tenant_id = tid and m.user_id = app_user()
  )
$$;

create or replace function member_role(tid uuid) returns text language sql stable as $$
  select role from membership m where m.tenant_id = tid and m.user_id = app_user()
$$;

create or replace function prevent_approval_mutation() returns trigger language plpgsql as $$
begin
  raise exception 'approval is insert-only';
end $$;

create trigger approval_no_update
  before update or delete on approval
  for each row execute function prevent_approval_mutation();

create or replace function render_checksum_immutable() returns trigger language plpgsql as $$
begin
  if old.checksum_sha256 is not null and new.checksum_sha256 is distinct from old.checksum_sha256 then
    raise exception 'render checksum is immutable';
  end if;
  return new;
end $$;

create trigger render_checksum_no_replace
  before update on render
  for each row execute function render_checksum_immutable();

create or replace function lease_job(p_worker text, p_lease_seconds integer)
returns setof job language plpgsql as $$
declare
  rec job;
begin
  select * into rec from job
  where (state = 'queued' or (state = 'leased' and lease_until < now()))
    and run_after <= now()
  order by run_after, created_at
  for update skip locked
  limit 1;
  if not found then
    return;
  end if;
  update job set
    state = 'leased',
    leased_by = p_worker,
    lease_until = now() + make_interval(secs => p_lease_seconds),
    attempts = attempts + 1,
    fencing_token = fencing_token + 1
  where id = rec.id
  returning * into rec;
  return next rec;
end $$;

alter table tenant enable row level security;
alter table tenant force row level security;
alter table membership enable row level security;
alter table membership force row level security;
alter table authorized_source enable row level security;
alter table authorized_source force row level security;
alter table candidate enable row level security;
alter table candidate force row level security;
alter table render enable row level security;
alter table render force row level security;
alter table approval enable row level security;
alter table approval force row level security;
alter table publication enable row level security;
alter table publication force row level security;
alter table destination enable row level security;
alter table destination force row level security;
alter table media_segment enable row level security;
alter table media_segment force row level security;
alter table job enable row level security;
alter table job force row level security;
alter table stream_session enable row level security;
alter table stream_session force row level security;

create policy tenant_read on tenant for select using (is_member(id) or app_role() = 'service');
create policy tenant_write on tenant for all using (app_role() = 'service') with check (app_role() = 'service');

create policy membership_read on membership for select using (user_id = app_user() or app_role() = 'service');
create policy membership_write on membership for all using (app_role() = 'service') with check (app_role() = 'service');

create policy source_read on authorized_source for select using (is_member(tenant_id) or app_role() = 'service');
create policy source_write on authorized_source for all using (app_role() = 'service') with check (app_role() = 'service' or (is_member(tenant_id) and member_role(tenant_id) in ('owner','editor')));

create policy session_read on stream_session for select using (is_member(tenant_id) or app_role() = 'service');
create policy session_write on stream_session for insert with check (app_role() = 'service' or (is_member(tenant_id) and member_role(tenant_id) in ('owner','editor')));
create policy session_update on stream_session for update using (app_role() = 'service' or (is_member(tenant_id) and member_role(tenant_id) in ('owner','editor')));

create policy candidate_read on candidate for select using (is_member(tenant_id) or app_role() = 'service');
create policy candidate_insert on candidate for insert with check (app_role() = 'service' or (is_member(tenant_id) and member_role(tenant_id) in ('owner','editor')));
create policy candidate_update on candidate for update using (app_role() = 'service' or (is_member(tenant_id) and member_role(tenant_id) in ('owner','editor')));

create policy render_read on render for select using (is_member(tenant_id) or app_role() = 'service');
create policy render_write on render for insert with check (app_role() = 'service' or (is_member(tenant_id) and member_role(tenant_id) in ('owner','editor')));
create policy render_update on render for update using (app_role() = 'service');

create policy segment_read on media_segment for select using (is_member(tenant_id) or app_role() = 'service');
create policy segment_write on media_segment for all using (app_role() = 'service') with check (app_role() = 'service');

create policy destination_read on destination for select using (is_member(tenant_id) or app_role() = 'service');
create policy destination_write on destination for all using (app_role() = 'service') with check (app_role() = 'service' or (is_member(tenant_id) and member_role(tenant_id) = 'owner'));

create policy approval_read on approval for select using (is_member(tenant_id) or app_role() = 'service');
create policy approval_insert on approval for insert with check (
  app_role() = 'service' or (is_member(tenant_id) and member_role(tenant_id) in ('owner','editor'))
);

create policy publication_read on publication for select using (is_member(tenant_id) or app_role() = 'service');
create policy publication_write on publication for all using (app_role() = 'service') with check (app_role() = 'service');

create policy job_read on job for select using (app_role() = 'service' or (tenant_id is not null and is_member(tenant_id)));
create policy job_write on job for all using (app_role() = 'service') with check (app_role() = 'service');

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'clipppy_app') then
    create role clipppy_app nologin nosuperuser nobypassrls;
  end if;
end $$;

grant usage on schema public to clipppy_app;
grant usage on schema auth to clipppy_app;
grant select, insert, update, delete on all tables in schema public to clipppy_app;
grant select on all tables in schema auth to clipppy_app;
grant usage, select on all sequences in schema public to clipppy_app;
grant execute on all functions in schema public to clipppy_app;

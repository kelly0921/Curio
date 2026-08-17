alter type learning_processing_status add value if not exists 'researching';

create table if not exists context_connection (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references learning_profile(id) on delete cascade,
  provider text not null check (provider in ('mock', 'notion')),
  display_name text not null,
  status text not null check (status in ('connected', 'syncing', 'attention_required', 'disconnected')),
  scopes_json jsonb not null default '[]'::jsonb,
  is_demo boolean not null default false,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists context_record (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references learning_profile(id) on delete cascade,
  connection_id uuid not null references context_connection(id) on delete cascade,
  domain text not null check (domain in ('finance', 'travel', 'food', 'ai_work', 'career', 'health', 'home', 'relationships', 'general')),
  record_kind text not null check (record_kind in ('goal', 'fact', 'preference', 'constraint', 'plan', 'habit', 'resource')),
  statement text not null,
  keywords_json jsonb not null default '[]'::jsonb,
  source_label text not null,
  source_reference text,
  sensitivity text not null check (sensitivity in ('standard', 'private', 'sensitive')),
  confidence text not null check (confidence in ('explicit', 'imported', 'inferred')),
  observed_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists context_connection_profile_idx on context_connection (profile_id, status);
create index if not exists context_record_profile_domain_idx on context_record (profile_id, domain, observed_at desc);
create index if not exists context_record_connection_idx on context_record (connection_id);
create index if not exists context_record_keyword_idx on context_record using gin (
  to_tsvector('english', statement || ' ' || keywords_json::text)
);

alter table context_connection enable row level security;
alter table context_record enable row level security;

grant select, insert, update, delete on table context_connection, context_record to service_role;
revoke all privileges on table context_connection, context_record from anon, authenticated;

comment on table context_connection is 'User-authorized external context connections. Provider adapters replace a connection snapshot during sync.';
comment on table context_record is 'Normalized, provenance-bearing personal context used by domain-scoped personalization.';

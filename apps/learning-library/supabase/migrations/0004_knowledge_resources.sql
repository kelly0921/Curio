create table if not exists knowledge_resource (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references learning_profile(id) on delete cascade,
  resource_type text not null check (resource_type in ('guide', 'glossary', 'playbook', 'watchlist')),
  domain text not null check (domain in ('finance', 'travel', 'food', 'ai_work', 'career', 'health', 'home', 'relationships', 'general')),
  canonical_topic text not null,
  title text not null,
  source_count integer not null default 1,
  record_json jsonb not null,
  created_at timestamptz not null,
  updated_at timestamptz not null
);

create index if not exists knowledge_resource_profile_updated_idx
  on knowledge_resource (profile_id, updated_at desc);

create index if not exists knowledge_resource_topic_idx
  on knowledge_resource (profile_id, canonical_topic);

create index if not exists knowledge_resource_domain_idx
  on knowledge_resource (profile_id, domain, resource_type);

alter table knowledge_resource enable row level security;

grant select, insert, update, delete on table knowledge_resource to service_role;
revoke all privileges on table knowledge_resource from anon, authenticated;

comment on table knowledge_resource is 'Deduplicated living knowledge synthesized from one or more provenance-bearing learning items.';

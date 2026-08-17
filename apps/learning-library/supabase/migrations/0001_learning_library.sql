create extension if not exists "pgcrypto";

create type learning_source_type as enum ('uploaded_media', 'instagram_url', 'demo_fixture');
create type learning_access_level as enum ('full', 'partial', 'link_only', 'unsupported', 'failed');
create type learning_processing_status as enum (
  'received',
  'retrieving_source',
  'transcribing',
  'analyzing',
  'ready',
  'partial',
  'unsupported',
  'failed'
);
create type learning_intent as enum ('remember', 'try', 'verify', 'reference', 'use_for_content');

create table learning_profile (
  id uuid primary key default gen_random_uuid(),
  display_name text not null,
  learning_goals_json jsonb not null default '[]'::jsonb,
  preferred_topics_json jsonb not null default '[]'::jsonb,
  timezone text not null default 'America/New_York',
  weekly_delivery_day smallint not null default 1 check (weekly_delivery_day between 0 and 6),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table learning_item (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references learning_profile(id) on delete cascade,
  source_url text,
  platform text not null default 'instagram' check (platform = 'instagram'),
  source_type learning_source_type not null,
  source_fingerprint text not null unique,
  creator text,
  processing_status learning_processing_status not null,
  access_level learning_access_level not null,
  intent learning_intent not null default 'remember',
  generated_title text,
  primary_topic text,
  content_type text,
  requires_verification boolean not null default false,
  record_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index learning_item_profile_created_idx on learning_item (profile_id, created_at desc);
create index learning_item_topic_idx on learning_item (profile_id, primary_topic) where primary_topic is not null;
create index learning_item_status_idx on learning_item (profile_id, processing_status, access_level);
create index learning_item_verification_idx on learning_item (profile_id, requires_verification) where requires_verification;
create index learning_item_keyword_idx on learning_item using gin (
  to_tsvector('english', coalesce(generated_title, '') || ' ' || coalesce(primary_topic, '') || ' ' || record_json::text)
);

alter table learning_profile enable row level security;
alter table learning_item enable row level security;

grant usage on schema public to service_role;
grant select, insert, update, delete on table learning_profile, learning_item to service_role;
revoke all privileges on table learning_profile, learning_item from anon, authenticated;

insert into learning_profile (
  id,
  display_name,
  learning_goals_json,
  preferred_topics_json,
  timezone,
  weekly_delivery_day
) values (
  '00000000-0000-4000-8000-000000000031',
  'Personal learning profile',
  '["career growth","building side projects","creating useful content","investing and wealth building","mentoring and public speaking"]'::jsonb,
  '["career","entrepreneurship","fintech and payments","technology and AI","content creation","investing"]'::jsonb,
  'America/New_York',
  1
) on conflict (id) do update set
  display_name = excluded.display_name,
  learning_goals_json = excluded.learning_goals_json,
  preferred_topics_json = excluded.preferred_topics_json,
  timezone = excluded.timezone,
  weekly_delivery_day = excluded.weekly_delivery_day,
  updated_at = now();

comment on table learning_item is 'Canonical V0.1 record plus indexed projections for future keyword and semantic search.';
comment on column learning_item.record_json is 'Validated LearningItem, including exact AI-visible source materials and structured Learning Card output.';

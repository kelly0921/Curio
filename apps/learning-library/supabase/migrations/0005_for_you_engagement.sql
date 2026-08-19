create table if not exists resource_engagement (
  profile_id uuid not null references learning_profile(id) on delete cascade,
  resource_id uuid not null references knowledge_resource(id) on delete cascade,
  record_json jsonb not null,
  updated_at timestamptz not null,
  primary key (profile_id, resource_id)
);

create index if not exists resource_engagement_profile_updated_idx
  on resource_engagement (profile_id, updated_at desc);

create table if not exists for_you_feedback (
  profile_id uuid not null references learning_profile(id) on delete cascade,
  recommendation_id text not null,
  resource_id uuid not null references knowledge_resource(id) on delete cascade,
  lane text not null check (lane in ('learn_next', 'use_now', 'worth_revisiting')),
  state text not null check (state in ('done', 'later', 'not_relevant')),
  revisit_at timestamptz,
  record_json jsonb not null,
  updated_at timestamptz not null,
  primary key (profile_id, recommendation_id)
);

create index if not exists for_you_feedback_profile_updated_idx
  on for_you_feedback (profile_id, updated_at desc);

create index if not exists for_you_feedback_resource_idx
  on for_you_feedback (profile_id, resource_id);

alter table resource_engagement enable row level security;
alter table for_you_feedback enable row level security;

grant select, insert, update, delete on table resource_engagement to service_role;
grant select, insert, update, delete on table for_you_feedback to service_role;
revoke all privileges on table resource_engagement from anon, authenticated;
revoke all privileges on table for_you_feedback from anon, authenticated;

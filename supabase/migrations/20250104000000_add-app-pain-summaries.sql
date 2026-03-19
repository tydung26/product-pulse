-- Table storing per-app pain theme summaries from Step 1 AI summarization
create table app_pain_summaries (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null references apps(id) on delete cascade,
  themes jsonb not null default '[]',
  total_reviews int not null default 0,
  created_at timestamptz not null default now(),
  constraint uq_app_pain_summaries_app unique (app_id)
);

create index idx_app_pain_summaries_app on app_pain_summaries(app_id);

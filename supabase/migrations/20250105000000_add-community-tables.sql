-- ============================================================
-- community_posts: unified table for Reddit, HN, Indie Hackers posts
-- ============================================================
create table community_posts (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  external_id text not null,
  channel text,
  title text,
  body text not null,
  author text,
  url text not null,
  score int default 0,
  comment_count int default 0,
  has_wtp boolean default false,
  is_processed boolean default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_community_posts_source check (source in ('reddit', 'hn', 'indie_hackers', 'producthunt', 'yc')),
  constraint uq_community_posts_source_external unique (source, external_id)
);

create trigger trg_community_posts_updated
  before update on community_posts
  for each row execute function update_updated_at_column();

create index idx_community_posts_source on community_posts(source, created_at desc);
create index idx_community_posts_unprocessed on community_posts(created_at) where is_processed = false;
create index idx_community_posts_wtp on community_posts(has_wtp) where has_wtp = true;

-- ============================================================
-- community_pain_summaries: AI-generated topic clusters from community posts
-- ============================================================
create table community_pain_summaries (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  topic text not null,
  themes jsonb not null default '[]',
  total_posts int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_community_pain_summaries unique (source, topic)
);

create trigger trg_community_pain_summaries_updated
  before update on community_pain_summaries
  for each row execute function update_updated_at_column();

-- ============================================================
-- opportunity_community_posts: junction for opportunity <-> community evidence
-- ============================================================
create table opportunity_community_posts (
  opportunity_id uuid not null,
  community_post_id uuid not null,
  quote text,
  relevance text,
  constraint pk_opp_community primary key (opportunity_id, community_post_id),
  constraint fk_opp_community_opp foreign key (opportunity_id) references opportunities(id) on delete cascade,
  constraint fk_opp_community_post foreign key (community_post_id) references community_posts(id) on delete cascade
);

create index idx_opp_community_post on opportunity_community_posts(community_post_id);

-- ============================================================
-- Enhance existing tables for traceability
-- ============================================================

-- opportunity_reviews: add evidence columns
alter table opportunity_reviews add column if not exists quote text;
alter table opportunity_reviews add column if not exists relevance text;

-- opportunities: add traceability + scoring columns
alter table opportunities add column if not exists evidence_summary jsonb default '{}';
alter table opportunities add column if not exists wtp_count int default 0;
alter table opportunities add column if not exists source_count jsonb default '{}';
alter table opportunities add column if not exists score_breakdown jsonb default '{}';

-- startups: add enrichment columns
alter table startups add column if not exists last_active_date timestamptz;
alter table startups add column if not exists status text default 'unknown';

-- crawl_jobs: expand allowed job types
alter table crawl_jobs drop constraint chk_crawl_jobs_type;
alter table crawl_jobs add constraint chk_crawl_jobs_type check (job_type in (
  'app_store', 'google_play', 'yc', 'product_hunt', 'unikorn', 'analyze',
  'hn', 'reddit', 'indie_hackers', 'community_summarize'
));

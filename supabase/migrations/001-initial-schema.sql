-- ============================================================
-- 0. UTILITY: auto-update updated_at trigger
-- ============================================================
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = current_timestamp;
  return new;
end;
$$ language plpgsql;

-- ============================================================
-- 1. APPS: metadata from App Store + Google Play
-- ============================================================
create table apps (
  id uuid primary key default gen_random_uuid(),
  store text not null,
  store_id text not null,
  name text not null,
  category text,
  avg_rating numeric(2,1),
  price text,
  icon_url text,
  store_url text,
  description text,
  downloads bigint,
  overall_rating numeric(2,1),
  estimated_mrr numeric(10,2),
  is_active boolean default true,
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_apps_store check (store in ('app_store', 'google_play')),
  constraint uq_apps_store_store_id unique (store, store_id)
);

create trigger trg_apps_updated_at
  before update on apps
  for each row execute function update_updated_at_column();

-- ============================================================
-- 2. STORE_REVIEWS: app reviews (crawlers fetch 1-3 stars only)
-- ============================================================
create table store_reviews (
  id uuid primary key default gen_random_uuid(),
  app_id uuid not null,
  source text not null,
  external_id text,
  author text,
  rating integer not null,
  title text,
  body text not null,
  version text,
  review_date timestamptz,
  source_url text,
  is_processed boolean not null default false,
  created_at timestamptz not null default now(),

  constraint fk_store_reviews_app foreign key (app_id) references apps(id) on delete cascade,
  constraint chk_store_reviews_source check (source in ('app_store', 'google_play')),
  constraint chk_store_reviews_rating check (rating between 1 and 5),
  constraint uq_store_reviews_source_external_id unique (source, external_id)
);

-- ============================================================
-- 3. STARTUPS: YC Launch, Product Hunt, Unikorn.vn
-- ============================================================
create table startups (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_id text,
  name text not null,
  tagline text,
  description text,
  url text,
  logo_url text,
  upvotes integer not null default 0,
  funding_stage text,
  category text,
  launched_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_startups_source check (source in ('yc', 'producthunt', 'unikorn')),
  constraint uq_startups_source_source_id unique (source, source_id)
);

create trigger trg_startups_updated_at
  before update on startups
  for each row execute function update_updated_at_column();

-- ============================================================
-- 4. STARTUP_COMMENTS: from YC/PH discussions
-- ============================================================
create table startup_comments (
  id uuid primary key default gen_random_uuid(),
  startup_id uuid not null,
  author text,
  body text not null,
  posted_at timestamptz,
  created_at timestamptz not null default now(),

  constraint fk_startup_comments_startup foreign key (startup_id) references startups(id) on delete cascade
);

-- ============================================================
-- 5. OPPORTUNITIES: AI-analyzed product ideas ranked by viability
-- ============================================================
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text,
  score numeric(4,1) not null default 0,
  pain_severity numeric(4,1) not null default 0,
  market_size numeric(4,1) not null default 0,
  competition numeric(4,1) not null default 0,
  verdict text not null default 'weak',
  pain_summary text[] not null default '{}',
  solution_angles text[] not null default '{}',
  ai_reasoning jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_opportunities_verdict check (verdict in ('strong', 'moderate', 'weak'))
);

create trigger trg_opportunities_updated_at
  before update on opportunities
  for each row execute function update_updated_at_column();

-- ============================================================
-- 6a. OPPORTUNITY_APPS: M:M opportunities <-> apps
-- ============================================================
create table opportunity_apps (
  opportunity_id uuid not null,
  app_id uuid not null,
  ai_comment text,
  review_count integer not null default 0,
  avg_rating numeric(2,1),

  constraint pk_opportunity_apps primary key (opportunity_id, app_id),
  constraint fk_opp_apps_opportunity foreign key (opportunity_id) references opportunities(id) on delete cascade,
  constraint fk_opp_apps_app foreign key (app_id) references apps(id) on delete cascade
);

-- ============================================================
-- 6b. OPPORTUNITY_STARTUPS: M:M opportunities <-> startups
-- ============================================================
create table opportunity_startups (
  opportunity_id uuid not null,
  startup_id uuid not null,
  ai_comment text,
  role text not null default 'competitor',

  constraint pk_opportunity_startups primary key (opportunity_id, startup_id),
  constraint fk_opp_startups_opportunity foreign key (opportunity_id) references opportunities(id) on delete cascade,
  constraint fk_opp_startups_startup foreign key (startup_id) references startups(id) on delete cascade,
  constraint chk_opp_startups_role check (role in ('competitor', 'inspiration', 'related'))
);

-- ============================================================
-- 6c. OPPORTUNITY_REVIEWS: evidence linking reviews to opportunities
-- ============================================================
create table opportunity_reviews (
  opportunity_id uuid not null,
  review_id uuid not null,

  constraint pk_opportunity_reviews primary key (opportunity_id, review_id),
  constraint fk_opp_reviews_opportunity foreign key (opportunity_id) references opportunities(id) on delete cascade,
  constraint fk_opp_reviews_review foreign key (review_id) references store_reviews(id) on delete cascade
);

-- ============================================================
-- 7. CRAWL_JOBS: audit trail for crawl/analysis operations
-- ============================================================
create table crawl_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null,
  status text not null default 'pending',
  app_id uuid,
  items_found integer not null default 0,
  items_inserted integer not null default 0,
  items_updated integer not null default 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),

  constraint fk_crawl_jobs_app foreign key (app_id) references apps(id),
  constraint chk_crawl_jobs_type check (job_type in (
    'app_store', 'google_play', 'yc', 'product_hunt', 'unikorn', 'analyze'
  )),
  constraint chk_crawl_jobs_status check (status in ('pending', 'running', 'completed', 'failed'))
);

-- ============================================================
-- INDEXES
-- ============================================================

-- Apps
create index idx_apps_category_rating on apps(category, avg_rating desc);
create index idx_apps_is_active on apps(id) where is_active = true;

-- Reviews
create index idx_store_reviews_app_date on store_reviews(app_id, review_date desc);
create index idx_store_reviews_unprocessed on store_reviews(created_at) where is_processed = false;

-- Startups
create index idx_startups_source_launched on startups(source, launched_at desc);
create index idx_startups_upvotes on startups(upvotes desc);

-- Startup Comments
create index idx_startup_comments_startup_posted on startup_comments(startup_id, posted_at desc);

-- Opportunities
create index idx_opportunities_score on opportunities(score desc);
create index idx_opportunities_verdict_score on opportunities(verdict, score desc);

-- Junction tables (reverse lookups)
create index idx_opp_apps_app on opportunity_apps(app_id);
create index idx_opp_startups_startup on opportunity_startups(startup_id);
create index idx_opp_reviews_review on opportunity_reviews(review_id);

-- Crawl Jobs
create index idx_crawl_jobs_active on crawl_jobs(created_at desc) where status in ('pending', 'running');

-- JSONB GIN indexes
create index idx_startups_metadata on startups using gin(metadata) where metadata != '{}';
create index idx_opportunities_reasoning on opportunities using gin(ai_reasoning) where ai_reasoning != '{}';

# ProductPulse Architecture Brainstorm

## Problem Statement

Design architecture for ProductPulse v2 — a local-first tool that monitors app reviews (App Store, Google Play), tracks startups (YC, Product Hunt, Unikorn.vn), and surfaces pain points via AI clustering.

**Constraints:** Greenfield, no auth/payments, Supabase DB-only (Tokyo), local-first with potential Vercel deploy.

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Structure | Flat + Scripts | KISS. Dashboard in `src/`, crawlers in `scripts/`. Shared lib. |
| Data fetching | RSC + Server Actions | Read-heavy dashboard, no API routes needed. Client components for filters only. |
| DB schema | Fresh design (v1-informed) | Clean break from v1. Carry forward proven patterns (junction table, crawl_jobs, intensity scoring). |
| Script runner | tsx | Zero build, fast startup, TS path alias support. |
| AI pipeline | Flexible | `--local-ai` (Claude CLI) + `--api` (Anthropic SDK) |
| AI analysis | Batch to Claude | Send app data + store_reviews + startups → Claude scores viability → ranked opportunities |
| Crawlers | CLI 3-step | Step 1: crawl:apps, Step 2: crawl:store_reviews, Step 3: analyze |
| Review↔Opportunity | Junction table | `opportunity_reviews` links evidence store_reviews to opportunities |
| Scoring | Multi-dimensional | pain_severity + market_size + competition → overall score 0-100 + verdict |
| Crawl tracking | crawl_jobs table | Audit trail from v1, extended with startup sources + analyze |
| App enrichment | All fields | description, downloads, overall_rating, estimated_mrr |

## Architecture

### Project Structure

```
product-pulse/
├── src/
│   ├── app/                          # Next.js 16 App Router
│   │   ├── layout.tsx                # Root layout + nav tabs
│   │   ├── page.tsx                  # Redirect → /apps
│   │   ├── apps/
│   │   │   ├── page.tsx              # Apps grid (RSC)
│   │   │   └── [id]/page.tsx         # App detail + pain points
│   │   ├── opportunities/
│   │   │   └── page.tsx              # Ranked opportunities by score
│   │   └── startups/
│   │       ├── page.tsx              # Startups grid (RSC)
│   │       └── [id]/page.tsx         # Startup detail + comments
│   ├── components/
│   │   ├── ui/                       # shadcn/ui primitives
│   │   ├── app-card.tsx
│   │   ├── startup-card.tsx
│   │   ├── opportunity-card.tsx
│   │   ├── apps-grid.tsx             # Client: filters/search
│   │   ├── startups-grid.tsx         # Client: filters/search
│   │   └── nav-tabs.tsx              # Tab navigation
│   └── lib/
│       ├── supabase/
│       │   ├── server.ts             # RSC client (createServerClient)
│       │   └── client.ts             # Browser client (createBrowserClient)
│       ├── types/
│       │   └── database.ts           # DB types (shared by dashboard + scripts)
│       └── utils.ts                  # cn(), formatters
├── scripts/
│   ├── crawlers/
│   │   ├── crawl-app-store.ts        # Apple RSS + iTunes Lookup
│   │   ├── crawl-google-play.ts      # google-play-scraper npm
│   │   ├── crawl-yc-launches.ts      # Cheerio scraping
│   │   ├── crawl-product-hunt.ts     # GraphQL API or scrape
│   │   ├── crawl-unikorn.ts          # Cheerio scraping
│   │   └── lib/
│   │       ├── supabase-admin.ts     # Script-side Supabase client
│   │       └── crawler-utils.ts      # Shared: logging, rate limit, upsert helpers
│   └── ai/
│       ├── analyze.ts                # Entry: pnpm analyze [--local-ai|--api]
│       └── providers/
│           ├── types.ts              # AIProvider interface + OpportunityResult
│           ├── claude-cli.ts         # Shells out to `claude` CLI
│           └── anthropic-sdk.ts      # Uses @anthropic-ai/sdk
├── supabase/
│   └── migrations/
│       └── 001-initial-schema.sql    # Paste into Supabase SQL Editor
├── .env.local                        # SUPABASE_URL, SUPABASE_ANON_KEY, etc.
├── package.json
├── tsconfig.json
└── next.config.ts
```

### Database Schema (Fresh, V1-Informed, Opportunity-Driven)

**7 tables** — replaces pain_points/review_clusters with opportunities/opportunity_reviews.
**Applied:** Named constraints, COMMENT ON, updated_at trigger, composite indexes, GIN for JSONB, partial indexes.

```sql
-- ============================================================
-- 0. UTILITY: auto-update updated_at trigger
-- PostgreSQL has no ON UPDATE CURRENT_TIMESTAMP — needs trigger
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
-- From v1: enrichment fields (description, downloads, overall_rating, estimated_mrr)
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
  -- enrichment fields (populated by pnpm crawl:apps)
  description text,
  downloads bigint,
  overall_rating numeric(2,1),
  estimated_mrr numeric(10,2),
  -- crawl tracking
  is_active boolean default true,
  last_crawled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_apps_store check (store in ('app_store', 'google_play')),
  constraint uq_apps_store_store_id unique (store, store_id)
);

comment on table apps is 'App metadata from App Store and Google Play';
comment on column apps.store is 'Source store: app_store or google_play';
comment on column apps.store_id is 'Store-specific app identifier (bundle ID or package name)';
comment on column apps.avg_rating is 'Average star rating from crawled reviews';
comment on column apps.overall_rating is 'Official overall rating from store (enrichment)';
comment on column apps.estimated_mrr is 'Estimated monthly recurring revenue (enrichment)';
comment on column apps.is_active is 'Whether to include in crawl runs';
comment on column apps.last_crawled_at is 'When reviews were last crawled for this app';

create trigger trg_apps_updated_at
  before update on apps
  for each row execute function update_updated_at_column();

-- ============================================================
-- 2. APP_REVIEWS: app reviews, all ratings stored, crawlers filter 1-3
-- From v1: is_processed for analysis tracking, source_url for traceability
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

comment on table store_reviews is 'App store reviews. DB stores 1-5 stars; crawlers fetch 1-3 only';
comment on column store_reviews.external_id is 'Store-specific review ID for deduplication';
comment on column store_reviews.is_processed is 'false = not yet analyzed by AI';
comment on column store_reviews.source_url is 'Direct link to original review';

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

comment on table startups is 'Startups from YC Launch, Product Hunt, and Unikorn.vn';
comment on column startups.source is 'Data source: yc, producthunt, or unikorn';
comment on column startups.source_id is 'Source-specific startup identifier for deduplication';
comment on column startups.metadata is 'Source-specific data (maker info, batch, etc.)';

create trigger trg_startups_updated_at
  before update on startups
  for each row execute function update_updated_at_column();

-- ============================================================
-- 4. STARTUP COMMENTS: from YC/PH discussions
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

comment on table startup_comments is 'Comments from YC Launch and Product Hunt discussions';

-- ============================================================
-- 5. OPPORTUNITIES: AI-analyzed product ideas ranked by viability
-- M:M links to apps and startups via junction tables
-- AI evaluates: store_reviews + MRR + competition → "should you build this?"
-- ============================================================
create table opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null,
  category text,
  -- AI scoring (each 0-100)
  score numeric(4,1) not null default 0,
  pain_severity numeric(4,1) not null default 0,
  market_size numeric(4,1) not null default 0,
  competition numeric(4,1) not null default 0,
  verdict text not null default 'weak',
  -- AI-generated insights
  pain_summary text[] not null default '{}',
  solution_angles text[] not null default '{}',
  ai_reasoning jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint chk_opportunities_verdict check (verdict in ('strong', 'moderate', 'weak'))
);

comment on table opportunities is 'AI-ranked product opportunities with multi-dimensional scoring';
comment on column opportunities.score is '0-100 overall viability: weighted(pain_severity, market_size, competition)';
comment on column opportunities.pain_severity is '0-100 how painful the user problem is (from reviews)';
comment on column opportunities.market_size is '0-100 market signal from MRR, downloads, upvotes';
comment on column opportunities.competition is '0-100 saturation (lower = less competition = better)';
comment on column opportunities.verdict is 'AI verdict: strong (build it), moderate (maybe), weak (skip)';
comment on column opportunities.pain_summary is 'Top user complaints distilled from reviews';
comment on column opportunities.solution_angles is 'AI-suggested product ideas to address the pain';
comment on column opportunities.ai_reasoning is 'Overall AI synthesis: reasoning, confidence, summary';

create trigger trg_opportunities_updated_at
  before update on opportunities
  for each row execute function update_updated_at_column();

-- ============================================================
-- 6a. OPPORTUNITY APPS: M:M linking opportunities to apps
-- Stores per-app AI commentary and stats
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

comment on table opportunity_apps is 'M:M: which apps contribute to each opportunity, with per-app AI analysis';
comment on column opportunity_apps.ai_comment is 'AI analysis specific to this app (e.g. "47 reviews mention dropped calls")';
comment on column opportunity_apps.review_count is 'How many reviews from this app support the opportunity';

-- ============================================================
-- 6b. OPPORTUNITY STARTUPS: M:M linking opportunities to startups
-- Stores per-startup AI commentary and competitive role
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

comment on table opportunity_startups is 'M:M: which startups relate to each opportunity, with per-startup AI analysis';
comment on column opportunity_startups.ai_comment is 'AI analysis of this competitor (e.g. "trying async video, poor mobile UX")';
comment on column opportunity_startups.role is 'How this startup relates: competitor, inspiration, or related';

-- ============================================================
-- 6c. OPPORTUNITY REVIEWS: evidence linking reviews to opportunities
-- ============================================================
create table opportunity_reviews (
  opportunity_id uuid not null,
  review_id uuid not null,

  constraint pk_opportunity_reviews primary key (opportunity_id, review_id),
  constraint fk_opp_reviews_opportunity foreign key (opportunity_id) references opportunities(id) on delete cascade,
  constraint fk_opp_reviews_review foreign key (review_id) references store_reviews(id) on delete cascade
);

comment on table opportunity_reviews is 'Evidence: which reviews support each opportunity assessment';

-- ============================================================
-- 7. CRAWL JOBS: audit trail for crawl/analysis operations
-- From v1: extended with startup sources + analyze job type
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

comment on table crawl_jobs is 'Audit trail for all crawl and AI analysis operations';
comment on column crawl_jobs.job_type is 'Source being crawled or analyze operation';
comment on column crawl_jobs.app_id is 'Nullable — set for app-specific crawls, null for bulk/startup crawls';
```

**Indexes:**
```sql
-- ============================================================
-- INDEXES: designed for 3-step pipeline + dashboard RSC queries
-- ============================================================

-- Apps: grid page (filter by category, sort by rating)
create index idx_apps_category_rating on apps(category, avg_rating desc);
create index idx_apps_is_active on apps(id) where is_active = true;

-- Reviews: app detail + AI analysis script
create index idx_store_reviews_app_date on store_reviews(app_id, review_date desc);
create index idx_store_reviews_unprocessed on store_reviews(created_at) where is_processed = false;

-- Startups: grid page (filter source, sort by date/upvotes)
create index idx_startups_source_launched on startups(source, launched_at desc);
create index idx_startups_upvotes on startups(upvotes desc);

-- Startup Comments: detail page
create index idx_startup_comments_startup_posted on startup_comments(startup_id, posted_at desc);

-- Opportunities: ranked list (main dashboard view)
create index idx_opportunities_score on opportunities(score desc);
create index idx_opportunities_verdict_score on opportunities(verdict, score desc);

-- Opportunity Apps: lookups both directions
create index idx_opp_apps_app on opportunity_apps(app_id);

-- Opportunity Startups: lookups both directions
create index idx_opp_startups_startup on opportunity_startups(startup_id);

-- Opportunity Reviews: reverse lookup (review → which opportunities)
create index idx_opp_reviews_review on opportunity_reviews(review_id);

-- Crawl Jobs: active job monitoring
create index idx_crawl_jobs_active on crawl_jobs(created_at desc) where status in ('pending', 'running');

-- JSONB: GIN indexes for flexible queries
create index idx_startups_metadata on startups using gin(metadata) where metadata != '{}';
create index idx_opportunities_reasoning on opportunities using gin(ai_reasoning) where ai_reasoning != '{}';
```

### Schema Changelog (vs previous brainstorm draft)

| Change | Rationale |
|--------|-----------|
| `pain_points` → `opportunities` | Shift from "what's broken" to "should you build this?" — AI evaluates viability |
| `review_clusters` → `opportunity_reviews` | Same junction pattern, renamed for new domain |
| Added `score`, `pain_severity`, `market_size`, `competition` | Multi-dimensional AI scoring (each 0-100) |
| Added `verdict` (strong/moderate/weak) | Quick filter for actionable ideas |
| Added `ai_reasoning jsonb` | Full AI analysis payload for transparency |
| `app_id`/`startup_id` → M:M junction tables | `opportunity_apps` + `opportunity_startups` replace single FKs |
| Per-entity AI comments | `ai_comment` on each junction row stores AI analysis per app/startup |
| `opportunity_startups.role` | Classifies startup as competitor, inspiration, or related |
| `crawl_jobs.job_type`: `clustering` → `analyze` | Reflects new AI step name |

### Data Flow (3-Step Pipeline)

```
STEP 1: CRAWL DATA (pnpm crawl:apps)
  pnpm crawl:appstore  → Apple RSS + iTunes API    → upsert apps
  pnpm crawl:gplay     → google-play-scraper        → upsert apps
  pnpm crawl:yc        → cheerio scrape             → upsert startups + comments
  pnpm crawl:ph        → GraphQL API                → upsert startups + comments
  pnpm crawl:unikorn   → cheerio scrape             → upsert startups

STEP 2: COLLECT REVIEWS (pnpm crawl:store_reviews)
  For each active app → fetch 1-3 star store_reviews → upsert store_reviews (is_processed=false)
  Log each crawl to crawl_jobs

STEP 3: AI ANALYSIS (pnpm analyze --local-ai|--api)
  → Read unprocessed store_reviews + app metadata + startup data
  → Send to Claude: "Given this app's store_reviews, MRR, and competing startups,
     is this a viable product opportunity? Score and rank it."
  → Parse structured JSON → upsert opportunities + opportunity_reviews
  → Mark store_reviews is_processed=true
  → Log to crawl_jobs with job_type='analyze'
```

### AI Analysis Pipeline

```typescript
// scripts/ai/types.ts
interface OpportunityResult {
  title: string
  description: string
  category: string
  score: number           // 0-100 overall
  painSeverity: number    // 0-100
  marketSize: number      // 0-100
  competition: number     // 0-100 (lower = less saturated = better)
  verdict: 'strong' | 'moderate' | 'weak'
  painSummary: string[]       // top complaints from store_reviews
  solutionAngles: string[]    // what to build
  reviewIndices: number[]     // which input store_reviews support this
  reasoning: string           // AI explanation
}

interface AIProvider {
  analyze(input: {
    app?: { name: string; category: string; mrr: number; downloads: number; rating: number }
    startup?: { name: string; tagline: string; upvotes: number; source: string }
    store_reviews: { index: number; body: string; rating: number; title?: string }[]
  }): Promise<OpportunityResult[]>
}
```

**Providers:**
- `--local-ai`: Pipes prompt to `claude` CLI via `child_process.execSync`, parses JSON stdout
- `--api`: Uses `@anthropic-ai/sdk` with `ANTHROPIC_API_KEY` env var

### Key Dependencies

| Package | Purpose |
|---------|---------|
| next@16 | App Router, RSC, React 19 |
| @supabase/supabase-js + @supabase/ssr | DB client (server + browser) |
| tailwindcss@4 | CSS-first config |
| shadcn/ui | Pre-built accessible components |
| tsx | Run TypeScript scripts directly |
| cheerio | HTML parsing (YC, Unikorn) |
| google-play-scraper | Google Play data |
| @anthropic-ai/sdk | Optional: AI enrichment via API |

### Dashboard Patterns

- **Server Components** for all page-level data fetching (no loading spinners for initial render)
- **Client components** only for: filter dropdowns, search input, sort toggles
- **URL search params** for filter state → shareable, back-button friendly
- **shadcn/ui** for all components, `cn()` for conditional classes
- **Semantic tokens** (`text-foreground`, `bg-muted`) not raw Tailwind colors

### pnpm Scripts

```json
{
  "dev": "next dev",
  "build": "next build",
  "crawl:apps": "tsx scripts/crawlers/crawl-app-store.ts && tsx scripts/crawlers/crawl-google-play.ts && tsx scripts/crawlers/crawl-yc-launches.ts && tsx scripts/crawlers/crawl-product-hunt.ts && tsx scripts/crawlers/crawl-unikorn.ts",
  "crawl:appstore": "tsx scripts/crawlers/crawl-app-store.ts",
  "crawl:gplay": "tsx scripts/crawlers/crawl-google-play.ts",
  "crawl:yc": "tsx scripts/crawlers/crawl-yc-launches.ts",
  "crawl:ph": "tsx scripts/crawlers/crawl-product-hunt.ts",
  "crawl:unikorn": "tsx scripts/crawlers/crawl-unikorn.ts",
  "crawl:store_reviews": "tsx scripts/crawlers/crawl-store_reviews.ts",
  "analyze": "tsx scripts/ai/analyze.ts"
}
```

**3-step usage:**
```bash
pnpm crawl:apps       # Step 1: collect apps + startups metadata
pnpm crawl:store_reviews    # Step 2: fetch 1-3 star store_reviews for active apps
pnpm analyze --local-ai  # Step 3: AI scores & ranks opportunities
```

## Rejected Alternatives

| Option | Why Rejected |
|--------|-------------|
| Monorepo workspaces | Overkill for local MVP. Config overhead not justified. |
| All-in-src | Crawlers conceptually don't belong in Next.js src tree. |
| Client-side React Query | Unnecessary for read-heavy dashboard. RSC is simpler + faster first paint. |
| API routes for crawlers | CLI-only chosen. No need for server-triggered crawls. |
| ts-node | Slower startup, more config. tsx is superior for scripts. |

## Risks & Mitigations

| Risk | Mitigation |
|------|-----------|
| Scraping targets change HTML | Cheerio selectors break → pin to specific page structure, add error logging |
| Product Hunt rate limits | Respect API limits, cache responses, crawl during off-peak |
| Large review volumes | Batch AI enrichment, paginate dashboard queries |
| Supabase Tokyo latency | Acceptable for local use. If deployed to Vercel, use Vercel edge or same region. |
| tsx path aliases | Configure `tsconfig.json` paths + tsx `--tsconfig` flag for scripts |

## Open Questions

1. **Product Hunt**: API (needs token) vs scrape (no token)? — Defer to implementation, try API first.
2. **Unikorn.vn**: SSR or SPA? — Need to inspect at implementation time.
3. **Startup ↔ App linking**: Worth doing in v2 or defer? — Suggest defer, add `related_app_id` column later if needed.
4. **Crawl frequency**: Daily for all sources? Different cadence per source?

## Next Steps

Ready to create detailed implementation plan with phased execution.

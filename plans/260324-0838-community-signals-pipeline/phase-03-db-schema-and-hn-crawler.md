# Phase 3: DB Schema + HN Crawler

## Context Links

- Brainstorm: `plans/reports/brainstorm-260324-0826-community-signals-pipeline.md`
- Initial schema: `supabase/migrations/20250101000000_initial-schema.sql`
- Crawler utils: `scripts/crawlers/lib/crawler-utils.ts`
- DB types: `src/lib/types/database.ts`

## Overview

- **Priority:** P1 (foundation for all community features)
- **Status:** pending
- **Effort:** 4h
- **Description:** Create DB migration for community tables + enhanced opportunity columns. Build HN Algolia crawler (simplest — free, no auth). Add WTP keyword scanner utility.

## Key Insights

- HN Algolia API: `http://hn.algolia.com/api/v1/search` — free, no auth, 10k req/hr
- Existing `opportunity_reviews` table has no `quote` or `relevance` columns — needs ALTER
- `startup_comments` data should eventually migrate into `community_posts` but can coexist for now
- WTP keywords are cheap regex scan — no AI needed

## Requirements

### Functional

1. New `community_posts` table with source, channel, WTP flag, external_id uniqueness
2. New `community_pain_summaries` table for AI-generated topic clusters
3. Enhanced `opportunity_reviews` with quote + relevance columns
4. New `opportunity_community_posts` junction table
5. Enhanced `opportunities` with evidence_summary, wtp_count, source_count, score_breakdown
6. `crawl-hn.ts` crawler targeting Ask HN, Show HN, and pain-related discussions
7. WTP keyword scanner utility in crawler-utils
8. Startup enrichment columns (from Phase 2)

### Non-functional

- Migration must be backward compatible (all new columns nullable or have defaults)
- HN crawler must respect rate limits (1 req/sec is conservative enough)
- WTP scanner must be reusable across all community crawlers

## Architecture

### DB Schema

```
community_posts (new)
  ├── id, source, external_id, channel, title, body, author, url
  ├── score, comment_count, has_wtp, is_processed
  └── UNIQUE(source, external_id)

community_pain_summaries (new)
  ├── id, source, topic, themes (jsonb), total_posts
  └── UNIQUE(source, topic)

opportunity_reviews (ALTER)
  ├── + quote text
  └── + relevance text

opportunity_community_posts (new)
  ├── opportunity_id, community_post_id, quote, relevance
  └── PK(opportunity_id, community_post_id)

opportunities (ALTER)
  ├── + evidence_summary jsonb
  ├── + wtp_count int DEFAULT 0
  ├── + source_count jsonb DEFAULT '{}'
  └── + score_breakdown jsonb DEFAULT '{}'

startups (ALTER)
  ├── + last_active_date timestamptz
  └── + status text DEFAULT 'unknown'

crawl_jobs.job_type CHECK (add 'hn', 'reddit', 'indie_hackers', 'community_summarize')
```

### HN Crawler Flow

```
1. Search HN Algolia for pain keywords: "I wish", "looking for", "alternative to"
2. Fetch "Ask HN" tagged posts (often problem-seeking)
3. For each result:
   a. Extract title, body (story_text or first comment), author, url, points
   b. Run WTP keyword scan → set has_wtp
   c. Upsert into community_posts (source="hn", channel="ask_hn"|"show_hn"|"story")
4. Track via crawl_jobs
```

### WTP Keyword Scanner

```typescript
const WTP_KEYWORDS = [
  /i'?d pay/i, /would pay/i, /willing to pay/i, /take my money/i,
  /looking for alternative/i, /need a tool/i, /anyone know a tool/i,
  /i wish there was/i, /someone should build/i, /shut up and take/i,
]

export function hasWillingnessToPay(text: string): boolean {
  return WTP_KEYWORDS.some(re => re.test(text))
}
```

## Related Code Files

| File | Action |
|------|--------|
| `supabase/migrations/20250105000000_add-community-tables.sql` | Create |
| `scripts/crawlers/crawl-hn.ts` | Create |
| `scripts/crawlers/lib/crawler-utils.ts` | Modify: add WTP scanner, upsertCommunityPost |
| `src/lib/types/database.ts` | Modify: add CommunityPost, CommunityPainSummary, update Opportunity, etc. |
| `package.json` | Modify: add `crawl:hn` script |

## Implementation Steps

### 1. Create migration file

File: `supabase/migrations/20250105000000_add-community-tables.sql`

Full SQL:
```sql
-- community_posts
CREATE TABLE community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  external_id text NOT NULL,
  channel text,
  title text,
  body text NOT NULL,
  author text,
  url text NOT NULL,
  score int DEFAULT 0,
  comment_count int DEFAULT 0,
  has_wtp boolean DEFAULT false,
  is_processed boolean DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_community_posts_source CHECK (source IN ('reddit', 'hn', 'indie_hackers')),
  CONSTRAINT uq_community_posts_source_external UNIQUE (source, external_id)
);
CREATE TRIGGER trg_community_posts_updated
  BEFORE UPDATE ON community_posts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE INDEX idx_community_posts_source ON community_posts(source, created_at DESC);
CREATE INDEX idx_community_posts_unprocessed ON community_posts(created_at) WHERE is_processed = false;
CREATE INDEX idx_community_posts_wtp ON community_posts(has_wtp) WHERE has_wtp = true;

-- community_pain_summaries
CREATE TABLE community_pain_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  topic text NOT NULL,
  themes jsonb NOT NULL DEFAULT '[]',
  total_posts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_community_pain_summaries UNIQUE (source, topic)
);
CREATE TRIGGER trg_community_pain_summaries_updated
  BEFORE UPDATE ON community_pain_summaries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- opportunity_community_posts junction
CREATE TABLE opportunity_community_posts (
  opportunity_id uuid NOT NULL,
  community_post_id uuid NOT NULL,
  quote text,
  relevance text,
  CONSTRAINT pk_opp_community PRIMARY KEY (opportunity_id, community_post_id),
  CONSTRAINT fk_opp_community_opp FOREIGN KEY (opportunity_id) REFERENCES opportunities(id) ON DELETE CASCADE,
  CONSTRAINT fk_opp_community_post FOREIGN KEY (community_post_id) REFERENCES community_posts(id) ON DELETE CASCADE
);
CREATE INDEX idx_opp_community_post ON opportunity_community_posts(community_post_id);

-- Enhance existing opportunity_reviews with quote + relevance
ALTER TABLE opportunity_reviews ADD COLUMN quote text;
ALTER TABLE opportunity_reviews ADD COLUMN relevance text;

-- Enhance opportunities with traceability columns
ALTER TABLE opportunities ADD COLUMN evidence_summary jsonb DEFAULT '{}';
ALTER TABLE opportunities ADD COLUMN wtp_count int DEFAULT 0;
ALTER TABLE opportunities ADD COLUMN source_count jsonb DEFAULT '{}';
ALTER TABLE opportunities ADD COLUMN score_breakdown jsonb DEFAULT '{}';

-- Startup enrichment
ALTER TABLE startups ADD COLUMN last_active_date timestamptz;
ALTER TABLE startups ADD COLUMN status text DEFAULT 'unknown';

-- Expand crawl_jobs job_type check
ALTER TABLE crawl_jobs DROP CONSTRAINT chk_crawl_jobs_type;
ALTER TABLE crawl_jobs ADD CONSTRAINT chk_crawl_jobs_type CHECK (job_type IN (
  'app_store', 'google_play', 'yc', 'product_hunt', 'unikorn', 'analyze',
  'hn', 'reddit', 'indie_hackers', 'community_summarize'
));
```

### 2. Add TypeScript types

Add to `src/lib/types/database.ts`:
- `CommunityPost` type
- `CommunityPostInsert` type
- `CommunityPainSummary` type
- Update `Opportunity` with new fields
- Update `OpportunityReview` with quote + relevance
- Add `OpportunityCommunityPost` type
- Update `Startup` with last_active_date + status
- Update `CrawlJob.job_type` union

### 3. Add WTP scanner + upsert helper to crawler-utils

Add `hasWillingnessToPay(text: string): boolean` function.
Add `upsertCommunityPost(data: CommunityPostInsert): Promise<CommunityPost | null>` function following same pattern as `upsertReview`.

### 4. Build crawl-hn.ts

Structure (following `crawl-yc-launches.ts` pattern):
```
main()
  ├── startCrawlJob("hn")
  ├── searchHNAlgolia(queries) — multiple keyword searches
  ├── fetchAskHNPosts() — "Ask HN" tagged
  ├── dedup results by external_id
  ├── for each post:
  │   ├── extract title, body (story_text || first_comment), url, points
  │   ├── hasWillingnessToPay(title + body)
  │   └── upsertCommunityPost()
  └── completeCrawlJob()
```

HN Algolia endpoints:
- Search: `https://hn.algolia.com/api/v1/search?query=KEYWORD&tags=ask_hn`
- Search: `https://hn.algolia.com/api/v1/search?query=KEYWORD&tags=story`
- Recent: `https://hn.algolia.com/api/v1/search_by_date?tags=ask_hn&numericFilters=points>5`

### 5. Add pnpm script

```json
"crawl:hn": "tsx scripts/crawlers/crawl-hn.ts"
```

### 6. Apply migration

```bash
supabase db push  # or supabase migration up
```

## Todo List

- [ ] Write migration SQL file
- [ ] Apply migration to local Supabase
- [ ] Add all new TypeScript types to database.ts
- [ ] Add `hasWillingnessToPay()` to crawler-utils.ts
- [ ] Add `upsertCommunityPost()` to crawler-utils.ts
- [ ] Create `crawl-hn.ts` with Algolia API integration
- [ ] Add `crawl:hn` script to package.json
- [ ] Test: run `pnpm crawl:hn` and verify posts in community_posts table
- [ ] Verify WTP flags are set correctly on relevant posts

## Success Criteria

- All new tables created with correct constraints and indexes
- `pnpm crawl:hn` fetches 50+ posts from HN Algolia
- WTP-flagged posts contain actual willingness-to-pay language
- Existing opportunity_reviews data unaffected (new columns nullable)
- TypeScript types compile without errors

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| HN Algolia API changes | API has been stable for years; minimal risk |
| Migration conflicts with existing data | All new columns have defaults; ALTERs are backward-compatible |
| WTP false positives | Keyword list is conservative; can tune later |

## Security Considerations

- HN Algolia API requires no auth — no secrets to manage
- No user-generated content stored that needs sanitization (HN text is pre-sanitized)

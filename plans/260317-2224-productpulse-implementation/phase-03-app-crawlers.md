# Phase 3: Crawler Shared Utilities + App Crawlers

## Context Links
- [Brainstorm — pnpm scripts](../reports/brainstorm-260317-2137-project-architecture.md)
- [Phase 2 — DB types](phase-02-database-supabase-setup.md)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 5h
- **Description:** Build shared crawler utilities (logging, rate limiting, upsert helpers, crawl_jobs tracking) then implement App Store and Google Play crawlers.

## Key Insights
- App Store: Apple RSS feed for reviews + iTunes Lookup API for metadata
- Google Play: `google-play-scraper` npm package
- Both crawlers upsert to `apps` table using `(store, store_id)` unique constraint
- Every crawl run logged to `crawl_jobs` table
- Crawlers run via `pnpm crawl:appstore` and `pnpm crawl:gplay`

## Requirements

### Functional
- Shared `crawler-utils.ts`: logging, rate limiter, upsert helper, crawl_jobs lifecycle
- App Store crawler: fetch app metadata + enrich (description, downloads, rating, MRR)
- Google Play crawler: same via google-play-scraper
- Both: upsert apps, create crawl_jobs record

### Non-functional
- Graceful error handling — failed crawl logged to crawl_jobs with error_message
- Rate limiting — configurable delay between requests
- Idempotent — safe to re-run (upsert on unique constraint)

## Architecture

### Crawler Utils
```typescript
// scripts/crawlers/lib/crawler-utils.ts
export function createLogger(source: string): Logger
export function rateLimit(ms: number): () => Promise<void>
export async function startCrawlJob(type: string, appId?: string): Promise<string>
export async function completeCrawlJob(id: string, counts: ItemCounts): Promise<void>
export async function failCrawlJob(id: string, error: string): Promise<void>
export async function upsertApp(data: AppInsert): Promise<App>
```

### App Store Flow
```
1. Fetch RSS feed for target categories → get app IDs
2. For each app: iTunes Lookup API → full metadata
3. Upsert to apps table (store='app_store')
4. Log to crawl_jobs
```

### Google Play Flow
```
1. Use google-play-scraper → search/list by category
2. For each app: .app() for full metadata
3. Upsert to apps table (store='google_play')
4. Log to crawl_jobs
```

## Related Code Files

### Create
- `scripts/crawlers/lib/crawler-utils.ts` — shared utilities
- `scripts/crawlers/crawl-app-store.ts` — Apple RSS + iTunes Lookup
- `scripts/crawlers/crawl-google-play.ts` — google-play-scraper

### Modify
- None (all new files)

### Dependencies
- `scripts/crawlers/lib/supabase-admin.ts` (from Phase 2)
- `src/lib/types/database.ts` (from Phase 2)

## Implementation Steps

1. **Create `crawler-utils.ts`**
   - `createLogger(source)` — prefixed console.log with timestamps
   - `rateLimit(ms)` — returns async function that waits `ms` between calls
   - `startCrawlJob(jobType, appId?)` — insert crawl_jobs row (status='running', started_at=now), return job ID
   - `completeCrawlJob(jobId, {found, inserted, updated})` — update status='completed', completed_at=now
   - `failCrawlJob(jobId, errorMessage)` — update status='failed', error_message
   - `upsertApp(data)` — upsert using `onConflict: 'store,store_id'`

2. **Create `crawl-app-store.ts`**
   - Define target categories/app bundle IDs (configurable array at top of file)
   - Fetch Apple RSS: `https://itunes.apple.com/{country}/rss/topfreeapplications/limit=50/genre={genreId}/json`
   - For each app ID: iTunes Lookup `https://itunes.apple.com/lookup?bundleId={id}`
   - Map response → AppInsert type:
     - `store`: 'app_store'
     - `store_id`: bundleId
     - `name`, `category`, `price`, `icon_url`, `store_url`
     - `description`, `overall_rating`, `avg_rating`
   - Upsert all apps, track counts
   - Start/complete crawl_job

3. **Create `crawl-google-play.ts`**
   - Import `gplay` from `google-play-scraper`
   - Use `gplay.list({ category, num: 50 })` for target categories
   - For each: `gplay.app({ appId })` for full metadata
   - Map → AppInsert:
     - `store`: 'google_play'
     - `store_id`: appId (package name)
     - `name`, `category`, `price` (free/paid), `icon_url`, `store_url`
     - `description`, `downloads` (installs), `overall_rating`, `avg_rating`
     - `estimated_mrr`: derive from price + installs (rough estimate)
   - Upsert all, log crawl_job

4. **Add target categories** — start with:
   - Productivity, Health & Fitness, Finance, Education, Business
   - Configurable at top of each crawler file

5. **Error handling** — wrap main() in try/catch:
   ```typescript
   async function main() {
     const jobId = await startCrawlJob('app_store')
     try {
       // ... crawl logic
       await completeCrawlJob(jobId, counts)
     } catch (err) {
       await failCrawlJob(jobId, err.message)
       process.exit(1)
     }
   }
   main()
   ```

6. **Test** — run `pnpm crawl:appstore` and `pnpm crawl:gplay`, verify apps in DB

## Todo List

- [ ] Create crawler-utils.ts with logging, rate limit, crawl_jobs helpers
- [ ] Create upsertApp helper using Supabase onConflict
- [ ] Implement App Store crawler (RSS + iTunes Lookup)
- [ ] Implement Google Play crawler (google-play-scraper)
- [ ] Define target categories for both stores
- [ ] Add error handling + crawl_jobs lifecycle
- [ ] Test crawl:appstore — verify apps inserted
- [ ] Test crawl:gplay — verify apps inserted
- [ ] Verify crawl_jobs records created

## Success Criteria
- `pnpm crawl:appstore` inserts/updates apps from App Store
- `pnpm crawl:gplay` inserts/updates apps from Google Play
- `crawl_jobs` table has records with correct counts
- Re-running is idempotent (upsert, no duplicates)

## Risk Assessment
- **Apple RSS deprecation**: RSS feeds are long-lived, but monitor for changes
- **google-play-scraper rate limits**: Use rateLimit utility, keep batch sizes reasonable
- **MRR estimation**: Rough heuristic only — document methodology

## Next Steps
→ Phase 4: Startup crawlers (can run in parallel)
→ Phase 5: Review crawler (needs apps in DB first)

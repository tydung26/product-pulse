# Phase 5: Review Crawler

## Context Links
- [Brainstorm — store_reviews table](../reports/brainstorm-260317-2137-project-architecture.md)
- [Phase 3 — app crawlers](phase-03-app-crawlers.md)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 3h
- **Description:** Implement `crawl:store_reviews` — fetches 1-3 star reviews for all active apps from both App Store and Google Play. Runs as Step 2 of the 3-step pipeline.

## Key Insights
- Only fetch 1-3 star reviews (pain point signal)
- Runs after `crawl:apps` (needs apps in DB)
- Iterates over all `is_active=true` apps
- App Store: Apple RSS feed (filtered by rating)
- Google Play: `google-play-scraper` reviews method
- Upsert on `(source, external_id)` — safe to re-run
- Sets `is_processed=false` for new reviews (AI step picks them up)

## Requirements

### Functional
- Single script handles both store sources
- Fetch reviews for each active app
- Filter: only 1-3 star ratings
- Upsert reviews, mark new ones `is_processed=false`
- One crawl_job per app crawled

### Non-functional
- Rate limiting between apps (avoid API throttling)
- Configurable max reviews per app (default: 100)
- Skip apps crawled within last 24h (use `last_crawled_at`)
- Update `apps.last_crawled_at` after crawling

## Architecture

```
crawl-store-reviews.ts
  │
  ├─ Query: SELECT * FROM apps WHERE is_active = true
  │         AND (last_crawled_at IS NULL OR last_crawled_at < now() - interval '24h')
  │
  ├─ For each app:
  │   ├─ If store = 'app_store' → fetch Apple RSS reviews
  │   ├─ If store = 'google_play' → fetch via google-play-scraper
  │   ├─ Filter: rating IN (1, 2, 3)
  │   ├─ Upsert to store_reviews (is_processed=false)
  │   ├─ Update apps.last_crawled_at
  │   └─ Log crawl_job per app
  │
  └─ Summary: total apps crawled, total reviews found/inserted
```

## Related Code Files

### Create
- `scripts/crawlers/crawl-store-reviews.ts`

### Modify
- `scripts/crawlers/lib/crawler-utils.ts` — add `upsertReview()`, `updateAppLastCrawled()`

### Dependencies
- `scripts/crawlers/lib/supabase-admin.ts` (Phase 2)
- `scripts/crawlers/lib/crawler-utils.ts` (Phase 3)
- Requires apps in DB (Phase 3 must run first)

## Implementation Steps

1. **Extend crawler-utils.ts**
   - `upsertReview(data: StoreReviewInsert)` — upsert on `(source, external_id)`
   - `updateAppLastCrawled(appId: string)` — set `last_crawled_at = now()`
   - `getActiveApps()` — query active apps not crawled in last 24h

2. **Create `crawl-store-reviews.ts`**
   - Fetch active apps from DB
   - For each app, dispatch to store-specific fetcher:

3. **App Store review fetcher**
   ```typescript
   async function fetchAppStoreReviews(app: App): Promise<ReviewData[]>
   ```
   - Apple RSS: `https://itunes.apple.com/{country}/rss/customerreviews/id={storeId}/sortBy=mostRecent/json`
   - Parse JSON feed → extract: author, rating, title, body, review_date
   - Filter: `rating <= 3`
   - Map to StoreReviewInsert (source='app_store', external_id from feed)

4. **Google Play review fetcher**
   ```typescript
   async function fetchGooglePlayReviews(app: App): Promise<ReviewData[]>
   ```
   - `gplay.reviews({ appId: app.store_id, sort: gplay.sort.NEWEST, num: 100 })`
   - Filter: `score <= 3`
   - Map to StoreReviewInsert (source='google_play', external_id=reviewId)

5. **Main orchestration loop**
   ```typescript
   const apps = await getActiveApps()
   for (const app of apps) {
     const jobId = await startCrawlJob(app.store, app.id)
     try {
       const reviews = app.store === 'app_store'
         ? await fetchAppStoreReviews(app)
         : await fetchGooglePlayReviews(app)

       let inserted = 0
       for (const review of reviews) {
         const result = await upsertReview({ ...review, app_id: app.id })
         if (result) inserted++
       }

       await updateAppLastCrawled(app.id)
       await completeCrawlJob(jobId, { found: reviews.length, inserted, updated: 0 })
     } catch (err) {
       await failCrawlJob(jobId, err.message)
     }
     await rateLimiter() // delay between apps
   }
   ```

6. **Summary output** — log total apps processed, reviews found/inserted

7. **Test** — run `pnpm crawl:store_reviews` after apps exist in DB

## Todo List

- [ ] Add upsertReview to crawler-utils
- [ ] Add updateAppLastCrawled to crawler-utils
- [ ] Add getActiveApps query helper
- [ ] Implement App Store review fetcher (RSS)
- [ ] Implement Google Play review fetcher (google-play-scraper)
- [ ] Create main orchestration loop with per-app error handling
- [ ] Add 24h skip logic using last_crawled_at
- [ ] Add summary logging
- [ ] Test crawl:store_reviews with real apps in DB
- [ ] Verify reviews in DB with is_processed=false

## Success Criteria
- `pnpm crawl:store_reviews` fetches reviews for all active apps
- Only 1-3 star reviews stored
- `is_processed=false` on all new reviews
- `apps.last_crawled_at` updated after crawl
- crawl_jobs records created per app
- Re-running within 24h skips already-crawled apps

## Risk Assessment
- **Apple RSS review limits**: RSS may return limited results (~50). Acceptable for MVP.
- **Google Play scraper rate limits**: Use rate limiter, process sequentially
- **No apps in DB**: Script should log "no active apps" and exit cleanly

## Next Steps
→ Phase 6: AI analysis pipeline (reads unprocessed reviews)

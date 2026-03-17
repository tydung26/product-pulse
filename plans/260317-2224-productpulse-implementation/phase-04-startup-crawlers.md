# Phase 4: Startup Crawlers (YC, Product Hunt, Unikorn)

## Context Links
- [Brainstorm — startup sources](../reports/brainstorm-260317-2137-project-architecture.md)
- [Phase 3 — crawler-utils](phase-03-app-crawlers.md)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 5h
- **Description:** Implement 3 startup crawlers: YC Launches (Cheerio), Product Hunt (GraphQL API or scrape), Unikorn.vn (Cheerio). Each upserts to `startups` + `startup_comments` tables.

## Key Insights
- YC Launches: HTML scraping with Cheerio, recent launches only (last 30 days)
- Product Hunt: Try GraphQL API first (needs free dev token), fallback to scrape
- Unikorn.vn: Need to inspect if SSR or SPA before choosing method
- All three upsert on `(source, source_id)` unique constraint
- Comments stored in `startup_comments` table (YC + PH have discussions)

## Requirements

### Functional
- Add `upsertStartup()` and `upsertStartupComment()` to crawler-utils
- YC crawler: scrape launches, extract name/tagline/description/comments
- PH crawler: fetch products via API, extract metadata + comments
- Unikorn crawler: scrape startups, extract name/description/category/funding

### Non-functional
- All crawlers log to `crawl_jobs`
- Graceful failures — one startup failing doesn't stop the batch
- Rate limiting per source

## Architecture

### YC Launches Flow
```
1. Fetch https://www.ycombinator.com/launches (paginated or recent)
2. Cheerio: parse launch cards → name, tagline, description, launch_date
3. For each launch: fetch detail page → full description + comments
4. Upsert startups (source='yc') + startup_comments
5. Log crawl_job
```

### Product Hunt Flow
```
Option A (API):
1. POST https://api.producthunt.com/v2/api/graphql
2. Query: posts(first: 50, postedAfter: "30_days_ago")
3. Extract: name, tagline, description, upvotes, url, maker
4. For each: fetch comments from API
5. Upsert startups (source='producthunt') + startup_comments

Option B (Scrape fallback):
1. Fetch producthunt.com/posts (today or recent)
2. Cheerio parse → same fields
3. Detail pages for comments
```

### Unikorn Flow
```
1. Fetch https://unikorn.vn/
2. Inspect DOM structure (SSR vs SPA check)
3. If SSR: Cheerio parse startup cards
4. Extract: name, description, category, funding_stage, logo
5. Upsert startups (source='unikorn')
6. Log crawl_job
```

## Related Code Files

### Create
- `scripts/crawlers/crawl-yc-launches.ts`
- `scripts/crawlers/crawl-product-hunt.ts`
- `scripts/crawlers/crawl-unikorn.ts`

### Modify
- `scripts/crawlers/lib/crawler-utils.ts` — add `upsertStartup()`, `upsertStartupComment()`

### Dependencies
- `scripts/crawlers/lib/supabase-admin.ts` (Phase 2)
- `scripts/crawlers/lib/crawler-utils.ts` (Phase 3)
- `src/lib/types/database.ts` (Phase 2)

## Implementation Steps

1. **Extend crawler-utils.ts**
   - `upsertStartup(data: StartupInsert)` — upsert on `(source, source_id)`
   - `upsertStartupComment(data: StartupCommentInsert)` — insert (no natural unique key, use `external_id` or skip duplicates by checking existence)
   - `fetchHtml(url: string)` — shared fetch + cheerio load helper

2. **Implement `crawl-yc-launches.ts`**
   - Fetch launches page
   - Parse with Cheerio: `.launch-card` or equivalent selector
   - Extract: name, tagline, YC batch, launch date
   - source_id: slug from URL or unique identifier
   - Fetch each launch detail page for full description + comments
   - Map comments → `startup_comments` (author, body, posted_at)
   - Store YC-specific data in `metadata` JSONB (batch, team size)

3. **Implement `crawl-product-hunt.ts`**
   - Check if `PRODUCTHUNT_TOKEN` env var exists → use API
   - **API path**: GraphQL query for recent posts
     ```graphql
     query { posts(first: 50, order: NEWEST) {
       edges { node { id name tagline description votesCount url
         comments { edges { node { body user { name } createdAt } } }
       } }
     } }
     ```
   - **Scrape fallback**: fetch producthunt.com/posts, parse HTML
   - Map → StartupInsert (source='producthunt', source_id=PH post ID)
   - Map comments → startup_comments

4. **Implement `crawl-unikorn.ts`**
   - First: fetch page, check if content is in HTML (SSR) or requires JS (SPA)
   - If SSR: parse with Cheerio
   - If SPA: log warning, skip for now (would need Playwright — defer)
   - Extract: name, description, category, funding info, logo
   - source_id: slug or company name hash
   - No comments for Unikorn (listing site)
   - Store funding details in `metadata` JSONB

5. **Error handling per item**
   ```typescript
   for (const item of launches) {
     try {
       await upsertStartup(mapToInsert(item))
       counts.inserted++
     } catch (err) {
       logger.warn(`Failed to upsert ${item.name}: ${err.message}`)
       // Continue — don't stop batch for one failure
     }
   }
   ```

6. **Test each crawler independently**
   - `pnpm crawl:yc` — verify startups + comments in DB
   - `pnpm crawl:ph` — verify (with or without token)
   - `pnpm crawl:unikorn` — verify startups in DB

## Todo List

- [ ] Add upsertStartup and upsertStartupComment to crawler-utils
- [ ] Add fetchHtml helper to crawler-utils
- [ ] Implement YC Launches crawler (Cheerio)
- [ ] Implement Product Hunt crawler (API + scrape fallback)
- [ ] Implement Unikorn crawler (Cheerio, SSR check)
- [ ] Handle per-item errors gracefully
- [ ] Store source-specific metadata in JSONB columns
- [ ] Test crawl:yc — verify data in DB
- [ ] Test crawl:ph — verify data in DB
- [ ] Test crawl:unikorn — verify data in DB
- [ ] Verify crawl_jobs records for all 3 sources

## Success Criteria
- `pnpm crawl:yc` inserts YC launches + comments
- `pnpm crawl:ph` inserts PH products + comments
- `pnpm crawl:unikorn` inserts startups (or logs SPA warning)
- All three create crawl_jobs records
- Re-running is idempotent

## Risk Assessment
- **YC HTML structure changes**: Pin selectors, test regularly. Log when 0 items found.
- **PH API token requirement**: Implement both paths. Document token setup.
- **Unikorn SPA**: If SPA, defer to future (needs Playwright). Not a blocker.
- **Cheerio selector fragility**: Add comments noting which DOM elements are targeted

## Next Steps
→ Phase 5: Review crawler (can start once Phase 3 has apps in DB)
→ Phase 6: AI analysis (needs Phase 3+4+5 complete)

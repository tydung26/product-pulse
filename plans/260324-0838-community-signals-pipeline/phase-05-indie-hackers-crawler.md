# Phase 5: Indie Hackers Crawler

## Context Links

- Phase 3 (prerequisite): `phase-03-db-schema-and-hn-crawler.md`
- HN crawler (reference): `scripts/crawlers/crawl-hn.ts`
- YC crawler (scraping reference): `scripts/crawlers/crawl-yc-launches.ts`

## Overview

- **Priority:** P3 (nice-to-have; less reliable than API-based crawlers)
- **Status:** pending
- **Effort:** 3h
- **Description:** Web scraper for Indie Hackers posts. Focus on problem/request posts and revenue discussions. Graceful failure since scraping is fragile.

## Key Insights

- Indie Hackers has no public API — web scraping only
- Site structure may have changed; need to scout before committing
- Content is high-signal for builder pain (revenue struggles, tool requests, feature gaps)
- cheerio already in dependencies (used by YC crawler)
- Site renders some content client-side — may need to check if static HTML has enough data

## Requirements

### Functional

1. Scrape Indie Hackers discussion posts (problem/request categories)
2. Extract title, body, author, url, upvote count
3. WTP keyword scan on title + body
4. Upsert into `community_posts` (source="indie_hackers")
5. Target sections: "/discuss" general discussions, revenue-related posts

### Non-functional

- Graceful failure if site structure changed (warn + skip, don't crash pipeline)
- Rate limit: 2s between requests (polite scraping)
- Maximum 200 posts per crawl run (avoid hammering)

## Architecture

### Crawl Strategy

```
1. Fetch /discuss listing page
2. Extract post links from listing
3. For each post:
   a. Fetch detail page
   b. Extract title, body, author, reactions
   c. WTP scan → set has_wtp
   d. Upsert into community_posts
4. Paginate via listing pages (if available)
```

### Fallback: If Client-Side Rendered

If cheerio can't extract content (JS-rendered):
- Option A: Use Indie Hackers RSS feed (if available)
- Option B: Skip this crawler entirely (it's P3 priority)
- Do NOT add a headless browser dependency (YAGNI)

## Related Code Files

| File | Action |
|------|--------|
| `scripts/crawlers/crawl-indie-hackers.ts` | Create |
| `scripts/crawlers/lib/crawler-utils.ts` | No change (uses existing upsertCommunityPost + WTP) |
| `package.json` | Modify: add `crawl:ih` script |

## Implementation Steps

### 1. Scout site structure

Before building, manually check:
- Does `https://www.indiehackers.com/discuss` render post listings in static HTML?
- What selectors identify post titles, body, authors?
- Is there an RSS feed at `/feed.xml` or similar?

### 2. Create crawl-indie-hackers.ts

Structure (following YC crawler pattern):
```typescript
import * as cheerio from "cheerio"
import {
  createLogger, rateLimit, startCrawlJob, completeCrawlJob,
  failCrawlJob, upsertCommunityPost, fetchHtml, hasWillingnessToPay,
} from "./lib/crawler-utils"

const logger = createLogger("indie-hackers")
const delay = rateLimit(2000) // 2s between requests
const MAX_POSTS = 200

const LISTING_URL = "https://www.indiehackers.com/discuss"

async function fetchDiscussionList(): Promise<{title: string, url: string, slug: string}[]> {
  const html = await fetchHtml(LISTING_URL)
  const $ = cheerio.load(html)
  const posts: {title: string, url: string, slug: string}[] = []
  // Extract post links — selectors TBD after scouting
  // ...
  return posts.slice(0, MAX_POSTS)
}

async function fetchPostDetail(url: string) {
  const html = await fetchHtml(url)
  const $ = cheerio.load(html)
  // Extract body, author, reactions — selectors TBD
  return { body: "", author: "", reactions: 0 }
}
```

### 3. Handle scraping failure gracefully

Wrap entire crawler in try/catch at top level. If initial listing fetch fails or returns 0 posts:
```typescript
if (posts.length === 0) {
  logger.warn("No posts found — site structure may have changed. Skipping.")
  await completeCrawlJob(jobId, { found: 0, inserted: 0, updated: 0 })
  return
}
```

### 4. Add pnpm script

```json
"crawl:ih": "tsx scripts/crawlers/crawl-indie-hackers.ts"
```

## Todo List

- [ ] Scout Indie Hackers site structure (manual check + document selectors)
- [ ] Create `crawl-indie-hackers.ts` with listing + detail scraping
- [ ] Handle client-side rendering gracefully (skip if HTML empty)
- [ ] Rate limit at 2s between requests
- [ ] Cap at 200 posts per run
- [ ] Add `crawl:ih` script to package.json
- [ ] Test: run `pnpm crawl:ih` and verify posts in community_posts
- [ ] Document actual selectors used (fragile — will need maintenance)

## Success Criteria

- `pnpm crawl:ih` either fetches posts OR gracefully reports site changed
- Posts correctly tagged with source="indie_hackers"
- No crash on scraping failure
- WTP flags set on relevant posts

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| Site structure changed | Crawler returns 0 posts | Graceful failure + warning; P3 priority |
| Client-side rendering | Can't extract with cheerio | Check for RSS feed fallback; skip if needed |
| Rate limiting / IP ban | Temporary block | 2s delay, max 200 posts, polite User-Agent |
| Content quality varies | Noisy data | WTP filter + AI summarization handles noise |

## Security Considerations

- No auth required (public pages)
- Respect robots.txt
- Polite crawling: 2s delay, identify via User-Agent

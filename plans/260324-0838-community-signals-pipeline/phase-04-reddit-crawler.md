# Phase 4: Reddit Crawler

## Context Links

- Phase 3 (prerequisite): `phase-03-db-schema-and-hn-crawler.md`
- Crawler utils: `scripts/crawlers/lib/crawler-utils.ts`
- HN crawler (reference pattern): `scripts/crawlers/crawl-hn.ts`

## Overview

- **Priority:** P2
- **Status:** pending
- **Effort:** 4h
- **Description:** Build Reddit crawler using OAuth API. Target pain-related posts from SaaS/business subreddits with keyword searches. Rate limited to 100 req/min.

## Key Insights

- Reddit API requires OAuth app-only flow (client_credentials grant). No user login needed.
- Rate limit: 100 requests per minute (enforced via headers `X-Ratelimit-Remaining`)
- Reddit returns max 100 results per listing page; use `after` cursor for pagination
- Subreddit selection is critical for signal quality — start narrow, expand based on results

## Requirements

### Functional

1. Reddit OAuth token management (client_credentials flow, auto-refresh)
2. Crawl target subreddits for recent posts (last 30 days)
3. Keyword search across subreddits: "I wish", "looking for", "alternative to", etc.
4. Extract title, selftext, author, url, score, num_comments
5. Run WTP keyword scan on title + selftext
6. Upsert into `community_posts` (source="reddit")
7. Rate limit: respect 100 req/min with adaptive backoff from response headers

### Non-functional

- Graceful handling of rate limit (429) responses
- Crawler must work with just `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET`
- Skip if env vars missing (warn, don't crash)

## Architecture

### OAuth Flow

```
POST https://www.reddit.com/api/v1/access_token
  grant_type=client_credentials
  Authorization: Basic base64(CLIENT_ID:CLIENT_SECRET)
  → { access_token, expires_in }

Use token in: Authorization: Bearer <token>
Auto-refresh when expired (track expiry timestamp)
```

### Crawl Strategy

```
1. Authenticate (client_credentials)
2. For each subreddit:
   a. Fetch /r/{sub}/new?limit=100&t=month
   b. Filter posts with selftext (skip link-only)
   c. WTP scan + upsert
3. For each keyword search:
   a. Fetch /search?q={keyword}&sort=new&t=month&restrict_sr=false
   b. WTP scan + upsert
4. Dedup handled by UNIQUE(source, external_id) constraint
```

### Target Subreddits (Initial)

```typescript
const SUBREDDITS = [
  "SaaS",
  "smallbusiness",
  "Entrepreneur",
  "selfhosted",
  "startups",
  "webdev",
  "ProductManagement",
  "indiehackers",
]
```

### Search Keywords

```typescript
const SEARCH_QUERIES = [
  "I wish there was",
  "looking for alternative",
  "anyone know a tool",
  "need a tool for",
  "frustrated with",
  "would pay for",
]
```

## Related Code Files

| File | Action |
|------|--------|
| `scripts/crawlers/crawl-reddit.ts` | Create |
| `scripts/crawlers/lib/reddit-auth.ts` | Create (OAuth token management) |
| `scripts/crawlers/lib/crawler-utils.ts` | Already has `upsertCommunityPost` from Phase 3 |
| `package.json` | Modify: add `crawl:reddit` script |
| `.env.local` | Add REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET |

## Implementation Steps

### 1. Create reddit-auth.ts

OAuth token manager class:
```typescript
export class RedditAuth {
  private token: string | null = null
  private expiresAt = 0

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  async getToken(): Promise<string> {
    if (this.token && Date.now() < this.expiresAt - 60_000) return this.token
    // POST /api/v1/access_token, grant_type=client_credentials
    // Parse response, set this.token and this.expiresAt
    return this.token!
  }

  async fetchAuthenticated(url: string): Promise<Response> {
    const token = await this.getToken()
    return fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "ProductPulse/1.0",
      },
    })
  }
}
```

### 2. Create crawl-reddit.ts

Structure:
```
main()
  ├── Check env vars (skip gracefully if missing)
  ├── startCrawlJob("reddit")
  ├── RedditAuth.init()
  ├── crawlSubreddits(SUBREDDITS)
  │   └── For each: GET /r/{sub}/new → parse listing → upsert
  ├── searchKeywords(SEARCH_QUERIES)
  │   └── For each: GET /search?q={kw} → parse listing → upsert
  ├── Rate limit: adaptive from X-Ratelimit-Remaining header
  └── completeCrawlJob()
```

Reddit listing response shape:
```typescript
type RedditListing = {
  data: {
    after: string | null
    children: Array<{
      data: {
        id: string
        subreddit: string
        title: string
        selftext: string
        author: string
        url: string
        permalink: string
        score: number
        num_comments: number
        created_utc: number
      }
    }>
  }
}
```

Map to `CommunityPostInsert`:
```typescript
{
  source: "reddit",
  external_id: post.id,
  channel: post.subreddit,
  title: post.title,
  body: post.selftext,
  author: post.author,
  url: `https://reddit.com${post.permalink}`,
  score: post.score,
  comment_count: post.num_comments,
  has_wtp: hasWillingnessToPay(post.title + " " + post.selftext),
}
```

### 3. Rate limiting

Use adaptive rate limiting from Reddit response headers:
```typescript
async function respectRateLimit(response: Response): Promise<void> {
  const remaining = parseInt(response.headers.get("X-Ratelimit-Remaining") ?? "100")
  const resetSecs = parseInt(response.headers.get("X-Ratelimit-Reset") ?? "60")
  if (remaining < 5) {
    await new Promise(r => setTimeout(r, resetSecs * 1000))
  }
}
```

Plus fallback: minimum 600ms between requests (100 req/min).

### 4. Add pnpm script

```json
"crawl:reddit": "tsx scripts/crawlers/crawl-reddit.ts"
```

## Todo List

- [ ] Create `reddit-auth.ts` with OAuth client_credentials flow
- [ ] Create `crawl-reddit.ts` with subreddit + keyword crawling
- [ ] Implement adaptive rate limiting from response headers
- [ ] Map Reddit posts to CommunityPostInsert format
- [ ] Filter out link-only posts (no selftext)
- [ ] Add `crawl:reddit` script to package.json
- [ ] Add REDDIT_CLIENT_ID/SECRET to .env.example
- [ ] Test: run `pnpm crawl:reddit` with valid credentials
- [ ] Verify WTP flags and channel mapping

## Success Criteria

- `pnpm crawl:reddit` fetches posts from all target subreddits
- Rate limit never exceeded (no 429 responses)
- Posts correctly mapped with source="reddit", channel=subreddit name
- WTP flags set on posts containing pay/wish/need keywords
- Graceful skip when env vars missing

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Reddit rate limit (100/min) | Adaptive backoff from headers + minimum 600ms delay |
| Reddit API changes/deprecation | OAuth is stable; monitor for breaking changes |
| Low signal-to-noise ratio | Target specific subreddits + keyword filter; WTP scan |
| OAuth token expiry mid-crawl | Auto-refresh in RedditAuth class |

## Security Considerations

- `REDDIT_CLIENT_ID` and `REDDIT_CLIENT_SECRET` in `.env.local` (never committed)
- Token stored in-memory only, not persisted
- User-Agent identifies the app per Reddit API rules

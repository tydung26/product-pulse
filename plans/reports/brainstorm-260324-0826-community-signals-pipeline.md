# Brainstorm: Community Signals + Pipeline Enhancement

**Date:** 2026-03-24
**Goal:** Enhance ProductPulse with community signal sources (Reddit, HN, Indie Hackers) AND fix/improve the existing analysis pipeline. PP is a personal research tool, not the product itself.

## Problem Statement

Current pipeline only crawls app store reviews (1-3 stars). This biases toward bug/UX complaints in existing consumer apps. Missing:
- Unmet needs ("I wish X existed")
- Willingness-to-pay signals ("I'd pay for...")
- Builder/business pain (not just consumer)
- Cross-source validation (same pain in reviews AND community = strong signal)

## Agreed Architecture

### New Crawlers

| Crawler | API | Auth | Target Content |
|---|---|---|---|
| `crawl-reddit.ts` | Reddit OAuth API | `REDDIT_CLIENT_ID` + `REDDIT_CLIENT_SECRET` | Pain posts from r/SaaS, r/smallbusiness, r/Entrepreneur, r/selfhosted + keyword searches |
| `crawl-hn.ts` | HN Algolia API (free) | None | "Ask HN" posts, "Show HN" negative comments, pain discussions |
| `crawl-indie-hackers.ts` | Web scraping | None | Builder problems, revenue posts, feature requests |

### DB Schema Changes

**New table: `community_posts`**
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
source          text NOT NULL  -- "reddit" | "hn" | "indie_hackers"
external_id     text NOT NULL  -- unique per source
channel         text           -- subreddit, "ask_hn", "show_hn", etc.
title           text
body            text NOT NULL
author          text
url             text NOT NULL
score           int DEFAULT 0  -- upvotes/points
comment_count   int DEFAULT 0
has_wtp         boolean DEFAULT false  -- willingness-to-pay keyword detected
is_processed    boolean DEFAULT false
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
UNIQUE(source, external_id)
```

**New table: `community_pain_summaries`**
```sql
id              uuid PRIMARY KEY DEFAULT gen_random_uuid()
source          text NOT NULL
topic           text NOT NULL  -- AI-assigned topic cluster
themes          jsonb NOT NULL -- same shape as app_pain_summaries.themes
total_posts     int NOT NULL
created_at      timestamptz DEFAULT now()
updated_at      timestamptz DEFAULT now()
UNIQUE(source, topic)
```

### Pipeline Flow

```
EXISTING (unchanged):
  crawl apps → crawl reviews → summarize-app-reviews → app_pain_summaries

NEW (parallel):
  crawl-reddit ─┐
  crawl-hn ─────┼→ community_posts → summarize-community → community_pain_summaries
  crawl-ih ─────┘

MODIFIED:
  analyze.ts reads app_pain_summaries + community_pain_summaries
  → cross-references pain across sources
  → final cross-category pass for platform opportunities
  → opportunities (enhanced with community evidence)
```

### Willingness-to-Pay Detection

Keyword scan at crawl time (no AI cost):
- "I'd pay", "would pay", "willing to pay", "take my money"
- "looking for alternative", "need a tool", "anyone know a tool"
- "I wish there was", "someone should build"

Stored as `has_wtp` boolean. Cheap, effective first pass.

### Analyze Changes

1. `analyze.ts` fetches `community_pain_summaries` alongside `app_pain_summaries`
2. `prompt.ts` gets new section: community pain themes with WTP signals highlighted
3. AI cross-references: "Reddit users complain about X, and app Y reviews confirm same pain"
4. New final pass: cross-category analysis for platform-level opportunities

### Frontend Additions

**`/community` page — community posts listing**
- Filter by source (Reddit/HN/IH), channel, has_wtp
- Sort by score, date, WTP flag
- Show title, body preview, source badge, score, WTP indicator

**`/community/[id]` page — post detail**
- Full post content, metadata, link to original

**Enhanced `/opportunities` page**
- Show community evidence alongside app evidence
- New junction table `opportunity_community_posts` linking opportunities to community posts
- Badge indicating cross-source validation ("confirmed by Reddit + App Store")

## Evaluated Alternatives

### Rejected: Twitter/X
$100/mo minimum API cost. Noisy signal. Not worth it for personal research.

### Rejected: G2/Capterra
Similar signal to app store reviews (product complaints). Doesn't add new signal type.

### Deferred: Temporal trends
Tracking severity over time adds complexity. Can add later by querying `created_at` on existing data.

### Deferred: Competition enrichment (Crunchbase/GitHub)
Medium effort, uncertain ROI. Better to first validate community signals add value.

## Existing Pipeline Enhancements

### Bug Fixes
1. **Opportunity dedup** — `analyze.ts` always inserts, running twice = duplicates. Add title+category hash check before insert.
2. **Dead legacy code** — `buildPrompt()` raw-review path in `prompt.ts` never called. Remove.

### Analysis Quality
3. **Review ordering by rating** — `summarize-app-reviews.ts` orders by `created_at`. Change to `rating ASC, created_at DESC` so 1-star reviews (worst pain) come first. If 100-review limit truncates, milder 3-star reviews get cut.
4. **Incremental analysis** — currently re-analyzes ALL categories every run. Track which `app_pain_summaries` changed since last analyze run, only re-analyze those categories.
5. **Cross-category final pass** — after per-category analysis, one AI call across all categories to catch platform-level opportunities (e.g. "offline support" pain across Finance + Productivity + Health).
6. **Better scoring with WTP** — factor willingness-to-pay community signals into score formula when available.

### Performance
7. **Parallel category analysis** — Step 2 processes categories sequentially. Run 3-4 concurrently like Step 1 does with apps.
8. **Anthropic SDK as default** — `claude --print` via spawn is slow/fragile. Make SDK primary provider, CLI as fallback.

### Data Quality
9. **Pain summary staleness** — `app_pain_summaries` never expires. When new reviews come in for an app, invalidate old summary and re-generate (not append).
10. **Startup data enrichment** — current startup context is thin (name, tagline, upvotes). Add `last_active_date`/`status` to distinguish dead projects from active competitors.

## Implementation Phases

### Phase 1: Existing Pipeline Fixes
- Review ordering by rating ASC (#3)
- Opportunity dedup (#1)
- Dead code cleanup (#2)
- Pain summary staleness/invalidation (#9)

### Phase 2: Existing Pipeline Enhancements
- Incremental analysis (#4)
- Parallel category analysis (#7)
- Anthropic SDK as default provider (#8)
- Startup data enrichment (#10)

### Phase 3: DB + HN Crawler (simplest, no auth)
- Migration for `community_posts` + `community_pain_summaries` tables
- `crawl-hn.ts` using free Algolia API
- WTP keyword scanner in crawler utils

### Phase 4: Reddit Crawler
- `crawl-reddit.ts` with OAuth
- Target subreddits + keyword search queries
- Rate limiting (100 req/min)

### Phase 5: Indie Hackers Crawler
- `crawl-indie-hackers.ts` via web scraping
- Focus on problem/request posts

### Phase 6: Community Summarizer
- `summarize-community-posts.ts` — groups by AI-detected topics
- Upserts into `community_pain_summaries`

### Phase 7: Enhanced Analyze
- Modify `analyze.ts` to fetch community summaries
- Extend prompt with community section + WTP scoring (#5, #6)
- Add cross-category final pass (#5)
- New junction table `opportunity_community_posts`

### Phase 8: Frontend
- `/community` listing + detail pages
- Enhanced `/opportunities` with community evidence
- Source badges and WTP indicators

## Traceability Requirements (CRITICAL)

Every opportunity must be fully traceable back to original sources. When the user picks a niche, they must be able to verify every claim by clicking through to evidence.

### Evidence Chain
- Each opportunity links to **specific reviews** (not just apps) with extracted quotes + relevance
- Each opportunity links to **specific community posts** with quotes + relevance
- Score breakdown per dimension with AI reasoning (not just numbers)
- WTP signal count + source distribution
- Original URLs preserved for manual verification

### DB Changes for Traceability
- `opportunity_reviews` junction: opportunity_id, review_id, quote, relevance
- `opportunity_community_posts` junction: opportunity_id, community_post_id, quote, relevance
- `opportunities` enhanced: evidence_summary (jsonb), wtp_count (int), source_count (jsonb), score_breakdown (jsonb)

### AI Prompt Changes
- AI must cite specific evidence items by index with quotes
- AI must provide per-dimension score reasoning (not just numbers)
- AI must flag which evidence items contain WTP signals
- Output format includes structured `evidence[]` array and `score_breakdown{}` object

### Frontend: Opportunity as Research Dossier
- `/opportunities/[id]` shows score breakdown with per-dimension reasoning
- Evidence tab: reviews + community posts with quotes and "open original" links
- Competition tab: startups with roles and AI analysis
- WTP signals highlighted with count badge
- Source distribution indicator (cross-source validation badge)

## Risks

| Risk | Mitigation |
|---|---|
| Reddit API rate limits (100/min) | Crawl in batches with rate limiter (existing util) |
| Indie Hackers scraping breaks | Graceful failure, not critical source |
| Community posts too noisy | WTP filter + AI summarization handles signal/noise |
| Opportunity dedup (existing issue) | Address in Phase 5 — add dedup check before insert |
| Token cost for community summarization | Same pattern as app summarizer (Claude CLI, no API cost) |

## Success Criteria

- Pipeline produces opportunities with cross-source validation (app + community)
- WTP-flagged opportunities surface real demand, not just complaints
- User (you) can browse community posts and filter by WTP to manually validate
- At least one "I'd build this" moment from the combined analysis

## Unresolved Questions

1. Reddit subreddit selection — need to finalize list of subreddits to crawl. Start with 5-10, expand based on signal quality.
2. Indie Hackers scraping feasibility — site structure may have changed. Need to scout before committing.
3. Community post dedup — same discussion may appear on Reddit AND HN. Cross-source dedup or let AI handle it?

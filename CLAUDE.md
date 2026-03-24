# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm dev                    # Next.js dev server (http://localhost:3000)
pnpm build                  # Production build
pnpm lint                   # ESLint
pnpm crawl:apps             # Crawl all sources (App Store, Google Play, YC, PH, Unikorn)
pnpm crawl:appstore         # Apple App Store only
pnpm crawl:gplay            # Google Play only
pnpm crawl:yc               # YC Launches only
pnpm crawl:ph               # Product Hunt only
pnpm crawl:unikorn          # Unikorn.vn only
pnpm crawl:store_reviews    # Fetch 1-3 star reviews for all apps
pnpm analyze                # AI analysis: score reviews → generate opportunities
```

Run individual scripts directly: `pnpm tsx scripts/crawlers/crawl-app-store.ts`

No test runner is configured.

## Architecture

ProductPulse is a local-first research tool that crawls app stores, startup directories, and community sources, then uses Claude AI to identify product opportunities with full evidence traceability.

### 4-Step Pipeline

```
STEP 1: CRAWL DATA
  App Stores (App Store, Google Play) → apps, store_reviews (1-3 stars)
  Startup Dirs (YC, PH, Unikorn) → startups
  Community (Reddit, HN, Indie Hackers) → community_posts (unified table)
    + startup_comments migrated into community_posts
    + WTP keyword scan at crawl time (has_wtp flag)

STEP 2: SUMMARIZE
  Track A: summarize-app-reviews → app_pain_summaries (per app)
    - 100 reviews max, ordered 1★ first
    - 3-5 pain themes, 4 apps concurrent
    - Invalidated when new reviews arrive
  Track B: summarize-community → community_pain_summaries (per source+topic)
    - AI groups posts by topic clusters
    - Extracts themes + flags WTP signals

STEP 3: ANALYZE (with traceability)
  Pass 1: Per-Category (3-4 concurrent, incremental — only changed categories)
    Input: app_pain_summaries + community_pain_summaries + startups (filtered)
    Output: 1-5 opportunities with evidence chains:
      - Specific review quotes + IDs
      - Specific community post quotes + IDs
      - Per-dimension score reasoning
  Pass 2: Cross-Category (single call)
    → Platform-level opportunities (pain across 3+ categories)
  Scoring: pain×0.4 + market×0.35 + inv_competition×0.25 + WTP bonus
  Dedup: hash(title+category) before insert

STEP 4: BROWSE (Frontend)
  /opportunities       — Ranked list, cross-source badges, WTP count
  /opportunities/[id]  — Research dossier: score breakdown, evidence tab
                          (quotes + original links), competition tab, WTP highlights
  /community           — Posts filtered by source, channel, WTP, score
  /community/[id]      — Full post + metadata + original link
  /apps, /startups, /pain-summaries — Existing pages
```

### Frontend (Next.js App Router + RSC)

- `src/app/` — Pages use React Server Components; fetch directly from Supabase
- `src/app/apps/` — App listing + detail with linked reviews and opportunities
- `src/app/startups/` — Startup listing + detail with comments
- `src/app/opportunities/` — AI-scored opportunities as research dossiers with evidence chains
- `src/app/community/` — Community posts listing + detail with WTP indicators
- No API routes — all data fetching is server-side via Supabase client

### Backend (Supabase PostgreSQL)

Tables: `apps`, `store_reviews`, `app_pain_summaries`, `startups`, `startup_comments` (legacy, migrated to community_posts), `community_posts`, `community_pain_summaries`, `opportunities`, `opportunity_apps`, `opportunity_startups`, `opportunity_reviews`, `opportunity_community_posts`, `crawl_jobs`. Schema in `supabase/migrations/`.

Three Supabase clients:
- `src/lib/supabase/server.ts` — SSR-safe (cookie-based), used by RSC pages
- `src/lib/supabase/client.ts` — Browser client for client components
- `scripts/crawlers/lib/supabase-admin.ts` — Service role key, bypasses RLS, used by CLI scripts

### AI Pipeline (`scripts/ai/`)

- `analyze.ts` — Fetches app + community summaries, runs per-category + cross-category analysis, saves with evidence chains
- `summarize-app-reviews.ts` — Per-app review summarization (1★ first), upserts pain themes
- `summarize-community-posts.ts` — AI topic clustering for community posts, extracts themes + WTP
- `prompt.ts` — Builds prompts with app themes, community themes, WTP signals, evidence citation requirements
- `parse-ai-response.ts` — Validates evidence structure, extracts quotes, clamps scores
- `providers/anthropic-sdk.ts` — Default provider (requires `ANTHROPIC_API_KEY`)
- `providers/claude-cli.ts` — Fallback via `claude --print`

### Scoring Model

`score = pain_severity × 0.4 + market_size × 0.35 + (100 - competition) × 0.25 + wtp_bonus`

Verdicts: "strong" (≥70), "moderate" (40-69), "weak" (<40)

### Traceability

Every opportunity links to specific evidence via junction tables with quotes and relevance explanations. The `/opportunities/[id]` page renders a research dossier with clickable links to original sources (app store reviews, Reddit posts, HN threads, etc.).

## Key Conventions

- **Path alias**: `@/*` → `./src/*`
- **UI**: Tailwind CSS v4 + shadcn/ui (base-nova style, neutral colors). `cn()` utility in `src/lib/utils.ts`
- **File naming**: kebab-case throughout
- **Images**: Use `SafeImage` component (`src/components/safe-image.tsx`) — wraps `next/image` with domain check and fallback
- **Crawler utilities**: `scripts/crawlers/lib/crawler-utils.ts` — logger, rate limiter, upsert helpers, crawl job tracking
- **Types**: `src/lib/types/database.ts` — manually defined (not generated), mirrors Supabase schema

## Environment Variables

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anon key (client reads)
- `SUPABASE_SERVICE_ROLE_KEY` — Service role key (CLI scripts only)
- `ANTHROPIC_API_KEY` — Optional; if absent, AI pipeline falls back to Claude CLI
- `REDDIT_CLIENT_ID` — Reddit OAuth app client ID (for community crawler)
- `REDDIT_CLIENT_SECRET` — Reddit OAuth app client secret (for community crawler)

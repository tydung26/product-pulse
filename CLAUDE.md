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

ProductPulse is a local-first MVP that crawls app stores and startup directories, fetches negative reviews, and uses Claude AI to identify product opportunities.

### 3-Step Pipeline

1. **Crawl apps/startups** → `scripts/crawlers/crawl-*.ts` → insert into `apps`, `startups` tables
2. **Crawl reviews** → `scripts/crawlers/crawl-store-reviews.ts` → insert into `store_reviews` (1-3 stars only)
3. **AI analysis** → `scripts/ai/analyze.ts` → batch reviews, call Claude, insert into `opportunities` + 3 junction tables

### Frontend (Next.js App Router + RSC)

- `src/app/` — Pages use React Server Components; fetch directly from Supabase
- `src/app/apps/` — App listing + detail with linked reviews and opportunities
- `src/app/startups/` — Startup listing + detail with comments
- `src/app/opportunities/` — AI-scored opportunities ranked by viability
- No API routes — all data fetching is server-side via Supabase client

### Backend (Supabase PostgreSQL)

9 tables: `apps`, `store_reviews`, `startups`, `startup_comments`, `opportunities`, `opportunity_apps`, `opportunity_startups`, `opportunity_reviews`, `crawl_jobs`. Schema in `supabase/migrations/001-initial-schema.sql`.

Three Supabase clients:
- `src/lib/supabase/server.ts` — SSR-safe (cookie-based), used by RSC pages
- `src/lib/supabase/client.ts` — Browser client for client components
- `scripts/crawlers/lib/supabase-admin.ts` — Service role key, bypasses RLS, used by CLI scripts

### AI Pipeline (`scripts/ai/`)

- `analyze.ts` — Main entry: batches unprocessed reviews (max 50), calls provider, saves results with retry+backoff
- `prompt.ts` — Builds context prompt for Claude (product analyst role, pain/market/competition scoring)
- `parse-ai-response.ts` — Extracts JSON array from response, validates fields, clamps scores (0-100), filters score >= 30
- `providers/anthropic-sdk.ts` — Uses `@anthropic-ai/sdk` (requires `ANTHROPIC_API_KEY`)
- `providers/claude-cli.ts` — Uses `claude --print` via spawnSync (no API key needed)

### Scoring Model

`score = pain_severity × 0.4 + market_size × 0.35 + (100 - competition) × 0.25`

Verdicts: "strong" (≥70), "moderate" (40-69), "weak" (<40)

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

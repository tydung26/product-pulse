# ProductPulse (formerly Itch v2)

## Product Name
**ProductPulse** — feel the pulse of products in the market. Monitors app reviews, tracks startups, surfaces pain points.

## What Changed from v1 (Itch)

v1 (Itch) was broad: App Store + Google Play + Reddit social crawling + AI clustering.
ProductPulse narrows to **structured app data sources only** — no social scraping. New repo, fresh start.

## Data Sources (v2)

| Source | What We Get | Method |
|--------|-------------|--------|
| **App Store** | 1-3 star reviews, app metadata | Apple RSS + iTunes Lookup API |
| **Google Play** | 1-3 star reviews, app metadata | google-play-scraper npm |
| **YC Launch** | Startups, taglines, comments | Scrape ycombinator.com/launches |
| **Product Hunt** | Products, upvotes, comments | PH API (GraphQL) or scrape |
| **Unikorn.vn** | Vietnamese startups, funding | Scrape unikorn.vn |

## What to Remove

- Reddit scraper + seed subreddits + complaint keywords
- Trends tab + trend cards
- `source: "reddit"` everywhere

## Architecture

```
Crawlers (AppStore, GPlay, YC, PH, Unikorn)
    │
    ▼
Supabase (apps, reviews, startups, pain_points)
    │
    ▼
AI Clustering (--local-ai or API keys)
    │
    ▼
Dashboard: [Apps] [Pain Points] [Startups]
```

## UI Structure

| Tab | Content |
|-----|---------|
| **Apps** | Grid of apps from stores. Click → app detail + pain points |
| **Pain Points** | All clustered pain points by intensity |
| **Startups** | Grid from YC/PH/Unikorn. Click → startup detail |

### Startups Tab
- Card: name, source badge (YC/PH/Unikorn), tagline, upvotes, funding stage, launch date
- Detail: full description, comments, related apps if any
- Filters: source, category

## New Crawlers

### YC Launch
- URL: `https://www.ycombinator.com/launches`
- Get: name, tagline, description, launch date, comments
- Recent launches only (last 30 days)
- Cheerio HTML parsing

### Product Hunt
- API: `https://api.producthunt.com/v2/api/graphql` (needs free dev token)
- Or scrape: `producthunt.com/posts` (no token)
- Get: name, tagline, description, upvotes, comments, maker info

### Unikorn.vn
- URL: `https://unikorn.vn/`
- Get: company name, description, category, funding info
- Check if SSR or SPA first

## Open Decisions

1. Product Hunt: API (needs token) vs scrape (no token)?
2. Unikorn.vn: SSR or SPA? Determines scraping method
3. Link startups to apps? (e.g., YC startup → their App Store listing)
4. Crawl frequency: daily for all, or different per source?

## Development Philosophy

- **No auth, no payments, no deployment** — local-first MVP for personal use
- **No API keys required** — `--local-ai` flag uses Claude CLI for clustering
- **Speed over polish** — ship features fast, iterate later
- **Supabase for DB only** — no auth features, RLS disabled for local dev
- Migrations: paste SQL in Supabase SQL Editor (no CLI connection available)

## Skills to Load

When implementing, activate these Claude Code skills:
- `/cook` — end-to-end feature implementation
- `/ui-styling` — shadcn/ui components (Radix UI + Tailwind)
- `/web-design-guidelines` — accessibility compliance
- `/frontend-development` — React/TypeScript patterns
- `/debug` — if scraping or DB issues arise
- `/docs-seeker` — for checking latest library docs

## UI Rules

- **Use shadcn/ui for ALL new components** — Button, Card, Badge, Input, Select, Tabs, Skeleton, Separator already installed
- Components in `src/components/ui/` — don't create custom replacements
- Use `cn()` from `@/lib/utils` for conditional classes
- Use semantic color tokens (`text-foreground`, `bg-muted`, `border-border`) not raw Tailwind colors
- shadcn config: New York style, neutral base color

## Codebase Context

- **Stack:** Next.js 16, Supabase (Tokyo), Tailwind v4, shadcn/ui
- **Scripts:** `pnpm crawl:local`, `pnpm enrich`, `pnpm fetch-apps`
- **AI:** `--local-ai` uses Claude CLI, no API keys needed
- **Data:** 1900 apps, ~9000 reviews, 43 pain points

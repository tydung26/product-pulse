# ProductPulse

Local-first tool that crawls app reviews + startups, then uses AI to score product opportunities.

## Stack

- Next.js 16, React 19, TypeScript
- Supabase (Tokyo) — DB only, no auth
- Tailwind v4, shadcn/ui (New York)
- tsx for CLI scripts

## Setup

```bash
pnpm install
cp .env.local.example .env.local  # fill in Supabase + Anthropic keys
pnpm dev
```

## 3-Step Pipeline

```bash
pnpm crawl:apps           # Step 1: collect apps + startups metadata
pnpm crawl:store_reviews   # Step 2: fetch 1-3 star reviews for active apps
pnpm analyze --local-ai    # Step 3: AI scores & ranks opportunities
```

## Individual Crawlers

```bash
pnpm crawl:appstore   # Apple App Store
pnpm crawl:gplay      # Google Play Store
pnpm crawl:yc         # YC Launches
pnpm crawl:ph         # Product Hunt
pnpm crawl:unikorn    # Unikorn.vn
```

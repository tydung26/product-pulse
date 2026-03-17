---
title: "ProductPulse v2 Implementation Plan"
description: "8-phase plan: scaffold, DB, crawlers (apps/startups/reviews), AI pipeline, dashboard"
status: completed
priority: P1
effort: 32h
branch: main
tags: [greenfield, next16, supabase, crawlers, ai, dashboard]
created: 2026-03-17
---

# ProductPulse v2 — Implementation Plan

## Summary

Local-first tool: crawl app reviews + startups → AI scores product opportunities → dashboard.
Stack: Next.js 16, Supabase (Tokyo), Tailwind v4, shadcn/ui, tsx scripts.

## Architecture Reference

- Brainstorm: `plans/reports/brainstorm-260317-2137-project-architecture.md`
- Brief: `docs/v2-brief-focused-app-intelligence.md`

## 3-Step Pipeline

1. `pnpm crawl:apps` — apps (App Store + Google Play) + startups (YC, PH, Unikorn)
2. `pnpm crawl:store_reviews` — 1-3 star reviews for active apps
3. `pnpm analyze --local-ai` — AI scores viability → ranked opportunities

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Project scaffolding | 3h | ✅ done | [phase-01](phase-01-project-scaffolding.md) |
| 2 | Database & Supabase | 3h | ✅ done | [phase-02](phase-02-database-supabase-setup.md) |
| 3 | Crawler utils + App crawlers | 5h | ✅ done | [phase-03](phase-03-app-crawlers.md) |
| 4 | Startup crawlers (YC, PH, Unikorn) | 5h | ✅ done | [phase-04](phase-04-startup-crawlers.md) |
| 5 | Review crawler | 3h | ✅ done | [phase-05](phase-05-review-crawler.md) |
| 6 | AI analysis pipeline | 5h | ✅ done | [phase-06](phase-06-ai-analysis-pipeline.md) |
| 7 | Dashboard layout + Apps tab | 4h | ✅ done | [phase-07](phase-07-dashboard-apps-tab.md) |
| 8 | Startups tab + Opportunities tab | 4h | ✅ done | [phase-08](phase-08-startups-opportunities-tabs.md) |

## Dependencies

```
Phase 1 → Phase 2 → Phase 3 → Phase 5
                   → Phase 4
                   → Phase 6 (needs 3+4+5 data)
         Phase 1 → Phase 7 → Phase 8
```

Phase 3, 4 can run in parallel. Phase 6 depends on 3+4+5.
Phase 7, 8 depend on Phase 2 (DB types) but can develop alongside crawlers.

## Key Decisions

- No auth, no payments, no deployment — local-first MVP
- RSC for data fetching, client components only for filters
- Migrations: paste SQL into Supabase SQL Editor (no CLI)
- AI: `--local-ai` (Claude CLI) default, `--api` (Anthropic SDK) optional
- URL search params for filter state (shareable, back-button friendly)

## Risk Summary

| Risk | Mitigation |
|------|-----------|
| Scraping targets change HTML | Pin selectors, error logging per crawler |
| Product Hunt rate limits | Respect limits, try API first, fallback to scrape |
| Large review volumes | Batch AI, paginate queries |
| tsx path aliases | Configure tsconfig paths + `--tsconfig` flag |

## Open Questions

1. Product Hunt: API (needs token) vs scrape? Try API first
2. Unikorn.vn: SSR or SPA? Inspect at implementation
3. Crawl frequency/cadence per source? Defer to usage patterns

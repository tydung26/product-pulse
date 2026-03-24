---
title: "Community Signals Pipeline + Existing Pipeline Enhancement"
description: "Add Reddit/HN/IH crawlers, community summarizer, enhanced analysis with traceability, and fix existing pipeline bugs"
status: pending
priority: P1
effort: 32h
branch: main
tags: [pipeline, crawlers, community, ai, frontend, traceability]
created: 2026-03-24
---

# Community Signals Pipeline + Existing Pipeline Enhancement

## Goal

Expand ProductPulse beyond app store reviews into community signals (Reddit, HN, Indie Hackers). Add willingness-to-pay detection, cross-source validation, and full evidence traceability from opportunities back to original sources.

## Context

- Brainstorm: `plans/reports/brainstorm-260324-0826-community-signals-pipeline.md`
- Current pipeline: crawl apps -> crawl reviews -> summarize-app-reviews -> analyze -> opportunities
- New pipeline adds: crawl community -> summarize-community -> enhanced analyze (cross-source)

## Phase Summary

| Phase | Description | Effort | Status |
|-------|-------------|--------|--------|
| [Phase 1](./phase-01-existing-pipeline-fixes.md) | Pipeline bug fixes (ordering, dedup, dead code, staleness) | 2h | pending |
| [Phase 2](./phase-02-existing-pipeline-enhancements.md) | Incremental analysis, parallel, SDK default, startup enrichment | 3h | pending |
| [Phase 3](./phase-03-db-schema-and-hn-crawler.md) | DB migration + HN Algolia crawler + WTP scanner | 4h | pending |
| [Phase 4](./phase-04-reddit-crawler.md) | Reddit OAuth crawler with subreddit + keyword search | 4h | pending |
| [Phase 5](./phase-05-indie-hackers-crawler.md) | Indie Hackers web scraper | 3h | pending |
| [Phase 6](./phase-06-community-summarizer.md) | AI topic clustering + community pain summaries | 4h | pending |
| [Phase 7](./phase-07-enhanced-analyze-with-traceability.md) | Cross-source analysis, evidence chains, WTP scoring | 6h | pending |
| [Phase 8](./phase-08-frontend.md) | Community pages + enhanced opportunity dossier | 6h | pending |

## Dependencies

```
Phase 1 ──> Phase 2 (fixes before enhancements)
Phase 3 ──> Phase 4, Phase 5 (DB schema needed for all crawlers)
Phase 3, 4, 5 ──> Phase 6 (community posts needed for summarizer)
Phase 2, 6 ──> Phase 7 (both pipelines feed into enhanced analyze)
Phase 7 ──> Phase 8 (frontend needs enhanced data model)
```

## Key Decisions

- **WTP detection at crawl time** (keyword scan, no AI cost) — stored as boolean
- **community_posts unified table** — all sources (reddit, hn, indie_hackers) share one table
- **AI topic clustering** in summarizer — groups posts by detected topic, not by app
- **Cross-category final pass** — single AI call across all categories for platform opportunities
- **Evidence traceability** — every opportunity links to specific reviews/posts with quotes

## Environment Variables (New)

- `REDDIT_CLIENT_ID` — Reddit OAuth app client ID (Phase 4)
- `REDDIT_CLIENT_SECRET` — Reddit OAuth app client secret (Phase 4)

## Unresolved Questions

1. Reddit subreddit list — start with 5-10, expand based on signal quality
2. Indie Hackers scraping feasibility — site structure may have changed, need scout
3. Cross-source dedup — same discussion on Reddit AND HN; let AI handle vs explicit dedup?

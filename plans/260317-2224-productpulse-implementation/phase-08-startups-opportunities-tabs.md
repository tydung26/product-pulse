# Phase 8: Startups Tab + Opportunities Tab

## Context Links
- [Brainstorm — dashboard patterns](../reports/brainstorm-260317-2137-project-architecture.md)
- [Phase 7 — dashboard layout](phase-07-dashboard-apps-tab.md)

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 4h
- **Description:** Build Startups tab (grid + detail) and Opportunities tab (ranked list). Reuse patterns from Phase 7. Complete the 3-tab dashboard.

## Key Insights
- Startups tab mirrors Apps tab pattern (grid + detail + filters)
- Opportunities tab is a ranked list, not a grid — sorted by score desc
- Opportunity detail is inline-expandable or a separate page (decide at implementation)
- Reuse AppsGrid pattern for StartupsGrid (DRY)
- Verdict filter is the key UX for opportunities (strong/moderate/weak)

## Requirements

### Functional
- `/startups` — grid of startup cards with source filter + search + sort
- `/startups/[id]` — startup detail: metadata, comments, linked opportunities
- `/opportunities` — ranked list sorted by score, filterable by verdict

### Non-functional
- Same RSC + client component pattern as Apps tab
- URL searchParams for all filter state
- Responsive layout

## Architecture

```
src/app/
├── startups/
│   ├── page.tsx             # RSC: fetch startups, render StartupsGrid
│   └── [id]/page.tsx        # RSC: startup detail + comments + opportunities
├── opportunities/
│   └── page.tsx             # RSC: ranked opportunities list

src/components/
├── startup-card.tsx         # Server: single startup card
├── startups-grid.tsx        # Client: search/filter/sort wrapper
├── opportunity-card.tsx     # Server: opportunity with score + verdict
└── opportunities-list.tsx   # Client: verdict filter wrapper
```

### Data Queries
```sql
-- Startups grid
SELECT * FROM startups ORDER BY launched_at DESC LIMIT 100

-- Startups filtered
SELECT * FROM startups WHERE source = $1 AND name ILIKE $2 ORDER BY $3

-- Startup detail
SELECT * FROM startups WHERE id = $1
SELECT * FROM startup_comments WHERE startup_id = $1 ORDER BY posted_at DESC
SELECT o.*, os.ai_comment, os.role FROM opportunities o
  JOIN opportunity_startups os ON os.opportunity_id = o.id
  WHERE os.startup_id = $1

-- Opportunities ranked
SELECT * FROM opportunities ORDER BY score DESC LIMIT 50

-- Opportunities filtered by verdict
SELECT * FROM opportunities WHERE verdict = $1 ORDER BY score DESC
```

## Related Code Files

### Create
- `src/components/startup-card.tsx`
- `src/components/startups-grid.tsx`
- `src/components/opportunity-card.tsx`
- `src/components/opportunities-list.tsx`
- `src/app/startups/page.tsx`
- `src/app/startups/[id]/page.tsx`
- `src/app/opportunities/page.tsx`

## Implementation Steps

1. **Create `startup-card.tsx`** (server component)
   - Props: `Startup` type
   - Display: logo, name, source badge (YC/PH/Unikorn), tagline, upvotes, category
   - Show funding_stage if available
   - Show launched_at formatted date
   - Link to `/startups/[id]`
   - Use shadcn Card, Badge

2. **Create `startups-grid.tsx`** (client component)
   - `'use client'`
   - Search input — filter by name/tagline
   - Source filter (Select): All, YC, Product Hunt, Unikorn
   - Sort: upvotes, launch date, name
   - URL searchParams for state
   - Responsive grid same as apps

3. **Create `startups/page.tsx`** (RSC)
   - Parse searchParams (source, search, sort)
   - Build Supabase query with filters
   - Pass startups to `<StartupsGrid />`

4. **Create `startups/[id]/page.tsx`** (RSC)
   - Fetch startup by ID
   - Fetch startup_comments (sorted by posted_at desc)
   - Fetch linked opportunities via opportunity_startups join
   - Render: startup header (logo, name, tagline, source badge, upvotes)
   - Comments section: author, body, posted_at
   - Linked opportunities: title, score badge, ai_comment, role badge
   - Use shadcn Card, Badge, Separator

5. **Create `opportunity-card.tsx`** (server component)
   - Props: `Opportunity` + optional linked apps/startups counts
   - Display:
     - Title, category
     - Score: large number + visual indicator (color-coded)
     - Verdict badge: green/yellow/red
     - Sub-scores: pain_severity, market_size, competition (small bars or numbers)
     - pain_summary (first 2-3 items)
     - solution_angles (first 2 items)
   - Expandable: full reasoning, linked apps, linked startups

6. **Create `opportunities-list.tsx`** (client component)
   - `'use client'`
   - Verdict filter: All, Strong, Moderate, Weak (button group or tabs)
   - Category filter (Select)
   - Score range display
   - URL searchParams for verdict filter
   - Render list of `<OpportunityCard />`

7. **Create `opportunities/page.tsx`** (RSC)
   - Parse searchParams (verdict, category)
   - Query opportunities ordered by score DESC
   - For each opportunity: fetch count of linked apps + startups (or use aggregate query)
   - Pass to `<OpportunitiesList />`
   - Aggregate query option:
     ```sql
     SELECT o.*,
       (SELECT count(*) FROM opportunity_apps WHERE opportunity_id = o.id) as app_count,
       (SELECT count(*) FROM opportunity_startups WHERE opportunity_id = o.id) as startup_count
     FROM opportunities o
     WHERE verdict = $1
     ORDER BY score DESC
     ```

8. **Empty states** for all pages
   - Startups: "No startups yet. Run `pnpm crawl:apps` to collect startup data."
   - Opportunities: "No opportunities yet. Run `pnpm analyze --local-ai` after crawling."
   - Startup detail no comments: "No comments available."

9. **Polish shared components**
   - Score display component: reusable score bar/badge
   - Verdict badge component: reusable with consistent colors
   - Source badge component: reusable for YC/PH/Unikorn/App Store/Google Play

## Todo List

- [ ] Create StartupCard component
- [ ] Create StartupsGrid client component with source filter
- [ ] Create startups/page.tsx RSC
- [ ] Create startups/[id]/page.tsx with comments + opportunities
- [ ] Create OpportunityCard component with score visualization
- [ ] Create OpportunitiesList client component with verdict filter
- [ ] Create opportunities/page.tsx RSC with ranked query
- [ ] Add empty states for all pages
- [ ] Create reusable score/verdict/source badge components
- [ ] Verify all 3 tabs work end-to-end

## Success Criteria
- `/startups` shows startup grid with source filter
- Clicking startup → detail with comments + linked opportunities
- `/opportunities` shows ranked list sorted by score
- Verdict filter works (strong/moderate/weak)
- All empty states display helpful "run X command" messages
- Full dashboard flow: Apps → Startups → Opportunities navigable via tabs

## Risk Assessment
- **Opportunity card complexity**: Keep initial version simple. Expandable details can iterate.
- **Aggregate queries**: Subqueries for counts may be slow at scale. Fine for MVP (<1000 rows).
- **Score visualization**: Start with numeric + color. Charts/bars can come later.

## Unresolved Questions
1. Should opportunity detail be a separate page or inline expandable? Suggest inline for MVP.
2. Should linked apps/startups on opportunity card be clickable links? Yes — link to detail pages.

## Next Steps
→ End-to-end testing: full 3-step pipeline + dashboard verification
→ Future: deployment, auth, crawl scheduling

# Phase 8: Frontend

## Context Links

- Phase 7 (prerequisite): `phase-07-enhanced-analyze-with-traceability.md`
- Existing pages: `src/app/opportunities/page.tsx`, `src/app/pain-summaries/`
- Components: `src/components/` (opportunity-card, pain-summaries-list, nav-tabs, etc.)
- UI: Tailwind v4 + shadcn/ui (badge, card, tabs, table, button, input, select)

## Overview

- **Priority:** P2
- **Status:** pending
- **Effort:** 6h
- **Description:** Build community listing/detail pages. Enhance opportunities page into a research dossier with evidence tabs, score breakdown, WTP highlights, and cross-source validation badges.

## Key Insights

- Frontend uses RSC (React Server Components) — no API routes, direct Supabase queries
- Existing pattern: page.tsx fetches data, passes to client component for interactivity
- shadcn/ui already has tabs, badge, card, table — all needed for new UI
- No opportunity detail page exists yet (`/opportunities` is listing only) — creating `[id]` page
- Nav tabs component needs "Community" link added

## Requirements

### Functional

**Community Pages:**
1. `/community` — listing page with filters (source, channel, WTP, score sort)
2. `/community/[id]` — detail page with full post, metadata, original link
3. Source badges (Reddit/HN/IH) with distinct colors
4. WTP indicator badge on posts that have WTP signals

**Enhanced Opportunities:**
5. `/opportunities/[id]` — detail page (NEW, doesn't exist yet) as research dossier
6. Score breakdown section: per-dimension scores with AI reasoning
7. Evidence tab: reviews + community posts with quotes and "open original" links
8. Competition tab: linked startups with roles and AI comments
9. WTP signals highlighted with count badge
10. Source distribution badge (cross-source validation indicator)
11. Navigation: add "Community" to nav-tabs

### Non-functional

- Pages under 200 lines each (extract components as needed)
- Server components for data fetching, client components for interactivity
- Responsive layout matching existing design system

## Architecture

### Page Structure

```
src/app/
  community/
    page.tsx            — RSC: listing with filters
    [id]/
      page.tsx          — RSC: post detail
  opportunities/
    page.tsx            — existing (minor update: link to detail)
    [id]/
      page.tsx          — RSC: research dossier (NEW)

src/components/
  community-post-card.tsx   — card for listing
  community-filters.tsx     — client component: source/channel/WTP filters
  opportunity-detail/
    score-breakdown.tsx     — per-dimension visual bars + reasoning
    evidence-tab.tsx        — review + community evidence with quotes
    competition-tab.tsx     — startups with roles
    wtp-signals.tsx         — WTP count + highlighted items
    source-distribution.tsx — badge showing source breakdown
```

### Community Listing Page

```typescript
// src/app/community/page.tsx
export default async function CommunityPage() {
  const supabase = await createSupabaseServer()
  const { data: posts } = await supabase
    .from("community_posts")
    .select("*")
    .order("score", { ascending: false })
    .limit(100)

  // Extract unique sources + channels for filters
  return <CommunityListingClient posts={posts} sources={...} channels={...} />
}
```

### Opportunity Detail Page

```typescript
// src/app/opportunities/[id]/page.tsx
export default async function OpportunityDetailPage({ params }) {
  const supabase = await createSupabaseServer()

  // Parallel fetch: opportunity + evidence + competition
  const [opp, reviewEvidence, communityEvidence, startupLinks] = await Promise.all([
    supabase.from("opportunities").select("*").eq("id", params.id).single(),
    supabase.from("opportunity_reviews").select("*, review:store_reviews(*)").eq("opportunity_id", params.id),
    supabase.from("opportunity_community_posts").select("*, post:community_posts(*)").eq("opportunity_id", params.id),
    supabase.from("opportunity_startups").select("*, startup:startups(*)").eq("opportunity_id", params.id),
  ])

  return <OpportunityDossier opp={...} evidence={...} competition={...} />
}
```

### Source Badge Colors

```typescript
const SOURCE_COLORS: Record<string, string> = {
  reddit: "bg-orange-100 text-orange-800",
  hn: "bg-amber-100 text-amber-800",
  indie_hackers: "bg-blue-100 text-blue-800",
  app_store: "bg-gray-100 text-gray-800",
  google_play: "bg-green-100 text-green-800",
}
```

## Related Code Files

| File | Action |
|------|--------|
| `src/app/community/page.tsx` | Create |
| `src/app/community/[id]/page.tsx` | Create |
| `src/app/opportunities/[id]/page.tsx` | Create |
| `src/app/opportunities/page.tsx` | Modify: link cards to detail page |
| `src/components/community-post-card.tsx` | Create |
| `src/components/community-filters.tsx` | Create (client component) |
| `src/components/opportunity-detail/score-breakdown.tsx` | Create |
| `src/components/opportunity-detail/evidence-tab.tsx` | Create |
| `src/components/opportunity-detail/competition-tab.tsx` | Create |
| `src/components/opportunity-detail/wtp-signals.tsx` | Create |
| `src/components/opportunity-detail/source-distribution.tsx` | Create |
| `src/components/nav-tabs.tsx` | Modify: add Community link |
| `src/components/opportunity-card.tsx` | Modify: link to /opportunities/[id] |
| `src/lib/types/database.ts` | Already updated in Phase 3 |

## Implementation Steps

### 1. Add Community to navigation

In `nav-tabs.tsx`, add to tabs array:
```typescript
{ label: "Community", href: "/community" },
```

### 2. Build community listing page

**`src/app/community/page.tsx`** — RSC fetches posts, passes to client component.

**`src/components/community-filters.tsx`** — Client component with:
- Source dropdown (All / Reddit / HN / Indie Hackers)
- Channel text filter
- WTP toggle (show only WTP posts)
- Sort: score desc / date desc

**`src/components/community-post-card.tsx`** — Card showing:
- Source badge (colored)
- Channel tag
- Title (linked to detail)
- Body preview (150 chars)
- Score, comment count
- WTP badge (if has_wtp)
- Date

### 3. Build community detail page

**`src/app/community/[id]/page.tsx`** — Fetch single post, display:
- Full title + body
- Source + channel badges
- Author, date, score, comments
- WTP indicator
- "View Original" button linking to post.url
- Back link to listing

### 4. Build opportunity detail page

**`src/app/opportunities/[id]/page.tsx`** — Research dossier layout:

```
+------------------------------------------+
| Title                     Score: 85/100   |
| Category | Verdict Badge | Source Count   |
+------------------------------------------+
| Score Breakdown                           |
| Pain [=======85] "12 reviews confirm..." |
| Market [=====70] "500K downloads..."     |
| Competition [==30] "2 weak competitors"  |
| WTP Bonus: +5                             |
+------------------------------------------+
| [Evidence] [Competition] [Details] tabs   |
|                                           |
| Evidence Tab:                             |
| - Review: "Can't export..." [App Store]  |
|   Relevance: Data portability pain        |
|   [Open Original]                         |
| - Community: "I'd pay $50..." [Reddit]   |
|   WTP  Relevance: Direct demand signal   |
|   [Open Original]                         |
+------------------------------------------+
```

### 5. Build opportunity detail sub-components

Each under `src/components/opportunity-detail/`:

**score-breakdown.tsx** — Visual bars for each dimension + reasoning text
**evidence-tab.tsx** — List of evidence items with quotes, source badges, original links
**competition-tab.tsx** — Startup cards with role badges and AI comments
**wtp-signals.tsx** — WTP count badge + list of WTP evidence items
**source-distribution.tsx** — Badge/chart showing source breakdown

### 6. Update opportunity listing

In `opportunity-card.tsx`, wrap card in `<Link href={/opportunities/${id}}>`.
In `opportunities/page.tsx`, keep existing listing but cards now link to detail.

## Todo List

- [ ] Add "Community" link to nav-tabs.tsx
- [ ] Create /community listing page with RSC data fetching
- [ ] Create community-filters.tsx client component
- [ ] Create community-post-card.tsx component
- [ ] Create /community/[id] detail page
- [ ] Create /opportunities/[id] detail page (research dossier)
- [ ] Create score-breakdown.tsx component
- [ ] Create evidence-tab.tsx component
- [ ] Create competition-tab.tsx component
- [ ] Create wtp-signals.tsx component
- [ ] Create source-distribution.tsx component
- [ ] Update opportunity-card.tsx to link to detail
- [ ] Update opportunities/page.tsx if needed
- [ ] Verify all pages render with empty data (no crashes)
- [ ] Verify backward compat: old opportunities (no evidence) display correctly
- [ ] Run `pnpm build` to verify no compile errors

## Success Criteria

- `/community` page shows posts with source badges and WTP indicators
- Filters work: source, channel, WTP toggle, sort
- `/community/[id]` shows full post with "View Original" link
- `/opportunities/[id]` shows score breakdown with per-dimension reasoning
- Evidence tab shows reviews + community posts with quotes and original links
- Competition tab shows startups with role badges
- WTP signals highlighted throughout
- Cross-source validation badge visible on opportunities with multiple sources
- Old opportunities (no evidence data) display without errors
- All pages responsive and match existing design system

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Component count high (many new files) | Each under 200 lines; logical separation by concern |
| Empty state UX | Handle 0 evidence / 0 community posts gracefully |
| Old opportunities missing new fields | Conditional rendering; show "No evidence data" |
| Performance: many joins on detail page | Parallel Promise.all fetching; limit result sets |

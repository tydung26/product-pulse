# Phase 7: Dashboard Layout + Apps Tab

## Context Links
- [Brainstorm — dashboard patterns](../reports/brainstorm-260317-2137-project-architecture.md)
- [Brief — UI rules](../../docs/v2-brief-focused-app-intelligence.md)

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 4h
- **Description:** Build the dashboard shell (root layout, tab navigation) and the Apps tab (grid page + detail page). RSC for data fetching, client components for filters.

## Key Insights
- RSC for all page-level data fetching (no loading spinners for initial load)
- Client components only for: filter dropdowns, search input, sort toggles
- URL search params for filter state (shareable, back-button friendly)
- shadcn/ui for all components, `cn()` for conditional classes
- Semantic tokens only (text-foreground, bg-muted, border-border)
- 3 tabs: Apps, Startups, Opportunities

## Requirements

### Functional
- Root layout with tab navigation (Apps, Startups, Opportunities)
- `/` redirects to `/apps`
- `/apps` — grid of app cards with search + category filter + sort
- `/apps/[id]` — app detail: metadata, reviews, linked opportunities

### Non-functional
- Server-side rendering for all initial data
- Responsive grid (1-3 columns depending on viewport)
- Skeleton loading states for client-side transitions

## Architecture

```
src/app/
├── layout.tsx              # Root: Inter font, nav-tabs, metadata
├── page.tsx                # redirect('/apps')
├── apps/
│   ├── page.tsx            # RSC: fetch apps, render AppsGrid
│   └── [id]/page.tsx       # RSC: fetch app + reviews + opportunities

src/components/
├── nav-tabs.tsx            # Client: tab navigation (uses usePathname)
├── app-card.tsx            # Server: single app card
├── apps-grid.tsx           # Client: search/filter/sort wrapper
└── ui/                     # shadcn primitives
```

### Data Queries
```sql
-- Apps grid (RSC)
SELECT * FROM apps ORDER BY avg_rating DESC LIMIT 50

-- Apps grid filtered (via searchParams)
SELECT * FROM apps WHERE category = $1 AND name ILIKE $2 ORDER BY $3

-- App detail
SELECT * FROM apps WHERE id = $1
SELECT * FROM store_reviews WHERE app_id = $1 ORDER BY review_date DESC LIMIT 20
SELECT o.* FROM opportunities o
  JOIN opportunity_apps oa ON oa.opportunity_id = o.id
  WHERE oa.app_id = $1
  ORDER BY o.score DESC
```

## Related Code Files

### Create
- `src/components/nav-tabs.tsx` — tab navigation component
- `src/components/app-card.tsx` — app card component
- `src/components/apps-grid.tsx` — client wrapper with search/filter
- `src/app/apps/page.tsx` — apps grid page (RSC)
- `src/app/apps/[id]/page.tsx` — app detail page (RSC)

### Modify
- `src/app/layout.tsx` — add nav-tabs, Inter font, metadata
- `src/app/page.tsx` — redirect to /apps

## Implementation Steps

1. **Update root layout** `src/app/layout.tsx`
   - Import Inter from `next/font/google`
   - Set metadata: title="ProductPulse", description
   - Render `<NavTabs />` + `{children}`
   - Apply global styles: `bg-background text-foreground`

2. **Create `nav-tabs.tsx`** (client component)
   - `'use client'` — needs `usePathname`
   - Three tabs: Apps, Startups, Opportunities
   - Use shadcn `Tabs` or custom links with active state
   - Highlight active tab based on pathname
   - Sticky top navigation

3. **Update `page.tsx`** — redirect
   ```typescript
   import { redirect } from 'next/navigation'
   export default function Home() { redirect('/apps') }
   ```

4. **Create `app-card.tsx`** (server component)
   - Props: `App` type
   - Display: icon, name, category, store badge, avg_rating stars, price
   - Link to `/apps/[id]`
   - Use shadcn Card, Badge components
   - Show estimated_mrr if available

5. **Create `apps-grid.tsx`** (client component)
   - `'use client'` — manages search/filter/sort state
   - Search input (shadcn Input) — filters by name
   - Category dropdown (shadcn Select) — filter by category
   - Sort toggle: rating, name, MRR
   - Push filter state to URL search params via `useRouter`
   - Receive `apps` as prop (fetched by parent RSC)
   - Render grid of `<AppCard />` components
   - Responsive: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`

6. **Create `apps/page.tsx`** (RSC)
   ```typescript
   export default async function AppsPage({ searchParams }) {
     const supabase = await createSupabaseServer()
     // Build query from searchParams (category, search, sort)
     const { data: apps } = await supabase
       .from('apps')
       .select('*')
       .order('avg_rating', { ascending: false })
       .limit(100)

     return <AppsGrid apps={apps} />
   }
   ```
   - Parse searchParams for filters
   - Apply category filter, name ILIKE, sort column
   - Pass data to client component

7. **Create `apps/[id]/page.tsx`** (RSC)
   - Fetch app by ID
   - Fetch store_reviews for this app (recent 20, sorted by date desc)
   - Fetch linked opportunities via opportunity_apps join
   - Render: app header (icon, name, metadata), review list, opportunity cards
   - Use shadcn Card, Badge, Separator
   - Show review cards: rating stars, title, body, date
   - Show opportunity links: title, score, verdict badge

8. **Styling conventions**
   - Use semantic tokens: `text-foreground`, `text-muted-foreground`, `bg-card`
   - Rating display: filled/empty stars or numeric with color
   - Verdict badges: green (strong), yellow (moderate), red (weak)
   - Store badges: "App Store" / "Google Play" with icons

## Todo List

- [ ] Update root layout with Inter font, metadata, nav
- [ ] Create NavTabs component with active state
- [ ] Create redirect on / → /apps
- [ ] Create AppCard component
- [ ] Create AppsGrid client component with search/filter/sort
- [ ] Create apps/page.tsx RSC with Supabase queries
- [ ] Create apps/[id]/page.tsx with reviews + opportunities
- [ ] Implement URL searchParams for filter state
- [ ] Add responsive grid layout
- [ ] Style with semantic tokens + shadcn components

## Success Criteria
- `/` redirects to `/apps`
- Apps grid shows app cards with metadata
- Search filters apps by name
- Category dropdown filters by category
- Clicking app card → detail page with reviews + opportunities
- All components use shadcn/ui primitives
- Responsive on mobile + desktop

## Risk Assessment
- **Next.js 16 searchParams**: In Next.js 15+, searchParams is a Promise. Use `await searchParams`.
- **Empty state**: Handle zero apps gracefully (show "No apps yet. Run pnpm crawl:apps")
- **Large datasets**: Limit to 100 apps on grid, paginate if needed later

## Next Steps
→ Phase 8: Startups tab + Opportunities tab

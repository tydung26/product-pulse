# Phase 2: Database & Supabase Setup

## Context Links
- [Brainstorm — full DDL](../reports/brainstorm-260317-2137-project-architecture.md)
- [Phase 1](phase-01-project-scaffolding.md)

## Overview
- **Priority:** P1 — blocks crawlers, AI, and dashboard
- **Status:** pending
- **Effort:** 3h
- **Description:** Create migration SQL (9 tables + indexes + triggers), Supabase clients (server + browser + admin), and TypeScript types.

## Key Insights
- Migrations pasted into Supabase SQL Editor (no Supabase CLI)
- Keep SQL file in repo for version control: `supabase/migrations/001-initial-schema.sql`
- Three Supabase clients: RSC (server), browser, and admin (scripts)
- TypeScript types manually authored (no codegen without CLI)

## Requirements

### Functional
- 9 tables created in Supabase with all constraints, indexes, triggers
- Supabase clients work from both Next.js and tsx scripts
- TypeScript types match DB schema exactly

### Non-functional
- Named constraints for clear error messages
- `updated_at` auto-trigger on apps, startups, opportunities
- Partial indexes for performance (unprocessed reviews, active apps)

## Architecture

### Tables (9)
1. `apps` — app metadata + enrichment
2. `store_reviews` — reviews, `is_processed` flag
3. `startups` — YC / PH / Unikorn
4. `startup_comments` — discussion comments
5. `opportunities` — AI-ranked ideas (score 0-100, verdict)
6. `opportunity_apps` — M:M apps↔opportunities
7. `opportunity_startups` — M:M startups↔opportunities
8. `opportunity_reviews` — M:M reviews↔opportunities
9. `crawl_jobs` — audit trail

### Client Architecture
```
src/lib/supabase/
├── server.ts       # createServerClient (RSC + Server Actions)
└── client.ts       # createBrowserClient (client components)

scripts/crawlers/lib/
└── supabase-admin.ts  # createClient with service_role_key
```

## Related Code Files

### Create
- `supabase/migrations/001-initial-schema.sql` — full DDL from brainstorm
- `src/lib/supabase/server.ts` — SSR client using `@supabase/ssr`
- `src/lib/supabase/client.ts` — browser client using `@supabase/ssr`
- `scripts/crawlers/lib/supabase-admin.ts` — admin client for scripts
- `src/lib/types/database.ts` — TypeScript types for all 9 tables

## Implementation Steps

1. **Create migration file** `supabase/migrations/001-initial-schema.sql`
   - Copy full DDL from brainstorm report (tables, triggers, indexes)
   - Include `update_updated_at_column()` function first
   - Tables in order: apps → store_reviews → startups → startup_comments → opportunities → opportunity_apps → opportunity_startups → opportunity_reviews → crawl_jobs
   - All indexes after tables

2. **Run migration** — paste SQL into Supabase SQL Editor, execute

3. **Create server Supabase client** `src/lib/supabase/server.ts`
   ```typescript
   import { createServerClient } from '@supabase/ssr'
   import { cookies } from 'next/headers'
   // Uses NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
   // Reads/writes cookies for session (though no auth, keeps pattern standard)
   ```

4. **Create browser Supabase client** `src/lib/supabase/client.ts`
   ```typescript
   import { createBrowserClient } from '@supabase/ssr'
   // Uses NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
   ```

5. **Create admin client for scripts** `scripts/crawlers/lib/supabase-admin.ts`
   ```typescript
   import { createClient } from '@supabase/supabase-js'
   // Uses SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from .env.local
   // dotenv loaded via tsx (auto-loads .env.local)
   ```
   - Note: tsx auto-loads `.env.local` — verify this. If not, add `import 'dotenv/config'`

6. **Create TypeScript types** `src/lib/types/database.ts`
   - Define types for all 9 tables: `App`, `StoreReview`, `Startup`, `StartupComment`, `Opportunity`, `OpportunityApp`, `OpportunityStartup`, `OpportunityReview`, `CrawlJob`
   - Include insert types (omitting `id`, `created_at`, `updated_at`)
   - Export `Database` type for Supabase generic typing

7. **Verify** — import types + client in a test script, confirm connection

## Todo List

- [ ] Create migration SQL file with all 9 tables
- [ ] Create indexes (composite, partial, GIN for JSONB)
- [ ] Create updated_at trigger function + apply to 3 tables
- [ ] Paste and run SQL in Supabase SQL Editor
- [ ] Create RSC Supabase client (server.ts)
- [ ] Create browser Supabase client (client.ts)
- [ ] Create admin Supabase client for scripts (supabase-admin.ts)
- [ ] Create TypeScript types matching all 9 tables
- [ ] Verify env loading in tsx scripts
- [ ] Test DB connection from both Next.js and tsx

## Success Criteria
- All 9 tables exist in Supabase with correct constraints
- `select * from apps limit 1` works from server client
- TypeScript types compile without errors
- Admin client connects from tsx script

## Risk Assessment
- **tsx env loading**: tsx may not auto-load `.env.local` — test early, add dotenv if needed
- **Supabase RLS**: Disabled for local dev, but double-check no default policies block admin

## Next Steps
→ Phase 3: Crawler shared utilities + App crawlers
→ Phase 7 can start (uses DB types for dashboard)

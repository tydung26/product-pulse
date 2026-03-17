# Code Review: ProductPulse v2 Full Implementation

**Date:** 2026-03-17
**Reviewer:** code-reviewer
**Scope:** 25+ files across crawlers, AI pipeline, types, Supabase, and Next.js UI

---

## Overall Assessment

Solid greenfield implementation with clean architecture, consistent patterns, and good separation of concerns. The 3-step pipeline (crawl -> review -> analyze) is well-structured with shared utilities, and the Next.js RSC/client split is mostly correct. Several medium-priority issues around security, performance, data integrity, and type safety need attention before production use.

---

## Critical Issues

### C1. Shell Command Injection Risk in claude-cli.ts (mitigated but fragile)

**File:** `scripts/ai/providers/claude-cli.ts:18`

The current approach writes to a temp file and uses `cat "${tmpFile}" | claude --print`. The temp file path includes `Date.now()` which is safe, but:
- The `tmpFile` path is quoted in the shell command, which is good
- However, `execSync` with string commands is inherently riskier than the array form

**Recommendation:** Use `execFileSync` with explicit args to eliminate any shell interpretation:
```ts
import { execFileSync } from "child_process"
const result = execFileSync("sh", ["-c", `cat "${tmpFile}" | claude --print`], {
  encoding: "utf-8",
  maxBuffer: 10 * 1024 * 1024,
  timeout: 120_000,
})
```
Or even better, pipe the file content via stdin using `spawnSync`:
```ts
import { spawnSync } from "child_process"
const result = spawnSync("claude", ["--print"], {
  input: prompt,
  encoding: "utf-8",
  maxBuffer: 10 * 1024 * 1024,
  timeout: 120_000,
})
```
This avoids temp files entirely and eliminates shell escaping concerns.

**Severity:** Critical (shell injection vector, even if currently unexploitable)

### C2. Missing `next/image` -- raw `<img>` tags render untrusted external URLs

**Files:** `app-card.tsx:27`, `startup-card.tsx:18-20`, `apps/[id]/page.tsx:69`, `startups/[id]/page.tsx:72`

All image rendering uses raw `<img src={...}>` with URLs scraped from external sources. This:
1. Bypasses Next.js image optimization
2. Loads arbitrary external URLs into user browsers (SSRF/tracking risk)
3. Missing `next.config.ts` `images.remotePatterns` means `next/image` would fail if used

**Recommendation:**
- Switch to `next/image` with explicit `remotePatterns` for known domains (`is1-ssl.mzstatic.com`, `play-lh.googleusercontent.com`, etc.)
- Add a fallback placeholder for unknown/failing image URLs
- Consider proxying images through a `/api/image-proxy` route

---

## High Priority

### H1. N+1 Query Problem in OpportunitiesPage

**File:** `src/app/opportunities/page.tsx:19-38`

Each opportunity triggers 2 separate count queries via `Promise.all`, resulting in `2N` DB round-trips. With 50 opportunities, that's 100 queries per page load.

**Recommendation:** Use a single query with a join or subquery count:
```ts
// Option 1: Use Supabase's computed column or RPC
// Option 2: Batch all IDs and do 2 total queries
const oppIds = typedOpps.map(o => o.id)
const { data: appCounts } = await supabase
  .from("opportunity_apps")
  .select("opportunity_id")
  .in("opportunity_id", oppIds)
// Then group counts in JS
```

### H2. Unsafe Type Assertions Throughout

**Files:** Multiple (`as App`, `as Startup`, `as StoreReview[]`, etc.)

Every Supabase query result is cast with `as Type`. If the schema drifts from `database.ts`, these silent casts will produce runtime errors, not compile-time errors.

**Recommendation:**
- Consider using Supabase's generated types via `supabase gen types typescript`
- Or add runtime validation (e.g., Zod schemas) at the boundary layer
- At minimum, add a `satisfies` check or validation wrapper

### H3. `store_reviews.external_id` Allows NULL but Has Unique Constraint

**File:** `supabase/migrations/001-initial-schema.sql:49,63`

`external_id text` is nullable, but `constraint uq_store_reviews_source_external_id unique (source, external_id)` exists. In PostgreSQL, multiple NULLs in a unique constraint are allowed (NULLs are not equal), so this won't cause errors but it means:
- Reviews without an `external_id` can never be deduplicated via upsert
- The Apple RSS crawler sets `external_id` from `e.id.label`, which should always exist, but there's no null guard

**Recommendation:** Add null checks before upsert or make `external_id` NOT NULL with a fallback value.

### H4. No Rate Limit / Debounce on Search Input

**Files:** `apps-grid.tsx:65`, `startups-grid.tsx:70`

`onChange` on search input calls `router.push()` on every keystroke, triggering a URL update and potential RSC re-renders.

**Recommendation:** Add debounce (300-500ms) to `updateParam` for the search input:
```ts
import { useDeferredValue } from "react"
// or use a simple debounce util
```

### H5. `getActiveApps` Date Filter Uses String Comparison

**File:** `scripts/crawlers/lib/crawler-utils.ts:151-157`

```ts
.or(`last_crawled_at.is.null,last_crawled_at.lt.${oneDayAgo}`)
```

This string-interpolates an ISO date into a Supabase filter string. While ISO format sorts correctly as strings, this is fragile. If the format changes or timezone handling differs, it could silently include/exclude wrong records.

**Recommendation:** This pattern is actually idiomatic for Supabase PostgREST filters and works correctly with timestamptz. No change needed, but add a comment noting this is intentional.

---

## Medium Priority

### M1. Suspense Without Fallback

**Files:** `apps/page.tsx:21`, `startups/page.tsx:16`, `opportunities/page.tsx:41`

`<Suspense>` wraps `useSearchParams()` clients (required by Next.js 14+), but no `fallback` prop is provided. Users see no loading state.

**Recommendation:** Add loading skeleton:
```tsx
<Suspense fallback={<div className="animate-pulse h-96 bg-muted rounded" />}>
```

### M2. Comment Dedup Logic is Imperfect

**File:** `scripts/crawlers/lib/crawler-utils.ts:108-126`

`upsertStartupComment` deduplicates by matching `startup_id + author` only. If the same author posts multiple comments, only the first is saved.

The code acknowledges this with a comment ("imperfect but sufficient for MVP"). However, it silently drops legitimate comments.

**Recommendation:** Add an `external_id` or `body` hash to the dedup check for more precise matching, or create a unique constraint on `(startup_id, author, body_hash)`.

### M3. Crawl Job Type Mismatch

**File:** `scripts/crawlers/crawl-store-reviews.ts:123`

```ts
const jobId = await startCrawlJob(app.store as "app_store" | "google_play", app.id)
```

The `app.store` is already typed as `"app_store" | "google_play"` in the `App` type, so the cast is redundant but harmless. However, the `CrawlJob.job_type` includes `"analyze"` but `startCrawlJob` parameter type is `CrawlJob["job_type"]` which allows all types. No validation that the review crawler only creates review-type jobs.

### M4. Inconsistent `inserted` vs `updated` Counting

**Files:** All crawler `main()` functions

The `completeCrawlJob` receives `{ found, inserted, updated }` but since all operations are upserts, the distinction between inserted and updated is never tracked. All crawlers pass `updated: 0`. In `crawl-app-store.ts:131`, there's even a dead assignment `updated = 0`.

**Recommendation:** Either track actual insert vs update counts (check if upsert created or updated), or simplify the job schema to just `items_processed`.

### M5. Missing Error Boundary

The Next.js app has no `error.tsx` or `not-found.tsx` at the root level. If any RSC throws, users see the default Next.js error page.

**Recommendation:** Add `src/app/error.tsx` (client component) and `src/app/not-found.tsx`.

### M6. `fetchJson` Generic Type Cast is Unsafe

**File:** `scripts/crawlers/lib/crawler-utils.ts:180-191`

```ts
export async function fetchJson<T = unknown>(url: string): Promise<T> {
  // ...
  return response.json() as Promise<T>
}
```

This casts the JSON response to any type `T` without validation. If the API returns unexpected shapes, errors will surface far from the fetch site.

**Recommendation:** Accept a validation function parameter:
```ts
export async function fetchJson<T>(url: string, validate?: (data: unknown) => T): Promise<T>
```

### M7. `anthropic-sdk.ts` Only Reads First Content Block

**File:** `scripts/ai/providers/anthropic-sdk.ts:25-26`

```ts
const text = response.content[0].type === "text" ? response.content[0].text : ""
```

If the model returns multiple content blocks or the first block is not text (e.g., tool_use), the response is silently empty.

**Recommendation:** Concatenate all text blocks:
```ts
const text = response.content
  .filter(b => b.type === "text")
  .map(b => b.text)
  .join("\n")
```

### M8. No Retry Logic for AI Calls

**File:** `scripts/ai/analyze.ts:215`

A single failed AI call will fail the entire batch. Given that LLM APIs have transient failures, at least one retry with backoff would improve reliability.

### M9. `parse-ai-response.ts` Greedy Regex

**File:** `scripts/ai/parse-ai-response.ts:10`

```ts
const arrayMatch = raw.match(/\[[\s\S]*\]/)
```

The `[\s\S]*` is greedy and matches from the FIRST `[` to the LAST `]` in the entire response. If the AI outputs text after the JSON array (e.g., "Here are the results: [...] I hope this helps"), the regex captures everything between the outermost brackets, which could include non-JSON text.

**Recommendation:** Use a lazy match or a proper JSON extraction:
```ts
const arrayMatch = raw.match(/\[[\s\S]*?\](?=\s*$)/)
```
Or find the matching closing bracket programmatically.

---

## Low Priority

### L1. `google-play-scraper` Imported via `require`

**Files:** `crawl-google-play.ts:2`, `crawl-store-reviews.ts:2`

```ts
const gplay = require("google-play-scraper").default
```

Uses CommonJS require with eslint-disable comment. This is likely due to the package not having proper ESM exports.

**Recommendation:** Acceptable workaround. Consider adding a wrapper module with proper typing.

### L2. `downloads` Estimate in App Store Crawler

**File:** `crawl-app-store.ts:88`

```ts
downloads: lookup ? lookup.userRatingCount * 5 : null
```

The `* 5` multiplier is a rough heuristic. Should be documented why this factor was chosen.

### L3. Hardcoded `us` Country Code

**Files:** All crawlers

Country is hardcoded to `"us"`. Fine for MVP but limits international coverage.

### L4. `verdictColor` Duplicated

**Files:** `opportunity-card.tsx:5-9`, `apps/[id]/page.tsx:13-17`, `startups/[id]/page.tsx:19-23`

Same `verdictColor` map is defined in 3 places.

**Recommendation:** Extract to a shared constant in `lib/constants.ts`.

### L5. `StarRating` Component Not Shared

**File:** `app-card.tsx:6-15` and `apps/[id]/page.tsx:82`

Star rating rendering is duplicated inline. Could be extracted to a shared component.

---

## Positive Observations

1. **Clean architecture**: Shared `crawler-utils.ts` eliminates duplication across 6 crawlers. Logger, rate limiter, and crawl job tracking are well-abstracted.
2. **Proper crawl job audit trail**: Every crawler operation is tracked with start/complete/fail lifecycle.
3. **Good upsert strategy**: Using DB-level unique constraints (`store,store_id`, `source,source_id`, `source,external_id`) for idempotent operations.
4. **AI response validation**: `parse-ai-response.ts` has proper clamping, fallback verdicts, and score threshold filtering.
5. **RSC/Client split is correct**: Data fetching in RSCs, interactivity in `"use client"` components. `useSearchParams()` properly wrapped in `Suspense`.
6. **Graceful degradation**: Product Hunt crawler falls back from API to scraping when no token is available.
7. **Security basics**: No `dangerouslySetInnerHTML`, no raw SQL, no exposed secrets in client code, service role key kept server-side only.
8. **Database design**: Proper foreign keys, check constraints, relevant indexes including partial and GIN indexes.

---

## Recommended Actions (Priority Order)

1. **Replace `execSync` with `spawnSync` + stdin** in `claude-cli.ts` to eliminate shell concerns
2. **Switch to `next/image`** with `remotePatterns` config for external image URLs
3. **Fix N+1 in opportunities page** -- batch count queries
4. **Add debounce** to search inputs in grid components
5. **Add Suspense fallbacks** for loading states
6. **Add `error.tsx`** for root error boundary
7. **Fix greedy regex** in `parse-ai-response.ts`
8. **Concatenate all text blocks** in `anthropic-sdk.ts`
9. **Extract shared constants** (verdictColor, StarRating)
10. **Add retry logic** for AI API calls

---

## Metrics

- **Type Coverage:** ~90% (strict mode enabled, but heavy use of `as` casts on Supabase results)
- **Test Coverage:** 0% (no test files found)
- **Linting Issues:** ~2 (eslint-disable for require, likely clean otherwise)
- **Files Reviewed:** 25
- **LOC Reviewed:** ~2,800

---

## Unresolved Questions

1. Is there an `.env.local.example` file for onboarding? Only `.env.local` exists (which should be gitignored).
2. Is RLS enabled on any Supabase tables? The server client uses `anon_key` -- if RLS is off, this exposes all data. If RLS is on, the anon key may not have read access.
3. Should the `next.config.ts` `images.remotePatterns` be populated now, or is raw `<img>` intentional for MVP?
4. Are crawl results meant to accumulate indefinitely, or should there be a TTL/cleanup for old reviews and opportunities?
5. The `store_reviews` unique constraint allows NULL `external_id` -- is this intentional for reviews where no ID is available from the source?

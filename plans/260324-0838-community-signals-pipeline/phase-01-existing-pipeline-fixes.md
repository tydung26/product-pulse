# Phase 1: Existing Pipeline Fixes

## Context Links

- Brainstorm: `plans/reports/brainstorm-260324-0826-community-signals-pipeline.md`
- Current summarizer: `scripts/ai/summarize-app-reviews.ts`
- Current analyzer: `scripts/ai/analyze.ts`
- Current prompt: `scripts/ai/prompt.ts`

## Overview

- **Priority:** P1 (blocking — fixes must land before enhancements)
- **Status:** pending
- **Effort:** 2h
- **Description:** Fix 4 bugs/issues in the existing pipeline before building new features on top of it.

## Key Insights

- `summarize-app-reviews.ts` orders reviews by `created_at DESC` (line 62). If 100-review limit truncates, milder 3-star reviews survive while worst 1-star reviews get cut.
- `analyze.ts` always inserts opportunities (line 99-117). Running twice = full duplicates.
- `prompt.ts` has `buildPrompt()` (line 87-175) that falls through to raw-review path never used — `buildSummaryPrompt()` always wins because `appSummaries` is always populated.
- `app_pain_summaries` never expires. New reviews arrive but old summary persists until the app has unprocessed reviews AND summarizer re-runs.

## Requirements

### Functional

1. Reviews ordered by `rating ASC, created_at DESC` so 1-star reviews prioritized
2. Opportunity dedup: hash check (title + category) before insert, skip if exists
3. Remove dead `buildPrompt()` raw-review path in `prompt.ts`
4. Pain summary staleness: invalidate summary when new reviews arrive for an app

### Non-functional

- No breaking changes to existing data
- Dedup must be idempotent (safe to re-run)

## Architecture

No architectural changes. All fixes are in existing files.

### Dedup Strategy

Generate a hash from `normalizedTitle + category`. Before insert, query `opportunities` for matching hash. Use a new `dedup_hash` column on `opportunities` table (added in Phase 3 migration, but can be a simple check without column too).

**Simpler approach (no schema change):** Query by exact title + category match before insert.

### Staleness Strategy

When `crawl-store-reviews.ts` inserts new reviews for an app, set `app_pain_summaries.updated_at` to null (or delete the row) to signal staleness. Then `summarize-app-reviews.ts` should also pick up apps with stale summaries, not just unprocessed reviews.

## Related Code Files

| File | Action |
|------|--------|
| `scripts/ai/summarize-app-reviews.ts` | Modify: change review ordering (line 62) |
| `scripts/ai/analyze.ts` | Modify: add dedup check before insert (around line 99) |
| `scripts/ai/prompt.ts` | Modify: remove `buildPrompt()` lines 87-175 |
| `scripts/crawlers/crawl-store-reviews.ts` | Modify: invalidate pain summary on new reviews |
| `scripts/ai/summarize-app-reviews.ts` | Modify: also pick up stale summaries |

## Implementation Steps

### 1. Fix review ordering in summarizer

In `summarize-app-reviews.ts`, line 62:
```
- .order("created_at", { ascending: false })
+ .order("rating", { ascending: true })
+ .order("created_at", { ascending: false })
```

This ensures 1-star reviews come first. If 100-review limit truncates, 3-star reviews get cut.

### 2. Add opportunity dedup in analyze.ts

In `saveOpportunity()`, before the insert:
```typescript
// Check for existing opportunity with same title + category
const { data: existing } = await supabaseAdmin
  .from("opportunities")
  .select("id")
  .eq("title", result.title)
  .eq("category", result.category)
  .limit(1)

if (existing && existing.length > 0) {
  logger.info(`Skipping duplicate: "${result.title}" [${result.category}]`)
  return
}
```

### 3. Remove dead buildPrompt() in prompt.ts

Delete lines 85-175 (the entire `buildPrompt()` function and its raw-review path). Update `anthropic-sdk.ts` and `claude-cli.ts` to import `buildSummaryPrompt` instead of `buildPrompt`.

Rename `buildSummaryPrompt` to `buildPrompt` for clarity (it's now the only prompt builder).

### 4. Pain summary staleness

**4a.** In `crawl-store-reviews.ts`, after inserting new reviews for an app, delete the existing `app_pain_summaries` row for that app (forces re-summarization).

**4b.** In `summarize-app-reviews.ts`, modify `getAppsWithUnprocessedReviews()` to ALSO return apps that have no pain summary (summary was invalidated).

Query: apps where `store_reviews.is_processed = false` OR `app_pain_summaries` row doesn't exist but `store_reviews` exist.

## Todo List

- [ ] Change review ordering to `rating ASC, created_at DESC`
- [ ] Add opportunity dedup check (title + category) before insert
- [ ] Remove dead `buildPrompt()` raw-review path
- [ ] Update provider imports from `buildPrompt` to `buildSummaryPrompt` (then rename)
- [ ] Invalidate pain summary when new reviews inserted
- [ ] Modify summarizer to pick up apps with missing/stale summaries
- [ ] Smoke test: run `pnpm analyze` twice, verify no duplicates

## Success Criteria

- Running `pnpm analyze` twice produces same opportunity count (no dupes)
- 1-star reviews appear first in summarization input
- No dead code in `prompt.ts`
- New reviews for an app trigger re-summarization on next run

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Dedup by title is fragile (AI may rephrase) | Acceptable for MVP; can add fuzzy match later |
| Invalidating summaries causes re-work | Only invalidates when new reviews arrive — expected behavior |

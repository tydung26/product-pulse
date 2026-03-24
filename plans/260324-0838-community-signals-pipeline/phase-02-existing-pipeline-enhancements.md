# Phase 2: Existing Pipeline Enhancements

## Context Links

- Phase 1 (prerequisite): `phase-01-existing-pipeline-fixes.md`
- Analyzer: `scripts/ai/analyze.ts`
- Providers: `scripts/ai/providers/anthropic-sdk.ts`, `scripts/ai/providers/claude-cli.ts`
- Types: `scripts/ai/providers/types.ts`

## Overview

- **Priority:** P1
- **Status:** pending
- **Effort:** 3h
- **Description:** Performance and quality improvements to existing pipeline: incremental analysis, parallel categories, SDK as default, startup enrichment.

## Key Insights

- `analyze.ts` processes categories sequentially (line 220). Summarizer already has concurrency pool pattern (line 224-236) — reuse same pattern.
- Provider selection is `--api` flag (line 177-189). Default is CLI which uses `spawnSync` — slow and fragile.
- Startup data is thin: name, tagline, upvotes. No way to distinguish dead projects from active competitors.

## Requirements

### Functional

1. Incremental analysis: only re-analyze categories where `app_pain_summaries.updated_at` changed since last analyze run
2. Parallel category analysis: 3-4 concurrent (reuse worker pool pattern from summarizer)
3. Anthropic SDK as default provider; CLI as fallback when no API key
4. Startup enrichment: add `last_active_date` and `status` fields

### Non-functional

- Parallel analysis must not exceed API rate limits
- Provider fallback must be transparent (no user intervention)

## Architecture

### Incremental Analysis

Track last analyze timestamp in `crawl_jobs` table. On each run:
1. Query latest completed `analyze` crawl job's `completed_at`
2. Query `app_pain_summaries` with `updated_at > last_analyze_at` (or created_at for new ones)
3. Only build category inputs from changed summaries
4. If `--full` flag passed, analyze all categories (override)

### Provider Auto-selection

```
if ANTHROPIC_API_KEY set → AnthropicSDKProvider (default)
if no API key → ClaudeCLIProvider (fallback)
if --cli flag → force ClaudeCLIProvider
```

### Parallel Categories

Reuse the worker pool pattern from `summarize-app-reviews.ts`:
```typescript
const queue = [...categories]
async function worker() {
  while (queue.length > 0) {
    const category = queue.shift()!
    await analyzeCategory(category)
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))
```

Default concurrency: 3 (conservative for API rate limits).

## Related Code Files

| File | Action |
|------|--------|
| `scripts/ai/analyze.ts` | Modify: incremental analysis, parallel categories, provider auto-select |
| `scripts/ai/providers/types.ts` | No change |
| `src/lib/types/database.ts` | Modify: add Startup fields (last_active_date, status) |
| `scripts/crawlers/crawl-yc-launches.ts` | Modify: populate new startup fields if available |
| `scripts/crawlers/crawl-product-hunt.ts` | Modify: populate new startup fields if available |

## Implementation Steps

### 1. Incremental analysis in analyze.ts

Add function to get last analyze timestamp:
```typescript
async function getLastAnalyzeTime(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("crawl_jobs")
    .select("completed_at")
    .eq("job_type", "analyze")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
  return data?.[0]?.completed_at ?? null
}
```

Filter summaries: only include those with `created_at` or `updated_at` after last analyze time. Add `--full` flag to override.

### 2. Parallel category analysis

Replace sequential `for (const category of categories)` loop (line 220) with worker pool. Add `--concurrency` flag (default 3).

### 3. Provider auto-selection

Replace `--api` flag logic:
```typescript
const forceCli = args.includes("--cli")
let provider: AIProvider
if (!forceCli && process.env.ANTHROPIC_API_KEY) {
  const { AnthropicSDKProvider } = await import("./providers/anthropic-sdk")
  provider = new AnthropicSDKProvider()
  logger.info("Using Anthropic SDK provider")
} else {
  const { ClaudeCLIProvider } = await import("./providers/claude-cli")
  provider = new ClaudeCLIProvider()
  logger.info("Using Claude CLI provider (fallback)")
}
```

### 4. Startup enrichment

Add migration for new columns (can bundle with Phase 3 migration):
```sql
ALTER TABLE startups ADD COLUMN last_active_date timestamptz;
ALTER TABLE startups ADD COLUMN status text DEFAULT 'unknown'
  CHECK (status IN ('active', 'inactive', 'unknown'));
```

Update crawlers to populate when data available.

## Todo List

- [ ] Add `getLastAnalyzeTime()` function
- [ ] Filter summaries by timestamp for incremental analysis
- [ ] Add `--full` flag to override incremental
- [ ] Replace sequential category loop with worker pool
- [ ] Add `--concurrency` flag (default 3)
- [ ] Change provider selection: SDK default, CLI fallback, `--cli` flag
- [ ] Add startup `last_active_date` and `status` to types
- [ ] Update YC/PH crawlers to populate new fields
- [ ] Test incremental: run analyze, add new summary, re-run — only new category analyzed

## Success Criteria

- Second `pnpm analyze` run skips unchanged categories (logs show "skipping N unchanged")
- Categories analyzed in parallel (visible in log timestamps)
- `pnpm analyze` uses SDK by default when `ANTHROPIC_API_KEY` is set
- Startup records include `status` field

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Parallel API calls hit rate limit | Default concurrency 3; Anthropic allows 50 RPM on most tiers |
| Incremental misses edge cases | `--full` flag as escape hatch |

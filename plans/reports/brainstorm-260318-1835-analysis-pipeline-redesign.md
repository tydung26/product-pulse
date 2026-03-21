# Brainstorm: Analysis Pipeline Redesign

## Problem
- 79K reviews analyzed 50 at a time = 1,583 Claude CLI calls (~40 hours)
- Reviews from different apps/categories mixed in same batch → noisy, unfocused opportunities
- No dedup → similar complaints processed multiple times
- Each batch sends all 2,530 apps as context (wasteful)

## Decision: 2-Step Pipeline

### Step 1 — Summarize per app
- For each app with unprocessed reviews, send ALL its reviews to Claude
- Output: top 3-5 pain themes with severity, affected user segments, review count per theme
- Store in new `app_pain_summaries` table (app_id, themes JSON, review_count, created_at)
- Mark reviews as `is_processed = true` after summarization
- ~800 apps have reviews → ~800 Claude calls

### Step 2 — Analyze by category
- Group app pain summaries by category
- Include startup context (competitors/related)
- Claude identifies cross-app patterns → opportunities
- ~50 categories → ~50 Claude calls
- Opportunities link to apps, startups, and summaries

### Why better
- Step 1 sees ALL reviews for one app (complete picture)
- Step 2 compares pain themes across apps in same domain (coherent)
- Total ~850 calls vs 1,583 (half the time)
- Higher quality: focused context per call, no cross-domain noise

## Schema Change
New table: `app_pain_summaries`
- `id` UUID PK
- `app_id` UUID FK → apps
- `themes` JSONB — array of {theme, severity, review_count, example_quotes}
- `total_reviews` int
- `created_at` timestamptz

## Implementation Steps
1. Create migration for `app_pain_summaries`
2. New script: `scripts/ai/summarize-app-reviews.ts` (Step 1)
3. Refactor `scripts/ai/analyze.ts` to read summaries instead of raw reviews (Step 2)
4. Update prompt.ts for both steps
5. Update package.json scripts

## Risks
- Step 1 still takes ~20 hours via Claude CLI for 800 apps
- Apps with 100+ reviews may hit token limits → cap at 100 most recent
- Two-step means two places to debug if something breaks

## Next Steps
- Implement Step 1 first, run it
- Then implement Step 2 refactor
- Keep old analyze.ts logic as fallback

# Brainstorm: 2-Stage Analyze Pipeline

**Date:** 2026-03-25
**Problem:** Current per-category analysis produces 29+ large AI calls that timeout on CLI, outputs 145 scattered opportunities instead of actionable "what to build" list.

## Data Available

- 448 app pain summaries (from 79K reviews across 2,550 apps)
- 1,153 community pain clusters (from 9,537 HN + IH posts, 610 WTP)
- 0 startups (crawlers broken — not blocking)

## Agreed Solution: 2-Stage Pipeline

### Stage 1: RANK (`pnpm analyze`)

Single AI call. Compact prompt.

**Input:**
- Top 30 app pain themes (highest severity × review count)
- Top 30 community clusters (highest total_posts)
- Brief: theme name, severity, post/review count, source

**Prompt task:** "Rank the top 10-15 product opportunities. Cross-reference app pain with community pain. For each: title, 1-2 sentence description, estimated score, which sources confirm it."

**Output:** Ranked list saved to `opportunities` table with basic scores. No evidence chains yet — just the ranking.

**Token budget:** ~2-3K input, ~2K output. CLI-compatible.

### Stage 2: DRILL DOWN (`pnpm analyze:deep <opportunity-id>`)

One AI call per opportunity. On-demand.

**Input:**
- The specific opportunity title + description
- ALL app pain summaries related to that opportunity's category/theme
- ALL community clusters related to that theme
- ALL raw community posts with WTP signals for that theme

**Prompt task:** Full dossier — evidence with quotes, score breakdown with reasoning, critique (why it might NOT work), open questions to validate.

**Output:** Updates the opportunity row with evidence_summary, score_breakdown, critique, openQuestions.

**Token budget:** ~5-10K input (focused on one topic), ~3K output. CLI-compatible per call.

### Implementation Changes

**New/Modified files:**
- `scripts/ai/analyze.ts` — rewrite main() for Stage 1 (single ranking call)
- `scripts/ai/analyze-deep.ts` — NEW, Stage 2 (per-opportunity deep dive)
- `scripts/ai/prompt.ts` — add `buildRankingPrompt()` and `buildDeepDivePrompt()`
- `package.json` — add `analyze:deep` script

**What gets removed:**
- Per-category loop + worker pool (no longer needed for Stage 1)
- Cross-category pass (ranking IS the cross-category view)

**What stays:**
- Evidence types, junction tables, score breakdown — used in Stage 2
- Dedup check, incremental mode
- Provider auto-selection (SDK/CLI)

### User Workflow

```bash
pnpm analyze --full          # Stage 1: get ranked list (30 seconds)
pnpm dev                     # Browse /opportunities — see top 10-15
# Pick the ones that interest you
pnpm analyze:deep <id>       # Stage 2: full dossier on specific pick
pnpm analyze:deep <id2>      # Repeat for each interesting one
```

## Why This Wins

1. **CLI-compatible** — each call is small enough
2. **Actionable** — "here are the top 10" vs "here are 145 scattered results"
3. **Cost-efficient** — only deep-dive on what you care about
4. **Fast** — Stage 1 takes 30s, Stage 2 takes 1-2 min per pick
5. **Critique preserved** — Stage 2 still does devil's advocate + open questions

## Unresolved Questions

1. How to match community clusters to specific opportunities in Stage 2? By keyword similarity? Or ask AI in Stage 1 to tag which clusters relate to each opportunity?

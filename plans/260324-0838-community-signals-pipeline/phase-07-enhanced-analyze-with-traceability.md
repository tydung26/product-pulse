# Phase 7: Enhanced Analyze with Traceability

## Context Links

- Phase 2 (prerequisite): `phase-02-existing-pipeline-enhancements.md`
- Phase 6 (prerequisite): `phase-06-community-summarizer.md`
- Brainstorm traceability section: `plans/reports/brainstorm-260324-0826-community-signals-pipeline.md`
- Current analyzer: `scripts/ai/analyze.ts`
- Current prompt: `scripts/ai/prompt.ts`
- Current parser: `scripts/ai/parse-ai-response.ts`
- Provider types: `scripts/ai/providers/types.ts`

## Overview

- **Priority:** P1 (core feature — cross-source analysis with evidence chains)
- **Status:** pending
- **Effort:** 6h
- **Description:** Enhance analyze pipeline to ingest community pain summaries alongside app summaries. AI must output structured evidence with quotes, per-dimension score reasoning, and WTP signal counts. Add cross-category final pass. Save evidence to junction tables.

## Key Insights

- Current `analyze.ts` only reads `app_pain_summaries`. Must also read `community_pain_summaries`.
- Current prompt asks for appIndices/startupIndices but no quotes or evidence structure.
- AI output format must change — this is a breaking change to OpportunityResult type.
- Cross-category final pass: after per-category analysis, one AI call across ALL category results to find platform-level opportunities (e.g. "offline support" pain across Finance + Productivity).
- Enhanced scoring: existing formula + WTP bonus when community signals confirm demand.

## Requirements

### Functional

1. `analyze.ts` fetches `community_pain_summaries` alongside `app_pain_summaries`
2. `prompt.ts` includes community section with WTP signals highlighted
3. AI must output structured `evidence[]` array with quotes and source indices
4. AI must output `score_breakdown{}` with per-dimension reasoning
5. AI must flag which evidence items contain WTP signals
6. `parse-ai-response.ts` validates evidence structure + score_breakdown
7. Cross-category final pass: single AI call across all per-category results
8. Enhanced scoring: `pain*0.4 + market*0.35 + inv_competition*0.25 + wtp_bonus`
9. Save evidence to `opportunity_reviews` (with quote, relevance) and `opportunity_community_posts`
10. Save score_breakdown and evidence_summary to opportunities table
11. Dedup check before insert (from Phase 1)

### Non-functional

- Backward compatible: existing opportunities without evidence still display
- Token budget: community section adds ~30% more context; stay under model limits
- Cross-category pass should be optional (`--cross-category` flag)

## Architecture

### Enhanced AnalysisInput

```typescript
export type AnalysisInput = {
  apps: AppContext[]
  startups: StartupContext[]
  reviews: ReviewContext[]
  startupComments: StartupCommentContext[]
  appSummaries?: AppSummaryContext[]
  // NEW
  communitySummaries?: CommunitySummaryContext[]
}

export type CommunitySummaryContext = {
  index: number
  source: string
  topic: string
  themes: PainTheme[]
  total_posts: number
  wtp_count: number  // derived from community_posts for this topic
}
```

### Enhanced OpportunityResult

```typescript
export type OpportunityResult = {
  // existing fields...
  title: string
  description: string
  category: string
  score: number
  painSeverity: number
  marketSize: number
  competition: number
  verdict: "strong" | "moderate" | "weak"
  painSummary: string[]
  solutionAngles: string[]
  reasoning: string
  appIndices: number[]
  startupIndices: number[]

  // NEW: evidence chain
  evidence: EvidenceItem[]
  scoreBreakdown: {
    pain: { score: number; reasoning: string }
    market: { score: number; reasoning: string }
    competition: { score: number; reasoning: string }
    wtp_bonus: number
  }
  wtpCount: number
  sourceDistribution: Record<string, number> // { "app_store": 3, "reddit": 5, "hn": 2 }

  // DEPRECATED (kept for backward compat, populated from evidence[])
  reviewIndices: number[]
  commentIndices: number[]
  appComments: Record<number, string>
  startupComments: Record<number, { comment: string; role: string }>
}

export type EvidenceItem = {
  type: "app_review" | "community_post"
  sourceIndex: number       // index into appSummaries[] or communitySummaries[]
  quote: string             // extracted quote
  relevance: string         // why this evidence matters
  hasWtp: boolean           // WTP signal in this evidence
}
```

### Enhanced Prompt Structure

```
## INPUT DATA

### App Pain Summaries (aggregated from 1-3 star reviews)
[App #0] AppName ... themes: ...

### Community Pain Summaries (from Reddit, HN, Indie Hackers)
[Community #0] (reddit) "CRM tools too complex" — 15 posts, 3 WTP signals
  Themes:
    - "Feature bloat" (severity: 75, 8 posts)
    - "Pricing too high for solos" (severity: 60, 5 posts)

### Startups (potential competitors)
[Startup #0] ...

## TASK
... (enhanced with evidence citation + score breakdown requirements)

## OUTPUT FORMAT
[
  {
    "title": "...",
    "evidence": [
      { "type": "app_review", "sourceIndex": 0, "quote": "Can't export data...", "relevance": "Data portability pain", "hasWtp": false },
      { "type": "community_post", "sourceIndex": 2, "quote": "I'd pay $50/mo for...", "relevance": "Direct WTP signal", "hasWtp": true }
    ],
    "scoreBreakdown": {
      "pain": { "score": 85, "reasoning": "12 app reviews + 8 Reddit posts confirm..." },
      "market": { "score": 70, "reasoning": "Combined 500K downloads across affected apps..." },
      "competition": { "score": 30, "reasoning": "2 startups attempting but poor reviews..." },
      "wtp_bonus": 5
    },
    ...
  }
]
```

### Cross-Category Final Pass

After per-category analysis completes:
1. Collect all per-category opportunities
2. Build summary prompt: "Given these opportunities across categories, identify 1-3 platform-level opportunities that span multiple categories"
3. Single AI call → platform opportunities
4. Save with category="Cross-Category"

### WTP Bonus Scoring

```typescript
const WTP_BONUS_MAX = 10
const wtpBonus = Math.min(WTP_BONUS_MAX, result.wtpCount * 2)
const score = pain * 0.4 + market * 0.35 + (100 - competition) * 0.25 + wtpBonus
// Cap at 100
```

## Related Code Files

| File | Action |
|------|--------|
| `scripts/ai/analyze.ts` | Modify: fetch community summaries, cross-category pass, save evidence |
| `scripts/ai/prompt.ts` | Modify: add community section, evidence citation requirements |
| `scripts/ai/parse-ai-response.ts` | Modify: validate evidence[], scoreBreakdown |
| `scripts/ai/providers/types.ts` | Modify: update AnalysisInput, OpportunityResult, add EvidenceItem |
| `scripts/ai/providers/anthropic-sdk.ts` | Minor: increase max_tokens for larger response |
| `src/lib/types/database.ts` | Already updated in Phase 3 |

## Implementation Steps

### 1. Update types in providers/types.ts

Add `CommunitySummaryContext`, `EvidenceItem`, update `AnalysisInput` and `OpportunityResult` as described above.

### 2. Update prompt.ts

- Rename: already `buildSummaryPrompt` from Phase 1
- Add `buildCommunitySummarySection(summaries)` function
- Add community section to prompt between app summaries and startups
- Update TASK section to require evidence citations and score breakdown
- Update OUTPUT FORMAT with new fields

### 3. Update parse-ai-response.ts

Add validation for new fields:
```typescript
// Validate evidence array
const evidence = Array.isArray(item.evidence)
  ? item.evidence.filter(e => e.type && e.quote && e.relevance)
  : []

// Validate scoreBreakdown
const scoreBreakdown = item.scoreBreakdown && typeof item.scoreBreakdown === "object"
  ? {
      pain: { score: clamp(item.scoreBreakdown.pain?.score, 0, 100), reasoning: String(item.scoreBreakdown.pain?.reasoning ?? "") },
      market: { score: clamp(item.scoreBreakdown.market?.score, 0, 100), reasoning: String(item.scoreBreakdown.market?.reasoning ?? "") },
      competition: { score: clamp(item.scoreBreakdown.competition?.score, 0, 100), reasoning: String(item.scoreBreakdown.competition?.reasoning ?? "") },
      wtp_bonus: clamp(item.scoreBreakdown.wtp_bonus, 0, 10),
    }
  : null
```

Backward compat: if evidence[] missing, fall back to existing reviewIndices/commentIndices.

### 4. Update analyze.ts

**4a.** Add `getAllCommunitySummaries()` function:
```typescript
async function getAllCommunitySummaries(): Promise<CommunityPainSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("community_pain_summaries")
    .select("*")
  if (error) throw new Error(`Failed: ${error.message}`)
  return data ?? []
}
```

**4b.** Update `buildInputFromSummaries()` to include community summaries.

**4c.** Update `saveOpportunity()` to save evidence:
- Save evidence_summary, wtp_count, source_count, score_breakdown to opportunities row
- For each evidence item of type "community_post": insert into `opportunity_community_posts`
- For each evidence item of type "app_review": insert into `opportunity_reviews` with quote + relevance

**4d.** Add cross-category final pass after per-category loop:
```typescript
if (args.includes("--cross-category") && allCategoryResults.length > 0) {
  const crossPrompt = buildCrossCategoryPrompt(allCategoryResults)
  const crossResults = await analyzeWithRetry(provider, crossInput)
  // Save with category="Cross-Category"
}
```

### 5. Increase Anthropic SDK max_tokens

In `anthropic-sdk.ts`, increase `max_tokens` from 4096 to 8192 (evidence array is larger).

## Todo List

- [ ] Update AnalysisInput with communitySummaries field
- [ ] Add CommunitySummaryContext and EvidenceItem types
- [ ] Update OpportunityResult with evidence, scoreBreakdown, wtpCount, sourceDistribution
- [ ] Add community summary section to prompt
- [ ] Add evidence citation requirements to prompt
- [ ] Update output format in prompt with new JSON shape
- [ ] Validate evidence[] in parse-ai-response.ts
- [ ] Validate scoreBreakdown in parse-ai-response.ts
- [ ] Backward compat: handle missing evidence gracefully
- [ ] Fetch community_pain_summaries in analyze.ts
- [ ] Build input with community summaries
- [ ] Save evidence to junction tables
- [ ] Save enhanced opportunity fields (evidence_summary, wtp_count, etc.)
- [ ] Implement cross-category final pass with --cross-category flag
- [ ] Apply WTP bonus to scoring formula
- [ ] Increase max_tokens in anthropic-sdk.ts
- [ ] Test: run full pipeline (summarize + summarize:community + analyze)
- [ ] Verify evidence chains stored in junction tables
- [ ] Verify cross-category opportunities generated

## Success Criteria

- Opportunities include evidence[] with quotes from both app reviews and community posts
- Score breakdown has per-dimension reasoning stored in opportunities.score_breakdown
- WTP bonus applied: opportunities with community WTP signals score higher
- Junction tables populated: opportunity_reviews has quote+relevance, opportunity_community_posts populated
- Cross-category pass produces 1-3 platform-level opportunities
- Existing opportunities (without evidence) still display without errors

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| AI doesn't follow evidence format | Validate + fall back to existing format; iterative prompt tuning |
| Token limit exceeded with community data | Cap community summaries to top 20 per category by post count |
| Cross-category pass is too generic | Make it optional (--cross-category flag); tune prompt |
| Evidence indices don't match actual data | Validate indices in parser; skip invalid references |

## Security Considerations

- No new auth requirements
- Community post quotes in evidence are user-generated — display with appropriate escaping in frontend

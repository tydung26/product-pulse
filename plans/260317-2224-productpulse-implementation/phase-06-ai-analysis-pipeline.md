# Phase 6: AI Analysis Pipeline

## Context Links
- [Brainstorm — AI pipeline](../reports/brainstorm-260317-2137-project-architecture.md)
- [Phase 5 — review crawler](phase-05-review-crawler.md)

## Overview
- **Priority:** P1
- **Status:** pending
- **Effort:** 5h
- **Description:** Build the AI analysis pipeline (Step 3). Reads unprocessed reviews + app data + startups → sends to Claude → parses scored opportunities → upserts to DB. Two providers: `--local-ai` (Claude CLI) and `--api` (Anthropic SDK).

## Key Insights
- Input: unprocessed store_reviews + app metadata + startup data
- Output: opportunities with multi-dimensional scoring (0-100)
- AI scores: pain_severity, market_size, competition → overall score + verdict
- Junction tables link opportunities ↔ apps, startups, reviews
- `--local-ai` shells out to `claude` CLI (no API key needed)
- `--api` uses `@anthropic-ai/sdk` (needs ANTHROPIC_API_KEY)

## Requirements

### Functional
- Entry point: `pnpm analyze [--local-ai|--api]`
- Gather unprocessed reviews grouped by app
- Include app metadata (MRR, downloads, rating) + related startups
- Send structured prompt to AI → receive OpportunityResult[]
- Upsert opportunities + all junction table rows
- Mark reviews `is_processed=true`
- Log crawl_job (job_type='analyze')

### Non-functional
- Structured JSON output from AI (validated before DB insert)
- Batch processing: group reviews by app/category to reduce AI calls
- Graceful failure: partial results still saved

## Architecture

```
analyze.ts (entry)
  │
  ├─ Parse CLI args: --local-ai (default) or --api
  ├─ Select provider: ClaudeCLI or AnthropicSDK
  │
  ├─ Gather data:
  │   ├─ Unprocessed reviews (grouped by app)
  │   ├─ App metadata for those apps
  │   └─ All startups (for competition context)
  │
  ├─ Build prompt: structured input with reviews + metadata
  ├─ Call provider.analyze(input)
  ├─ Parse + validate OpportunityResult[]
  │
  ├─ Upsert to DB:
  │   ├─ opportunities
  │   ├─ opportunity_apps (with ai_comment)
  │   ├─ opportunity_startups (with ai_comment, role)
  │   ├─ opportunity_reviews (evidence links)
  │   └─ Mark reviews is_processed=true
  │
  └─ Log crawl_job (type='analyze')
```

### Provider Interface
```typescript
interface AIProvider {
  analyze(input: AnalysisInput): Promise<OpportunityResult[]>
}

interface AnalysisInput {
  apps: AppContext[]
  startups: StartupContext[]
  reviews: ReviewContext[]
}
```

## Related Code Files

### Create
- `scripts/ai/analyze.ts` — entry point
- `scripts/ai/providers/types.ts` — AIProvider interface, OpportunityResult, AnalysisInput
- `scripts/ai/providers/claude-cli.ts` — Claude CLI provider
- `scripts/ai/providers/anthropic-sdk.ts` — Anthropic SDK provider
- `scripts/ai/prompt.ts` — prompt template builder

### Dependencies
- `scripts/crawlers/lib/supabase-admin.ts` (Phase 2)
- `src/lib/types/database.ts` (Phase 2)
- Requires reviews in DB (Phase 5 must run first)

## Implementation Steps

1. **Create `providers/types.ts`**
   ```typescript
   export interface OpportunityResult {
     title: string
     description: string
     category: string
     score: number           // 0-100
     painSeverity: number    // 0-100
     marketSize: number      // 0-100
     competition: number     // 0-100
     verdict: 'strong' | 'moderate' | 'weak'
     painSummary: string[]
     solutionAngles: string[]
     reasoning: string
     // Links back to input data
     appIndices: number[]     // which input apps
     startupIndices: number[] // which input startups
     reviewIndices: number[]  // which input reviews
     appComments: Record<number, string>     // index → AI comment
     startupComments: Record<number, { comment: string; role: string }>
   }

   export interface AIProvider {
     analyze(input: AnalysisInput): Promise<OpportunityResult[]>
   }
   ```

2. **Create `prompt.ts`** — build the system + user prompt
   - System: "You are a product analyst. Given app data, reviews, and startup competition, identify viable product opportunities."
   - User: structured input (apps with metadata, reviews grouped by app, startups)
   - Output format: JSON array of OpportunityResult
   - Include few-shot example for reliable structured output
   - Keep prompt under 4000 tokens where possible (batch by category if needed)

3. **Create `claude-cli.ts`**
   ```typescript
   import { execSync } from 'child_process'

   export class ClaudeCLIProvider implements AIProvider {
     async analyze(input: AnalysisInput): Promise<OpportunityResult[]> {
       const prompt = buildPrompt(input)
       const result = execSync(`echo '${escaped}' | claude --print`, {
         encoding: 'utf-8',
         maxBuffer: 10 * 1024 * 1024
       })
       return parseAndValidate(result)
     }
   }
   ```
   - Escape prompt for shell safely (use temp file if needed)
   - Parse JSON from stdout, validate schema

4. **Create `anthropic-sdk.ts`**
   ```typescript
   import Anthropic from '@anthropic-ai/sdk'

   export class AnthropicSDKProvider implements AIProvider {
     private client: Anthropic
     constructor() {
       this.client = new Anthropic() // reads ANTHROPIC_API_KEY
     }
     async analyze(input: AnalysisInput): Promise<OpportunityResult[]> {
       const response = await this.client.messages.create({
         model: 'claude-sonnet-4-20250514',
         max_tokens: 4096,
         messages: [{ role: 'user', content: buildPrompt(input) }]
       })
       return parseAndValidate(response.content[0].text)
     }
   }
   ```

5. **Create `analyze.ts`** — main entry
   - Parse `--local-ai` or `--api` from `process.argv`
   - Select provider
   - Query unprocessed reviews + apps + startups
   - Group reviews by app for batching
   - Call provider.analyze() per batch
   - For each OpportunityResult:
     - Insert opportunity row
     - Insert opportunity_apps rows (with ai_comment)
     - Insert opportunity_startups rows (with ai_comment, role)
     - Insert opportunity_reviews rows (evidence)
   - Mark all processed reviews `is_processed=true`
   - Log crawl_job

6. **JSON validation** — create `parseAndValidate(raw: string)`
   - Extract JSON from response (handle markdown code fences)
   - Validate required fields, score ranges (0-100), verdict enum
   - Log warnings for malformed items, skip them

7. **Batching strategy**
   - Group reviews by app category
   - Max ~50 reviews per AI call (token budget)
   - If >50 unprocessed reviews for a category, split into batches

8. **Test** — seed some reviews, run `pnpm analyze --local-ai`

## Todo List

- [ ] Create AIProvider interface and types
- [ ] Create prompt builder with structured input/output format
- [ ] Implement Claude CLI provider (shell out to `claude`)
- [ ] Implement Anthropic SDK provider
- [ ] Create analyze.ts entry with CLI arg parsing
- [ ] Implement data gathering (unprocessed reviews + apps + startups)
- [ ] Implement batching strategy (group by category)
- [ ] Implement opportunity upsert with all junction tables
- [ ] Implement is_processed=true marking
- [ ] Add JSON validation and error recovery
- [ ] Log crawl_job for analyze runs
- [ ] Test with --local-ai flag
- [ ] Test with --api flag (if API key available)

## Success Criteria
- `pnpm analyze --local-ai` processes unprocessed reviews
- Opportunities created with scores, verdict, pain_summary
- Junction tables populated (opportunity_apps, opportunity_startups, opportunity_reviews)
- Reviews marked `is_processed=true` after analysis
- crawl_jobs record with type='analyze'
- Re-running processes only new unprocessed reviews

## Risk Assessment
- **Claude CLI output parsing**: May include non-JSON text. Use regex to extract JSON block.
- **Token limits**: Large review batches may exceed context. Batch by category, cap at 50.
- **Structured output reliability**: Use few-shot example in prompt. Validate aggressively.
- **Claude CLI availability**: Must have `claude` installed. Log clear error if missing.

## Next Steps
→ Phase 7: Dashboard (can develop in parallel with crawlers)
→ Full pipeline test: crawl:apps → crawl:store_reviews → analyze

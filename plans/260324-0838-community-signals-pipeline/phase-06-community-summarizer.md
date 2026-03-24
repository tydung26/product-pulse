# Phase 6: Community Summarizer

## Context Links

- Phase 3-5 (prerequisites): community_posts table populated by crawlers
- App summarizer (reference): `scripts/ai/summarize-app-reviews.ts`
- AI providers: `scripts/ai/providers/`

## Overview

- **Priority:** P1 (required before enhanced analyze)
- **Status:** pending
- **Effort:** 4h
- **Description:** AI-powered summarizer that groups community posts by detected topic clusters (not by app), extracts pain themes per cluster, flags WTP signals, and upserts into community_pain_summaries.

## Key Insights

- Unlike app review summarizer (groups by app), community posts have no natural grouping
- AI must detect topic clusters from raw posts — this is a two-step process: cluster, then summarize
- Can optimize by doing clustering + summarization in single AI call
- Existing summarizer uses Claude CLI for zero API cost — same approach here
- community_pain_summaries.themes should match same shape as app_pain_summaries.themes for downstream consistency

## Requirements

### Functional

1. Fetch unprocessed `community_posts` (is_processed = false)
2. Batch posts (max 50 per AI call to fit context window)
3. AI groups posts into 3-8 topic clusters based on content similarity
4. For each cluster: extract pain themes (same shape as app_pain_summaries.themes)
5. Flag which clusters contain WTP signals (from has_wtp flag on posts)
6. Upsert results into `community_pain_summaries` (keyed by source + topic)
7. Mark posts as processed

### Non-functional

- Use Claude CLI by default (no API cost), Anthropic SDK with `--api` flag
- Concurrency: process one source at a time (reddit, hn, indie_hackers)
- Idempotent: re-running doesn't create duplicate summaries (upsert on source+topic)

## Architecture

### Processing Flow

```
1. For each source (reddit, hn, indie_hackers):
   a. Fetch unprocessed posts for that source
   b. Batch into groups of 50
   c. For each batch:
      i.  Build prompt with post titles + bodies + WTP flags
      ii. AI returns topic clusters with themes
      iii. Upsert into community_pain_summaries
      iv. Mark posts as processed
```

### AI Prompt Design

Single-call approach (cluster + summarize together):
```
Given these community posts from {source}, identify 3-8 distinct topic clusters.
For each cluster:
- topic: descriptive name (5-15 words)
- themes: array of pain themes (same as app pain summaries)
- wtp_count: how many posts in this cluster have WTP signals
- post_indices: which posts belong to this cluster

Posts:
[1] (WTP) "I wish there was a simpler CRM for solopreneurs..."
[2] "Frustrated with Notion's offline support..."
...
```

### Output Format

```json
{
  "clusters": [
    {
      "topic": "CRM tools too complex for solo founders",
      "themes": [
        {
          "theme": "Feature bloat in existing CRMs",
          "severity": 75,
          "review_count": 8,
          "example_quotes": ["Too many features I don't need", "Just want contact management"]
        }
      ],
      "wtp_count": 3,
      "post_indices": [1, 5, 12, 15]
    }
  ]
}
```

### Staleness

Same pattern as app summaries: when new posts arrive for a source, the next summarizer run processes them and upserts updated clusters. Old clusters not touched by new data remain valid.

## Related Code Files

| File | Action |
|------|--------|
| `scripts/ai/summarize-community-posts.ts` | Create |
| `scripts/ai/providers/types.ts` | Modify: add CommunitySummarizationResult type |
| `package.json` | Modify: add `summarize:community` script |

## Implementation Steps

### 1. Create summarize-community-posts.ts

Following same structure as `summarize-app-reviews.ts`:

```typescript
// Main flow
async function main() {
  const args = process.argv.slice(2)
  const useApi = args.includes("--api")
  const sources = ["reddit", "hn", "indie_hackers"]

  for (const source of sources) {
    const posts = await getUnprocessedPosts(source)
    if (posts.length === 0) continue

    const batches = chunkArray(posts, 50)
    for (const batch of batches) {
      const prompt = buildCommunityPrompt(source, batch)
      const result = await callAI(prompt, useApi)
      await saveClusters(source, result.clusters)
      await markPostsProcessed(batch.map(p => p.id))
    }
  }
}
```

### 2. Build community summarization prompt

```typescript
function buildCommunityPrompt(source: string, posts: CommunityPost[]): string {
  const postLines = posts.map((p, i) => {
    const wtpFlag = p.has_wtp ? "(WTP) " : ""
    const channel = p.channel ? `[${p.channel}] ` : ""
    return `[${i}] ${wtpFlag}${channel}${p.title ?? ""}: ${p.body.slice(0, 400)}`
  }).join("\n")

  return `You are a product analyst. Analyze these ${posts.length} community posts from ${source} and group them into topic clusters...`
  // Full prompt with output format instructions
}
```

### 3. Parse and validate response

Similar to `parseSummarizationResponse` in summarizer:
- Extract JSON from response
- Validate clusters array structure
- Validate themes shape matches AppPainSummary.themes
- Clamp severity scores 0-100

### 4. Upsert into community_pain_summaries

For each cluster:
```typescript
await supabaseAdmin
  .from("community_pain_summaries")
  .upsert({
    source,
    topic: cluster.topic,
    themes: cluster.themes,
    total_posts: cluster.post_indices.length,
  }, { onConflict: "source,topic" })
```

### 5. Add pnpm script

```json
"summarize:community": "tsx scripts/ai/summarize-community-posts.ts"
```

### 6. Update orchestration script

Update `pnpm analyze` or create `pnpm pipeline` that runs:
1. `pnpm summarize` (app reviews)
2. `pnpm summarize:community` (community posts)
3. `pnpm analyze` (enhanced, Phase 7)

## Todo List

- [ ] Create `summarize-community-posts.ts`
- [ ] Build community clustering + summarization prompt
- [ ] Parse/validate AI response (clusters with themes)
- [ ] Upsert clusters into community_pain_summaries
- [ ] Mark processed posts
- [ ] Add `--api` flag for Anthropic SDK option
- [ ] Add `summarize:community` script to package.json
- [ ] Test: populate community_posts, run summarizer, verify clusters
- [ ] Verify themes shape matches app_pain_summaries.themes for consistency

## Success Criteria

- Summarizer produces 3-8 topic clusters per source
- Themes shape matches `AppPainSummary.themes` (severity, review_count, example_quotes)
- WTP count correctly reflects posts with has_wtp=true in each cluster
- Re-running with same data doesn't create duplicate summaries (upsert)
- Unprocessed posts correctly marked as processed after summarization

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| AI returns inconsistent topic names | Upsert by source+topic; similar topics merge naturally over runs |
| Topic drift across batches | Batch by source to keep context coherent |
| Token cost for large batches | Claude CLI default (free); cap at 50 posts/batch |
| AI fails to cluster meaningfully | Validate response; fall back to "Uncategorized" topic |

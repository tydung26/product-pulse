import type { AppSummaryContext, CommunitySummaryContext } from "./providers/types"

// -- Step 1 prompt is co-located in summarize-app-reviews.ts --

// -- Compact section builders for ranking prompt --

function buildCompactAppSection(summaries: AppSummaryContext[]): string {
  return summaries
    .map((a) => {
      const topThemes = a.themes
        .slice(0, 3)
        .map((t) => `${t.theme} (sev:${t.severity}, ${t.review_count} reviews)`)
        .join("; ")
      return `[App #${a.index}] ${a.name} (${a.category ?? "?"}, ${a.store}) — rating:${a.rating ?? "?"}, downloads:${a.downloads ?? "?"}, MRR:$${a.mrr ?? "?"} | ${topThemes}`
    })
    .join("\n")
}

function buildCompactCommunitySection(summaries: CommunitySummaryContext[]): string {
  if (!summaries || summaries.length === 0) return ""
  return summaries
    .map((c) => {
      const topThemes = c.themes
        .slice(0, 2)
        .map((t) => `${t.theme} (sev:${t.severity})`)
        .join("; ")
      return `[Community #${c.index}] (${c.source}) "${c.topic}" — ${c.total_posts} posts | ${topThemes}`
    })
    .join("\n")
}

// -- Stage 1: Ranking prompt (single call, compact) --

export function buildRankingPrompt(
  appSummaries: AppSummaryContext[],
  communitySummaries: CommunitySummaryContext[],
): string {
  const appSection = buildCompactAppSection(appSummaries)
  const communitySection = buildCompactCommunitySection(communitySummaries)

  return `You are a brutally honest product analyst. Given aggregated pain data from app store reviews and community discussions (HN, Indie Hackers), identify the TOP 10 product opportunities worth building.

## APP PAIN DATA (from 1-3 star reviews)
${appSection || "None."}

## COMMUNITY PAIN DATA (from HN + Indie Hackers discussions)
${communitySection || "None."}

## TASK

Cross-reference app pain with community pain. Identify the 10 best product opportunities — things someone could actually build and sell. For each:
1. Score pain (0-100), market (0-100), competition (0-100)
2. List which app indices and community indices support it
3. Give a brief critique: 1-2 reasons it might NOT work
4. Note if there are willingness-to-pay signals

## OUTPUT FORMAT

Return a JSON array (no markdown fences, just raw JSON):
[
  {
    "title": "Brief opportunity title",
    "description": "2-3 sentences. What to build and for whom.",
    "category": "Category name",
    "painSeverity": 85,
    "marketSize": 70,
    "competition": 40,
    "verdict": "strong",
    "painSummary": ["Key pain 1", "Key pain 2"],
    "solutionAngles": ["Build X that does Y", "Alternative: Z approach"],
    "reasoning": "Why this is viable...",
    "appIndices": [0, 5],
    "startupIndices": [],
    "communityIndices": [2, 7],
    "critique": ["Might not work because...", "Risk: ..."],
    "openQuestions": ["Need to validate: ..."],
    "hasWtpSignals": true
  }
]

Score: pain*0.4 + market*0.35 + (100-competition)*0.25. Verdicts: strong(>=70), moderate(40-69), weak(<40).
Return exactly 10 opportunities ranked by score descending. Be brutally honest in critiques.`
}

// -- Stage 2: Deep dive prompt (per-opportunity, focused) --

export function buildDeepDivePrompt(
  opportunity: { title: string; description: string; category: string },
  relatedAppSummaries: AppSummaryContext[],
  relatedCommunitySummaries: CommunitySummaryContext[],
): string {
  // Full detail for deep dive — include quotes
  const appSection = relatedAppSummaries
    .map((a) => {
      const themes = a.themes
        .map((t) =>
          `    - "${t.theme}" (severity: ${t.severity}, ${t.review_count} reviews) — quotes: ${t.example_quotes.slice(0, 3).map((q) => `"${q}"`).join(", ")}`
        )
        .join("\n")
      return `[App #${a.index}] ${a.name} (${a.store}, ${a.category ?? "?"}) — rating:${a.rating ?? "?"}, downloads:${a.downloads ?? "?"}\n${themes}`
    })
    .join("\n\n")

  const communitySection = relatedCommunitySummaries
    .map((c) => {
      const themes = c.themes
        .map((t) =>
          `    - "${t.theme}" (severity: ${t.severity}, ${t.review_count} posts) — quotes: ${t.example_quotes.slice(0, 3).map((q) => `"${q}"`).join(", ")}`
        )
        .join("\n")
      return `[Community #${c.index}] (${c.source}) "${c.topic}" — ${c.total_posts} posts\n${themes}`
    })
    .join("\n\n")

  return `You are a brutally honest product analyst doing a deep-dive analysis on a specific product opportunity.

## OPPORTUNITY
Title: ${opportunity.title}
Description: ${opportunity.description}
Category: ${opportunity.category}

## RELATED APP PAIN DATA (with quotes from 1-3 star reviews)
${appSection || "None."}

## RELATED COMMUNITY PAIN DATA (with quotes from HN/IH discussions)
${communitySection || "None."}

## TASK

Provide a comprehensive analysis of this opportunity:
1. **Evidence**: Cite specific quotes from the data above that prove this pain is real
2. **Score breakdown**: Score each dimension (pain, market, competition) with detailed reasoning
3. **Critique**: 3-5 reasons this opportunity might FAIL. Be brutal — I need to know the risks before I commit months of work.
4. **Open questions**: 2-4 things I need to validate in the real world before building (talk to users, check pricing, etc.)
5. **Solution angles**: 2-3 concrete approaches to building this

## OUTPUT FORMAT

Return raw JSON (no markdown fences):
{
  "evidence": [
    { "type": "app_review", "sourceIndex": 0, "quote": "exact quote from data", "relevance": "why this matters", "hasWtp": false },
    { "type": "community_post", "sourceIndex": 2, "quote": "exact quote", "relevance": "why", "hasWtp": true }
  ],
  "scoreBreakdown": {
    "pain": { "score": 85, "reasoning": "Detailed reasoning..." },
    "market": { "score": 70, "reasoning": "Detailed reasoning..." },
    "competition": { "score": 40, "reasoning": "Detailed reasoning..." },
    "wtp_bonus": 4
  },
  "critique": [
    "Detailed reason this might fail 1...",
    "Detailed reason 2...",
    "Detailed reason 3..."
  ],
  "openQuestions": [
    "Question to validate before building 1...",
    "Question 2..."
  ],
  "solutionAngles": [
    "Concrete approach 1: build X that...",
    "Approach 2: instead of X, try Y..."
  ]
}

Be specific with quotes. Be brutal with critique. This analysis determines whether I spend months building this.`
}

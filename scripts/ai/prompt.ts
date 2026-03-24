import type { AnalysisInput, AppSummaryContext, CommunitySummaryContext } from "./providers/types"

// -- Step 1 prompt is co-located in summarize-app-reviews.ts --

// -- Build sections for the analysis prompt --

function buildAppSummarySection(summaries: AppSummaryContext[]): string {
  return summaries
    .map((a) => {
      const themes = a.themes
        .map(
          (t) =>
            `    - "${t.theme}" (severity: ${t.severity}, ${t.review_count} reviews) — quotes: ${t.example_quotes.slice(0, 2).map((q) => `"${q}"`).join(", ")}`
        )
        .join("\n")
      return `[App #${a.index}] ${a.name} (${a.store}, ${a.category ?? "unknown"}) — rating: ${a.rating ?? "N/A"}, downloads: ${a.downloads ?? "N/A"}, MRR: $${a.mrr ?? "N/A"}, reviews analyzed: ${a.total_reviews}\n  Pain themes:\n${themes || "    (none)"}`
    })
    .join("\n\n")
}

function buildCommunitySummarySection(summaries: CommunitySummaryContext[]): string {
  if (!summaries || summaries.length === 0) return ""
  return summaries
    .map((c) => {
      const themes = c.themes
        .map(
          (t) =>
            `    - "${t.theme}" (severity: ${t.severity}, ${t.review_count} posts) — quotes: ${t.example_quotes.slice(0, 2).map((q) => `"${q}"`).join(", ")}`
        )
        .join("\n")
      return `[Community #${c.index}] (${c.source}) "${c.topic}" — ${c.total_posts} posts\n  Themes:\n${themes || "    (none)"}`
    })
    .join("\n\n")
}

function buildStartupSection(input: AnalysisInput): string {
  return input.startups
    .map(
      (s) =>
        `[Startup #${s.index}] ${s.name} (${s.source}) — "${s.tagline ?? ""}", upvotes: ${s.upvotes}`
    )
    .join("\n")
}

// -- Main prompt builder --

export function buildPrompt(input: AnalysisInput): string {
  const summaries = input.appSummaries ?? []
  const community = input.communitySummaries ?? []
  const appSection = buildAppSummarySection(summaries)
  const communitySection = buildCommunitySummarySection(community)
  const startupSection = buildStartupSection(input)

  return `You are a product analyst. Given aggregated pain themes from app reviews, community discussions, and startup context, identify viable product opportunities.

## INPUT DATA

### App Pain Summaries (aggregated from 1-3 star reviews)
${appSection || "No app summaries provided."}

${communitySection ? `### Community Pain Summaries (from Reddit, HN, Indie Hackers)\n${communitySection}` : ""}

### Startups (potential competitors/inspiration)
${startupSection || "No startups provided."}

## TASK

Analyze the pain themes across apps and community to identify product opportunities. For each opportunity you MUST:
1. Provide a structured evidence array citing specific sources with direct quotes
2. Score each dimension with reasoning explaining why
3. Flag evidence items that contain willingness-to-pay (WTP) signals
4. Link to specific apps and startups by their index numbers

## OUTPUT FORMAT

Return a JSON array (no markdown fences, just raw JSON):
[
  {
    "title": "Brief opportunity title",
    "description": "2-3 sentence description of the opportunity",
    "category": "Category name",
    "painSeverity": 85,
    "marketSize": 70,
    "competition": 40,
    "verdict": "strong",
    "painSummary": ["Top cross-source complaint 1", "Top complaint 2"],
    "solutionAngles": ["Solution idea 1", "Solution idea 2"],
    "reasoning": "Why this is a viable opportunity...",
    "appIndices": [0, 2],
    "startupIndices": [1],
    "evidence": [
      { "type": "app_review", "sourceIndex": 0, "quote": "47 reviews mention login failures", "relevance": "Confirms authentication is a real pain", "hasWtp": false },
      { "type": "community_post", "sourceIndex": 2, "quote": "I'd pay $50/mo for proper invoicing", "relevance": "Direct WTP signal from target user", "hasWtp": true }
    ],
    "scoreBreakdown": {
      "pain": { "score": 85, "reasoning": "12 app reviews + 8 community posts confirm widespread issue" },
      "market": { "score": 70, "reasoning": "Combined 500K downloads across affected apps" },
      "competition": { "score": 40, "reasoning": "2 startups attempting but both have poor reviews" },
      "wtp_bonus": 4
    },
    "appComments": {"0": "47 reviews mention login failures", "2": "Low rating despite high downloads"},
    "startupComments": {"1": {"comment": "Attempting similar solution", "role": "competitor"}}
  }
]

Scoring formula: pain*0.4 + market*0.35 + (100-competition)*0.25 + wtp_bonus
WTP bonus: min(10, number_of_wtp_evidence_items * 2)
Verdicts: "strong" (score>=70), "moderate" (40-69), "weak" (<40)

Return 1-5 opportunities, ranked by score descending. Only include opportunities with score >= 30.
Each evidence item MUST include a direct quote from the source data.`
}

// -- Cross-category prompt --

export function buildCrossCategoryPrompt(categoryResults: { category: string; opportunities: string[] }[]): string {
  const summary = categoryResults
    .map((cr) => {
      const opps = cr.opportunities.map((o, i) => `  ${i + 1}. ${o}`).join("\n")
      return `[${cr.category}]\n${opps}`
    })
    .join("\n\n")

  return `You are a product analyst. Given opportunities identified across multiple app categories, identify 1-3 PLATFORM-LEVEL opportunities that span multiple categories.

## PER-CATEGORY OPPORTUNITIES
${summary}

## TASK
Find cross-cutting patterns — pain points that appear in 3+ categories. These represent horizontal platform opportunities (e.g., "offline support" pain across Finance + Productivity + Health).

## OUTPUT FORMAT
Return a JSON array (no markdown fences):
[
  {
    "title": "Platform opportunity title",
    "description": "2-3 sentences about the cross-cutting opportunity",
    "category": "Cross-Category",
    "painSeverity": 80,
    "marketSize": 75,
    "competition": 30,
    "verdict": "strong",
    "painSummary": ["Pain seen in Finance, Productivity, and Health apps"],
    "solutionAngles": ["Horizontal tool that solves X across verticals"],
    "reasoning": "This pain appears in N categories because...",
    "appIndices": [],
    "startupIndices": [],
    "evidence": [],
    "scoreBreakdown": {
      "pain": { "score": 80, "reasoning": "..." },
      "market": { "score": 75, "reasoning": "..." },
      "competition": { "score": 30, "reasoning": "..." },
      "wtp_bonus": 0
    },
    "appComments": {},
    "startupComments": {}
  }
]

Return 1-3 cross-category opportunities only. Skip if no meaningful cross-cutting patterns exist.`
}

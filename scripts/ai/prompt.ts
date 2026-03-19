import type { AnalysisInput, AppSummaryContext } from "./providers/types"

// -- Step 1 prompt is co-located in summarize-app-reviews.ts --

// -- Step 2: category-level opportunity analysis from app pain summaries --

function buildSummarySection(summaries: AppSummaryContext[]): string {
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

function buildStartupSection(input: AnalysisInput): string {
  return input.startups
    .map(
      (s) =>
        `[Startup #${s.index}] ${s.name} (${s.source}) — "${s.tagline ?? ""}", upvotes: ${s.upvotes}`
    )
    .join("\n")
}

export function buildSummaryPrompt(input: AnalysisInput): string {
  const summaries = input.appSummaries ?? []
  const appSection = buildSummarySection(summaries)
  const startupSection = buildStartupSection(input)

  return `You are a product analyst. Given aggregated pain themes from app reviews and startup context, identify viable product opportunities across this category.

## INPUT DATA

### App Pain Summaries (aggregated from 1-3 star reviews)
${appSection || "No app summaries provided."}

### Startups (potential competitors/inspiration)
${startupSection || "No startups provided."}

## TASK

Analyze the pain themes across apps to identify product opportunities. For each opportunity:
1. Score pain_severity (0-100): how painful and widespread is the user problem?
2. Score market_size (0-100): market signal from downloads, MRR, review volume
3. Score competition (0-100): 0=no competition, 100=heavily saturated
4. Calculate overall score: weighted average (pain 40%, market 35%, inverse-competition 25%)
5. Assign verdict: "strong" (score≥70), "moderate" (40-69), "weak" (<40)
6. Link to specific apps and startups by their index numbers
7. For each linked app, write a brief ai_comment about why it's relevant
8. For each linked startup, write ai_comment and classify role as "competitor", "inspiration", or "related"

## OUTPUT FORMAT

Return a JSON array (no markdown fences, just raw JSON):
[
  {
    "title": "Brief opportunity title",
    "description": "2-3 sentence description of the opportunity",
    "category": "Category name",
    "score": 75,
    "painSeverity": 85,
    "marketSize": 70,
    "competition": 40,
    "verdict": "strong",
    "painSummary": ["Top cross-app complaint 1", "Top cross-app complaint 2"],
    "solutionAngles": ["Solution idea 1", "Solution idea 2"],
    "reasoning": "Why this is a viable opportunity...",
    "appIndices": [0, 2],
    "startupIndices": [1],
    "reviewIndices": [],
    "commentIndices": [],
    "appComments": {"0": "47 reviews mention login failures", "2": "Low rating despite high downloads"},
    "startupComments": {"1": {"comment": "Attempting similar solution but poor mobile UX", "role": "competitor"}}
  }
]

Return 1-5 opportunities, ranked by score descending. Only include opportunities with score >= 30.`
}

// -- Legacy Step 2 prompt using raw reviews (kept for backward compatibility) --

export function buildPrompt(input: AnalysisInput): string {
  // If app summaries are present, use the summary-based prompt
  if (input.appSummaries && input.appSummaries.length > 0) {
    return buildSummaryPrompt(input)
  }

  const appSection = input.apps
    .map(
      (a) =>
        `[App #${a.index}] ${a.name} (${a.store}, ${a.category ?? "unknown"}) — rating: ${a.rating ?? "N/A"}, downloads: ${a.downloads ?? "N/A"}, MRR: $${a.mrr ?? "N/A"}`
    )
    .join("\n")

  const startupSection = input.startups
    .map(
      (s) =>
        `[Startup #${s.index}] ${s.name} (${s.source}) — "${s.tagline ?? ""}", upvotes: ${s.upvotes}`
    )
    .join("\n")

  const reviewSection = input.reviews
    .map(
      (r) =>
        `[Review #${r.index}] (App #${r.appIndex}, ${r.rating}★) ${r.title ? r.title + ": " : ""}${r.body.slice(0, 300)}`
    )
    .join("\n")

  const commentSection = input.startupComments
    .map(
      (c) =>
        `[Comment #${c.index}] (Startup #${c.startupIndex}) ${c.author ? c.author + ": " : ""}${c.body.slice(0, 300)}`
    )
    .join("\n")

  return `You are a product analyst. Given app data, user reviews (1-3 stars = pain signals), startup competition, and startup community feedback, identify viable product opportunities.

## INPUT DATA

### Apps
${appSection || "No apps provided."}

### Startups (potential competitors/inspiration)
${startupSection || "No startups provided."}

### Reviews (1-3 star = pain signals)
${reviewSection || "No reviews provided."}

### Startup Comments (community feedback & discussion)
${commentSection || "No startup comments provided."}

## TASK

Analyze the reviews and startup comments to identify product opportunities. For each opportunity:
1. Score pain_severity (0-100): how painful is the user problem?
2. Score market_size (0-100): market signal from downloads, MRR, rating counts
3. Score competition (0-100): 0=no competition, 100=heavily saturated
4. Calculate overall score: weighted average (pain 40%, market 35%, inverse-competition 25%)
5. Assign verdict: "strong" (score≥70), "moderate" (40-69), "weak" (<40)
6. Link to specific apps, startups, and reviews by their index numbers
7. For each linked app, write a brief ai_comment about why it's relevant
8. For each linked startup, write ai_comment and classify role as "competitor", "inspiration", or "related"

## OUTPUT FORMAT

Return a JSON array (no markdown fences, just raw JSON):
[
  {
    "title": "Brief opportunity title",
    "description": "2-3 sentence description of the opportunity",
    "category": "Category name",
    "score": 75,
    "painSeverity": 85,
    "marketSize": 70,
    "competition": 40,
    "verdict": "strong",
    "painSummary": ["Top complaint 1", "Top complaint 2"],
    "solutionAngles": ["Solution idea 1", "Solution idea 2"],
    "reasoning": "Why this is a viable opportunity...",
    "appIndices": [0, 2],
    "startupIndices": [1],
    "reviewIndices": [0, 3, 7],
    "commentIndices": [0, 2],
    "appComments": {"0": "47 reviews mention this issue", "2": "Low rating despite high downloads"},
    "startupComments": {"1": {"comment": "Attempting similar solution but poor mobile UX", "role": "competitor"}}
  }
]

Return 1-5 opportunities, ranked by score descending. Only include opportunities with score >= 30.`
}

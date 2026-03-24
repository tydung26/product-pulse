import type { OpportunityResult, EvidenceItem, ScoreBreakdown } from "./providers/types"

// Extract JSON from AI response (handles markdown fences, extra text)
function extractJson(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Find JSON array — match from first [ to last ]
  const start = raw.indexOf("[")
  const end = raw.lastIndexOf("]")
  if (start !== -1 && end > start) return raw.slice(start, end + 1)

  throw new Error("No JSON array found in AI response")
}

function clamp(val: unknown, min: number, max: number): number {
  const num = typeof val === "number" ? val : 0
  return Math.min(max, Math.max(min, num))
}

const VALID_VERDICTS = ["strong", "moderate", "weak"] as const

// -- Validate evidence array --
function validateEvidence(items: unknown): EvidenceItem[] {
  if (!Array.isArray(items)) return []
  return items
    .filter((e): e is Record<string, unknown> =>
      typeof e === "object" && e !== null && typeof (e as Record<string, unknown>).quote === "string"
    )
    .map((e) => ({
      type: e.type === "community_post" ? "community_post" as const : "app_review" as const,
      sourceIndex: typeof e.sourceIndex === "number" ? e.sourceIndex : 0,
      quote: String(e.quote),
      relevance: String(e.relevance ?? ""),
      hasWtp: Boolean(e.hasWtp),
    }))
}

// -- Validate score breakdown --
function validateScoreBreakdown(sb: unknown): ScoreBreakdown | null {
  if (!sb || typeof sb !== "object") return null
  const obj = sb as Record<string, unknown>

  const parseDimension = (dim: unknown): { score: number; reasoning: string } => {
    if (!dim || typeof dim !== "object") return { score: 0, reasoning: "" }
    const d = dim as Record<string, unknown>
    return {
      score: clamp(d.score, 0, 100),
      reasoning: String(d.reasoning ?? ""),
    }
  }

  return {
    pain: parseDimension(obj.pain),
    market: parseDimension(obj.market),
    competition: parseDimension(obj.competition),
    wtp_bonus: clamp(obj.wtp_bonus, 0, 10),
  }
}

function validateItem(item: Record<string, unknown>, index: number): OpportunityResult | null {
  if (!item.title || !item.description) {
    console.warn(`Skipping opportunity #${index}: missing title or description`)
    return null
  }

  const evidence = validateEvidence(item.evidence)
  const scoreBreakdown = validateScoreBreakdown(item.scoreBreakdown)

  // Calculate WTP count from evidence
  const wtpCount = evidence.filter((e) => e.hasWtp).length

  // Calculate WTP bonus
  const WTP_BONUS_MAX = 10
  const wtpBonus = scoreBreakdown?.wtp_bonus ?? Math.min(WTP_BONUS_MAX, wtpCount * 2)

  // Calculate score from breakdown if available, otherwise from raw fields
  const painScore = scoreBreakdown?.pain.score ?? clamp(item.painSeverity, 0, 100)
  const marketScore = scoreBreakdown?.market.score ?? clamp(item.marketSize, 0, 100)
  const compScore = scoreBreakdown?.competition.score ?? clamp(item.competition, 0, 100)
  const score = Math.min(100, Math.round(
    painScore * 0.4 + marketScore * 0.35 + (100 - compScore) * 0.25 + wtpBonus
  ))

  if (score < 30) {
    console.warn(`Skipping "${item.title}": score ${score} below threshold`)
    return null
  }

  const verdict = VALID_VERDICTS.includes(item.verdict as typeof VALID_VERDICTS[number])
    ? (item.verdict as OpportunityResult["verdict"])
    : score >= 70
      ? "strong"
      : score >= 40
        ? "moderate"
        : "weak"

  // Build source distribution from evidence
  const sourceDistribution: Record<string, number> = {}
  for (const e of evidence) {
    sourceDistribution[e.type] = (sourceDistribution[e.type] ?? 0) + 1
  }

  return {
    title: String(item.title),
    description: String(item.description),
    category: String(item.category ?? "General"),
    score,
    painSeverity: painScore,
    marketSize: marketScore,
    competition: compScore,
    verdict,
    painSummary: Array.isArray(item.painSummary) ? item.painSummary.map(String) : [],
    solutionAngles: Array.isArray(item.solutionAngles) ? item.solutionAngles.map(String) : [],
    reasoning: String(item.reasoning ?? ""),
    appIndices: Array.isArray(item.appIndices) ? item.appIndices : [],
    startupIndices: Array.isArray(item.startupIndices) ? item.startupIndices : [],
    evidence,
    scoreBreakdown: scoreBreakdown ?? {
      pain: { score: painScore, reasoning: "" },
      market: { score: marketScore, reasoning: "" },
      competition: { score: compScore, reasoning: "" },
      wtp_bonus: wtpBonus,
    },
    wtpCount,
    sourceDistribution,
    // Legacy fields
    reviewIndices: Array.isArray(item.reviewIndices) ? item.reviewIndices : [],
    commentIndices: Array.isArray(item.commentIndices) ? item.commentIndices : [],
    appComments: (item.appComments as Record<number, string>) ?? {},
    startupComments:
      (item.startupComments as Record<number, { comment: string; role: string }>) ?? {},
  }
}

export function parseAndValidate(raw: string): OpportunityResult[] {
  const jsonStr = extractJson(raw)
  const parsed = JSON.parse(jsonStr)

  if (!Array.isArray(parsed)) {
    throw new Error("AI response is not a JSON array")
  }

  const results: OpportunityResult[] = []
  for (let i = 0; i < parsed.length; i++) {
    const validated = validateItem(parsed[i], i)
    if (validated) results.push(validated)
  }

  // Sort by score descending
  results.sort((a, b) => b.score - a.score)

  return results
}

import type { OpportunityResult } from "./providers/types"

// Extract JSON from AI response (handles markdown fences, extra text)
function extractJson(raw: string): string {
  // Try to find JSON array in the response
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (fenceMatch) return fenceMatch[1].trim()

  // Find JSON array — match from first [ to last ] using balanced bracket search
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

function validateItem(item: Record<string, unknown>, index: number): OpportunityResult | null {
  if (!item.title || !item.description) {
    console.warn(`Skipping opportunity #${index}: missing title or description`)
    return null
  }

  const score = clamp(item.score, 0, 100)
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

  return {
    title: String(item.title),
    description: String(item.description),
    category: String(item.category ?? "General"),
    score,
    painSeverity: clamp(item.painSeverity, 0, 100),
    marketSize: clamp(item.marketSize, 0, 100),
    competition: clamp(item.competition, 0, 100),
    verdict,
    painSummary: Array.isArray(item.painSummary) ? item.painSummary.map(String) : [],
    solutionAngles: Array.isArray(item.solutionAngles) ? item.solutionAngles.map(String) : [],
    reasoning: String(item.reasoning ?? ""),
    appIndices: Array.isArray(item.appIndices) ? item.appIndices : [],
    startupIndices: Array.isArray(item.startupIndices) ? item.startupIndices : [],
    reviewIndices: Array.isArray(item.reviewIndices) ? item.reviewIndices : [],
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

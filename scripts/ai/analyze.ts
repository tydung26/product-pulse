import "dotenv/config"
import { supabaseAdmin } from "../crawlers/lib/supabase-admin"
import {
  createLogger,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
} from "../crawlers/lib/crawler-utils"
import { buildRankingPrompt } from "./prompt"
import { parseAndValidate } from "./parse-ai-response"
import type { AppSummaryContext, CommunitySummaryContext } from "./providers/types"
import type { AppPainSummary, App, CommunityPainSummary } from "@/lib/types/database"

const logger = createLogger("analyze")

// -- Data fetching: top N by signal strength --

async function getTopAppSummaries(limit = 30): Promise<(AppPainSummary & { app: App })[]> {
  // Fetch all, then sort by max theme severity × total_reviews client-side
  const PAGE_SIZE = 1000
  const results: (AppPainSummary & { app: App })[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("app_pain_summaries")
      .select("*, app:apps(*)")
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch pain summaries: ${error.message}`)
    results.push(...(data as (AppPainSummary & { app: App })[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // Sort by max theme severity × total_reviews (strongest signal first)
  results.sort((a, b) => {
    const aScore = Math.max(...a.themes.map((t) => t.severity), 0) * a.total_reviews
    const bScore = Math.max(...b.themes.map((t) => t.severity), 0) * b.total_reviews
    return bScore - aScore
  })

  return results.slice(0, limit)
}

async function getTopCommunitySummaries(limit = 30): Promise<CommunityPainSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("community_pain_summaries")
    .select("*")
    .order("total_posts", { ascending: false })
    .limit(limit)

  if (error) throw new Error(`Failed to fetch community summaries: ${error.message}`)
  return (data ?? []) as CommunityPainSummary[]
}

// -- Build contexts for prompt --

function buildContexts(
  appSummaries: (AppPainSummary & { app: App })[],
  communitySummaries: CommunityPainSummary[],
): { appContexts: AppSummaryContext[]; communityContexts: CommunitySummaryContext[] } {
  const appContexts: AppSummaryContext[] = appSummaries.map((s, i) => ({
    index: i,
    id: s.app.id,
    name: s.app.name,
    category: s.app.category,
    mrr: s.app.estimated_mrr,
    downloads: s.app.downloads,
    rating: s.app.avg_rating,
    store: s.app.store,
    themes: s.themes,
    total_reviews: s.total_reviews,
  }))

  const communityContexts: CommunitySummaryContext[] = communitySummaries.map((c, i) => ({
    index: i,
    id: c.id,
    source: c.source,
    topic: c.topic,
    themes: c.themes,
    total_posts: c.total_posts,
  }))

  return { appContexts, communityContexts }
}

// -- Save opportunities --

async function saveOpportunity(result: Record<string, unknown>): Promise<void> {
  const title = String(result.title ?? "")
  const category = String(result.category ?? "General")

  // Dedup check
  const { data: existing } = await supabaseAdmin
    .from("opportunities")
    .select("id")
    .eq("title", title)
    .eq("category", category)
    .limit(1)

  if (existing && existing.length > 0) {
    logger.info(`Skipping duplicate: "${title}"`)
    return
  }

  const score = typeof result.score === "number" ? result.score : Math.round(
    (Number(result.painSeverity) || 0) * 0.4 +
    (Number(result.marketSize) || 0) * 0.35 +
    (100 - (Number(result.competition) || 0)) * 0.25
  )

  const verdict = score >= 70 ? "strong" : score >= 40 ? "moderate" : "weak"

  const { error } = await supabaseAdmin
    .from("opportunities")
    .insert({
      title,
      description: String(result.description ?? ""),
      category,
      score,
      pain_severity: Number(result.painSeverity) || 0,
      market_size: Number(result.marketSize) || 0,
      competition: Number(result.competition) || 0,
      verdict: String(result.verdict ?? verdict),
      pain_summary: Array.isArray(result.painSummary) ? result.painSummary : [],
      solution_angles: Array.isArray(result.solutionAngles) ? result.solutionAngles : [],
      ai_reasoning: {
        reasoning: String(result.reasoning ?? ""),
        critique: Array.isArray(result.critique) ? result.critique : [],
        openQuestions: Array.isArray(result.openQuestions) ? result.openQuestions : [],
        hasWtpSignals: Boolean(result.hasWtpSignals),
        appIndices: result.appIndices ?? [],
        communityIndices: result.communityIndices ?? [],
      },
    })

  if (error) throw new Error(`Failed to insert opportunity: ${error.message}`)
}

// -- AI call --

async function callAI(prompt: string): Promise<string> {
  // Auto-select: SDK if API key present, CLI fallback
  if (process.env.ANTHROPIC_API_KEY) {
    const Anthropic = (await import("@anthropic-ai/sdk")).default
    const client = new Anthropic()
    const response = await client.messages.create({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      messages: [{ role: "user", content: prompt }],
    })
    return response.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
  }

  // CLI fallback
  const { spawnSync } = await import("child_process")
  const result = spawnSync("claude", ["--print"], {
    input: prompt,
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
    timeout: 300_000,
  })

  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`Claude CLI exited ${result.status}: ${result.stderr}`)
  return result.stdout
}

// -- Main --

async function main() {
  logger.info("Starting Stage 1: Opportunity Ranking")
  const jobId = await startCrawlJob("analyze")

  try {
    const appSummaries = await getTopAppSummaries(30)
    const communitySummaries = await getTopCommunitySummaries(30)

    if (appSummaries.length === 0 && communitySummaries.length === 0) {
      logger.info("No pain summaries found. Run summarize scripts first.")
      await completeCrawlJob(jobId, { found: 0, inserted: 0, updated: 0 })
      return
    }

    logger.info(`Input: ${appSummaries.length} app summaries, ${communitySummaries.length} community clusters`)

    const { appContexts, communityContexts } = buildContexts(appSummaries, communitySummaries)
    const prompt = buildRankingPrompt(appContexts, communityContexts)

    logger.info(`Prompt size: ~${Math.round(prompt.length / 4)} tokens. Calling AI...`)

    const raw = await callAI(prompt)

    // Parse — use simple JSON extraction since ranking output is simpler
    const jsonMatch = raw.match(/\[[\s\S]*\]/)
    if (!jsonMatch) throw new Error("No JSON array in AI response")

    const parsed = JSON.parse(jsonMatch[0])
    if (!Array.isArray(parsed)) throw new Error("AI response is not an array")

    logger.info(`AI returned ${parsed.length} opportunities`)

    let saved = 0
    for (const opp of parsed) {
      try {
        await saveOpportunity(opp)
        saved++
        logger.info(`Saved: "${opp.title}" (score: ${opp.painSeverity ? Math.round(opp.painSeverity * 0.4 + opp.marketSize * 0.35 + (100 - opp.competition) * 0.25) : "?"}, verdict: ${opp.verdict})`)
      } catch (err: unknown) {
        logger.warn(`Failed to save "${opp.title}": ${(err as Error).message}`)
      }
    }

    await completeCrawlJob(jobId, { found: appSummaries.length + communitySummaries.length, inserted: saved, updated: 0 })
    logger.info(`Done. Opportunities saved: ${saved}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Analysis failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

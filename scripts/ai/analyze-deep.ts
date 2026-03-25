import "dotenv/config"
import { supabaseAdmin } from "../crawlers/lib/supabase-admin"
import { createLogger } from "../crawlers/lib/crawler-utils"
import { buildDeepDivePrompt } from "./prompt"
import type { AppSummaryContext, CommunitySummaryContext } from "./providers/types"
import type { AppPainSummary, App, CommunityPainSummary, Opportunity } from "@/lib/types/database"

const logger = createLogger("analyze-deep")

// -- Fetch opportunity --

async function getOpportunity(id: string): Promise<Opportunity> {
  const { data, error } = await supabaseAdmin
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .single()

  if (error || !data) throw new Error(`Opportunity not found: ${id}`)
  return data as Opportunity
}

// -- Fetch related summaries by keyword matching --

async function getRelatedAppSummaries(opportunity: Opportunity): Promise<(AppPainSummary & { app: App })[]> {
  // Fetch summaries matching the opportunity's category or pain keywords
  const PAGE_SIZE = 1000
  const results: (AppPainSummary & { app: App })[] = []
  let offset = 0

  while (true) {
    let query = supabaseAdmin
      .from("app_pain_summaries")
      .select("*, app:apps(*)")

    // Filter by category if available
    if (opportunity.category) {
      query = query.eq("app.category", opportunity.category)
    }

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1)
    if (error) break // Silently fall back to unfiltered
    results.push(...(data as (AppPainSummary & { app: App })[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  // If category filter returned nothing, fetch top by severity
  if (results.length === 0) {
    const { data } = await supabaseAdmin
      .from("app_pain_summaries")
      .select("*, app:apps(*)")
      .limit(20)

    if (data) results.push(...(data as (AppPainSummary & { app: App })[]))
  }

  return results.slice(0, 20)
}

async function getRelatedCommunitySummaries(opportunity: Opportunity): Promise<CommunityPainSummary[]> {
  // Get community indices from ai_reasoning if available
  const aiReasoning = opportunity.ai_reasoning as Record<string, unknown> | null
  const communityIndices = (aiReasoning?.communityIndices ?? []) as number[]

  // Fetch top community summaries — keyword match would be ideal but
  // for now just fetch by post count (the AI tagged indices in Stage 1)
  const { data, error } = await supabaseAdmin
    .from("community_pain_summaries")
    .select("*")
    .order("total_posts", { ascending: false })
    .limit(20)

  if (error) throw new Error(`Failed to fetch community summaries: ${error.message}`)

  // If we have indices from Stage 1, prioritize those
  const summaries = (data ?? []) as CommunityPainSummary[]
  if (communityIndices.length > 0) {
    // Reorder: indexed ones first, then rest
    const indexed = communityIndices
      .filter((i) => i < summaries.length)
      .map((i) => summaries[i])
    const rest = summaries.filter((_, i) => !communityIndices.includes(i))
    return [...indexed, ...rest].slice(0, 20)
  }

  return summaries
}

// -- AI call (same as analyze.ts) --

async function callAI(prompt: string): Promise<string> {
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
  const id = process.argv[2]
  if (!id) {
    console.error("Usage: pnpm analyze:deep <opportunity-id>")
    console.error("  Get IDs from: pnpm dev → /opportunities page")
    process.exit(1)
  }

  logger.info(`Stage 2: Deep dive on opportunity ${id}`)

  const opportunity = await getOpportunity(id)
  logger.info(`Opportunity: "${opportunity.title}" [${opportunity.category}]`)

  const appSummaries = await getRelatedAppSummaries(opportunity)
  const communitySummaries = await getRelatedCommunitySummaries(opportunity)

  logger.info(`Related data: ${appSummaries.length} app summaries, ${communitySummaries.length} community clusters`)

  // Build contexts
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

  const prompt = buildDeepDivePrompt(
    { title: opportunity.title, description: opportunity.description, category: opportunity.category ?? "" },
    appContexts,
    communityContexts,
  )

  logger.info(`Prompt size: ~${Math.round(prompt.length / 4)} tokens. Calling AI...`)

  const raw = await callAI(prompt)

  // Parse the deep dive response (single JSON object)
  const jsonMatch = raw.match(/\{[\s\S]*\}/)
  if (!jsonMatch) throw new Error("No JSON object in AI response")

  const analysis = JSON.parse(jsonMatch[0])

  // Update the opportunity with deep dive results
  const { error } = await supabaseAdmin
    .from("opportunities")
    .update({
      evidence_summary: { evidence: analysis.evidence ?? [] },
      score_breakdown: analysis.scoreBreakdown ?? {},
      wtp_count: (analysis.evidence ?? []).filter((e: { hasWtp?: boolean }) => e.hasWtp).length,
      ai_reasoning: {
        ...(opportunity.ai_reasoning as Record<string, unknown> ?? {}),
        deepDive: true,
        critique: analysis.critique ?? [],
        openQuestions: analysis.openQuestions ?? [],
        solutionAngles: analysis.solutionAngles ?? [],
      },
      // Recalculate score from breakdown if provided
      ...(analysis.scoreBreakdown ? {
        pain_severity: analysis.scoreBreakdown.pain?.score ?? opportunity.pain_severity,
        market_size: analysis.scoreBreakdown.market?.score ?? opportunity.market_size,
        competition: analysis.scoreBreakdown.competition?.score ?? opportunity.competition,
        score: Math.min(100, Math.round(
          (analysis.scoreBreakdown.pain?.score ?? 0) * 0.4 +
          (analysis.scoreBreakdown.market?.score ?? 0) * 0.35 +
          (100 - (analysis.scoreBreakdown.competition?.score ?? 0)) * 0.25 +
          (analysis.scoreBreakdown.wtp_bonus ?? 0)
        )),
      } : {}),
    })
    .eq("id", id)

  if (error) throw new Error(`Failed to update opportunity: ${error.message}`)

  logger.info(`Deep dive complete for "${opportunity.title}"`)
  logger.info(`Evidence items: ${(analysis.evidence ?? []).length}`)
  logger.info(`Critique points: ${(analysis.critique ?? []).length}`)
  logger.info(`Open questions: ${(analysis.openQuestions ?? []).length}`)
}

main()

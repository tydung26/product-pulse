import "dotenv/config"
import { supabaseAdmin } from "../crawlers/lib/supabase-admin"
import {
  createLogger,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
} from "../crawlers/lib/crawler-utils"
import type { AIProvider, AnalysisInput, OpportunityResult, AppSummaryContext, StartupContext } from "./providers/types"
import type { AppPainSummary, App, Startup, StartupComment } from "@/lib/types/database"

const logger = createLogger("analyze")

// -- Data fetching --

async function getLastAnalyzeTime(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("crawl_jobs")
    .select("completed_at")
    .eq("job_type", "analyze")
    .eq("status", "completed")
    .order("completed_at", { ascending: false })
    .limit(1)
  return data?.[0]?.completed_at ?? null
}

async function getAllPainSummaries(since?: string | null): Promise<(AppPainSummary & { app: App })[]> {
  const PAGE_SIZE = 1000
  const results: (AppPainSummary & { app: App })[] = []
  let offset = 0

  while (true) {
    let query = supabaseAdmin
      .from("app_pain_summaries")
      .select("*, app:apps(*)")

    // Incremental: only fetch summaries updated after last analyze run
    if (since) {
      query = query.or(`created_at.gt.${since},updated_at.gt.${since}`)
    }

    const { data, error } = await query.range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch pain summaries: ${error.message}`)
    results.push(...(data as (AppPainSummary & { app: App })[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return results
}

async function getAllStartups(): Promise<Startup[]> {
  const { data, error } = await supabaseAdmin
    .from("startups")
    .select("*")
    .order("upvotes", { ascending: false })
    .limit(100)

  if (error) throw new Error(`Failed to fetch startups: ${error.message}`)
  return (data ?? []) as Startup[]
}

async function getUnprocessedStartupComments(): Promise<StartupComment[]> {
  const { data, error } = await supabaseAdmin
    .from("startup_comments")
    .select("*")
    .eq("is_processed", false)
    .order("created_at", { ascending: true })

  if (error) throw new Error(`Failed to fetch startup comments: ${error.message}`)
  return (data ?? []) as StartupComment[]
}

// -- Build analysis input from summaries --

function buildInputFromSummaries(
  summaries: (AppPainSummary & { app: App })[],
  startups: Startup[],
): AnalysisInput {
  const startupIdToIndex = new Map<string, number>()

  const startupContexts: StartupContext[] = startups.map((s, i) => {
    startupIdToIndex.set(s.id, i)
    return { index: i, id: s.id, name: s.name, tagline: s.tagline, upvotes: s.upvotes, source: s.source }
  })

  const appSummaries: AppSummaryContext[] = summaries.map((s, i) => ({
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

  return {
    apps: appSummaries.map((a) => ({
      index: a.index, id: a.id, name: a.name, category: a.category,
      mrr: a.mrr, downloads: a.downloads, rating: a.rating, store: a.store,
    })),
    startups: startupContexts,
    reviews: [],
    startupComments: [],
    appSummaries,
  }
}

// -- Save results to DB --

async function saveOpportunity(result: OpportunityResult, input: AnalysisInput): Promise<void> {
  // Dedup check: skip if opportunity with same title + category already exists
  const { data: existing } = await supabaseAdmin
    .from("opportunities")
    .select("id")
    .eq("title", result.title)
    .eq("category", result.category)
    .limit(1)

  if (existing && existing.length > 0) {
    logger.info(`Skipping duplicate: "${result.title}" [${result.category}]`)
    return
  }

  const { data: opp, error } = await supabaseAdmin
    .from("opportunities")
    .insert({
      title: result.title,
      description: result.description,
      category: result.category,
      score: result.score,
      pain_severity: result.painSeverity,
      market_size: result.marketSize,
      competition: result.competition,
      verdict: result.verdict,
      pain_summary: result.painSummary,
      solution_angles: result.solutionAngles,
      ai_reasoning: { reasoning: result.reasoning },
    })
    .select("id")
    .single()

  if (error) throw new Error(`Failed to insert opportunity: ${error.message}`)
  const oppId = opp.id

  for (const appIdx of result.appIndices) {
    const app = input.apps[appIdx]
    if (!app) continue
    await supabaseAdmin.from("opportunity_apps").insert({
      opportunity_id: oppId,
      app_id: app.id,
      ai_comment: result.appComments[appIdx] ?? null,
    })
  }

  for (const startupIdx of result.startupIndices) {
    const startup = input.startups[startupIdx]
    if (!startup) continue
    const sc = result.startupComments[startupIdx]
    await supabaseAdmin.from("opportunity_startups").insert({
      opportunity_id: oppId,
      startup_id: startup.id,
      ai_comment: sc?.comment ?? null,
      role: sc?.role ?? "related",
    })
  }
}

async function markCommentsProcessed(commentIds: string[]): Promise<void> {
  if (commentIds.length === 0) return
  const { error } = await supabaseAdmin
    .from("startup_comments")
    .update({ is_processed: true })
    .in("id", commentIds)

  if (error) logger.warn(`Failed to mark comments processed: ${error.message}`)
}

// -- Retry wrapper --

async function analyzeWithRetry(
  provider: AIProvider,
  input: AnalysisInput,
  maxRetries = 2
): Promise<OpportunityResult[]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await provider.analyze(input)
    } catch (err: unknown) {
      if (attempt === maxRetries) throw err
      const delay = 1000 * Math.pow(2, attempt)
      logger.warn(`AI call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${(err as Error).message}`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  return []
}

// -- Main --

async function main() {
  const args = process.argv.slice(2)
  const fullRun = args.includes("--full")
  const forceCli = args.includes("--cli")

  // Parse --concurrency flag (default 3 for category analysis)
  const concIdx = args.indexOf("--concurrency")
  const CONCURRENCY = concIdx !== -1 ? parseInt(args[concIdx + 1], 10) : 3

  // Provider auto-selection: SDK when API key present, CLI as fallback
  let provider: AIProvider
  if (!forceCli && process.env.ANTHROPIC_API_KEY) {
    const { AnthropicSDKProvider } = await import("./providers/anthropic-sdk")
    provider = new AnthropicSDKProvider()
    logger.info("Using Anthropic SDK provider")
  } else {
    const { ClaudeCLIProvider } = await import("./providers/claude-cli")
    provider = new ClaudeCLIProvider()
    logger.info("Using Claude CLI provider (fallback)")
  }

  const jobId = await startCrawlJob("analyze")

  try {
    // Incremental: only analyze categories with changed summaries since last run
    let since: string | null = null
    if (!fullRun) {
      since = await getLastAnalyzeTime()
      if (since) {
        logger.info(`Incremental mode: only categories changed since ${since}`)
      }
    } else {
      logger.info("Full mode: analyzing all categories")
    }

    const summaries = await getAllPainSummaries(since)
    const startups = await getAllStartups()
    const comments = await getUnprocessedStartupComments()

    if (summaries.length === 0) {
      const msg = since
        ? "No changed pain summaries since last run. Use --full to force."
        : "No app pain summaries found. Run `pnpm summarize` first."
      logger.info(msg)
      await completeCrawlJob(jobId, { found: 0, inserted: 0, updated: 0 })
      return
    }

    logger.info(`Data: ${summaries.length} app summaries, ${startups.length} startups, ${comments.length} comments`)

    // Group summaries by category
    const byCategory = new Map<string, (AppPainSummary & { app: App })[]>()
    for (const s of summaries) {
      const cat = s.app.category ?? "Uncategorized"
      const list = byCategory.get(cat) ?? []
      list.push(s)
      byCategory.set(cat, list)
    }

    const categories = [...byCategory.keys()].sort()
    logger.info(`Analyzing ${categories.length} categories (concurrency: ${CONCURRENCY})`)

    let totalOpps = 0

    // Worker pool for parallel category analysis
    const queue = [...categories]

    async function analyzeCategory(category: string): Promise<number> {
      const categorySummaries = byCategory.get(category)!
      logger.info(`[${category}] ${categorySummaries.length} apps`)

      const input = buildInputFromSummaries(categorySummaries, startups)
      const results = await analyzeWithRetry(provider, input)
      logger.info(`[${category}] AI returned ${results.length} opportunities`)

      let saved = 0
      for (const result of results) {
        try {
          await saveOpportunity(result, input)
          saved++
          logger.info(`Saved: "${result.title}" (score: ${result.score}, verdict: ${result.verdict})`)
        } catch (err: unknown) {
          logger.warn(`Failed to save "${result.title}": ${(err as Error).message}`)
        }
      }
      return saved
    }

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const category = queue.shift()!
        try {
          totalOpps += await analyzeCategory(category)
        } catch (err: unknown) {
          logger.warn(`[${category}] AI call failed, skipping: ${(err as Error).message}`)
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    if (comments.length > 0) {
      await markCommentsProcessed(comments.map((c) => c.id))
    }

    await completeCrawlJob(jobId, { found: summaries.length, inserted: totalOpps, updated: 0 })
    logger.info(`Done. Categories: ${categories.length}, Opportunities: ${totalOpps}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Analysis failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

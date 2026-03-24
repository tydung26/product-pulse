import "dotenv/config"
import { supabaseAdmin } from "../crawlers/lib/supabase-admin"
import {
  createLogger,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
} from "../crawlers/lib/crawler-utils"
import { buildCrossCategoryPrompt } from "./prompt"
import type { AIProvider, AnalysisInput, OpportunityResult, AppSummaryContext, CommunitySummaryContext, StartupContext } from "./providers/types"
import type { AppPainSummary, App, Startup, CommunityPainSummary } from "@/lib/types/database"

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

async function getAllCommunitySummaries(): Promise<CommunityPainSummary[]> {
  const { data, error } = await supabaseAdmin
    .from("community_pain_summaries")
    .select("*")
    .order("total_posts", { ascending: false })
    .limit(50) // Cap to stay within token budget

  if (error) throw new Error(`Failed to fetch community summaries: ${error.message}`)
  return (data ?? []) as CommunityPainSummary[]
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

// -- Build analysis input --

function buildInputFromSummaries(
  summaries: (AppPainSummary & { app: App })[],
  startups: Startup[],
  communitySummaries: CommunityPainSummary[],
): AnalysisInput {
  const startupContexts: StartupContext[] = startups.map((s, i) => ({
    index: i, id: s.id, name: s.name, tagline: s.tagline, upvotes: s.upvotes, source: s.source,
  }))

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

  const communityContexts: CommunitySummaryContext[] = communitySummaries.map((c, i) => ({
    index: i,
    id: c.id,
    source: c.source,
    topic: c.topic,
    themes: c.themes,
    total_posts: c.total_posts,
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
    communitySummaries: communityContexts,
  }
}

// -- Save results to DB --

async function saveOpportunity(result: OpportunityResult, input: AnalysisInput): Promise<void> {
  // Dedup check
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
      evidence_summary: { evidence: result.evidence },
      wtp_count: result.wtpCount,
      source_count: result.sourceDistribution,
      score_breakdown: result.scoreBreakdown ?? {},
    })
    .select("id")
    .single()

  if (error) throw new Error(`Failed to insert opportunity: ${error.message}`)
  const oppId = opp.id

  // Link to apps
  for (const appIdx of result.appIndices) {
    const app = input.apps[appIdx]
    if (!app) continue
    await supabaseAdmin.from("opportunity_apps").insert({
      opportunity_id: oppId,
      app_id: app.id,
      ai_comment: result.appComments[appIdx] ?? null,
    })
  }

  // Link to startups
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

  // Save evidence to junction tables
  for (const ev of result.evidence) {
    if (ev.type === "community_post") {
      const cs = input.communitySummaries?.[ev.sourceIndex]
      if (!cs) continue
      // Link opportunity to the community summary's source post via ID
      await supabaseAdmin.from("opportunity_community_posts").insert({
        opportunity_id: oppId,
        community_post_id: cs.id,
        quote: ev.quote,
        relevance: ev.relevance,
      }).then(({ error: e }) => {
        if (e) logger.warn(`Failed to link community evidence: ${e.message}`)
      })
    }
    // app_review evidence is captured via opportunity_apps + appComments
  }
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
  const crossCategory = args.includes("--cross-category")

  const concIdx = args.indexOf("--concurrency")
  const CONCURRENCY = concIdx !== -1 ? parseInt(args[concIdx + 1], 10) : 3

  // Provider auto-selection
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
    // Incremental mode
    let since: string | null = null
    if (!fullRun) {
      since = await getLastAnalyzeTime()
      if (since) logger.info(`Incremental mode: since ${since}`)
    } else {
      logger.info("Full mode: analyzing all categories")
    }

    const summaries = await getAllPainSummaries(since)
    const communitySummaries = await getAllCommunitySummaries()
    const startups = await getAllStartups()

    if (summaries.length === 0 && communitySummaries.length === 0) {
      const msg = since
        ? "No changed summaries since last run. Use --full to force."
        : "No pain summaries found. Run summarize scripts first."
      logger.info(msg)
      await completeCrawlJob(jobId, { found: 0, inserted: 0, updated: 0 })
      return
    }

    logger.info(`Data: ${summaries.length} app summaries, ${communitySummaries.length} community summaries, ${startups.length} startups`)

    // Group app summaries by category
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
    const categoryResults: { category: string; opportunities: string[] }[] = []

    // Worker pool for parallel category analysis
    const queue = [...categories]

    async function analyzeCategory(category: string): Promise<number> {
      const categorySummaries = byCategory.get(category)!
      logger.info(`[${category}] ${categorySummaries.length} apps`)

      const input = buildInputFromSummaries(categorySummaries, startups, communitySummaries)
      const results = await analyzeWithRetry(provider, input)
      logger.info(`[${category}] AI returned ${results.length} opportunities`)

      // Collect for cross-category pass
      categoryResults.push({
        category,
        opportunities: results.map((r) => `${r.title} (score: ${r.score}, WTP: ${r.wtpCount})`),
      })

      let saved = 0
      for (const result of results) {
        try {
          await saveOpportunity(result, input)
          saved++
          logger.info(`Saved: "${result.title}" (score: ${result.score}, verdict: ${result.verdict}, evidence: ${result.evidence.length}, WTP: ${result.wtpCount})`)
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

    // Cross-category final pass
    if (crossCategory && categoryResults.length >= 2) {
      logger.info("Running cross-category analysis...")
      try {
        const crossInput: AnalysisInput = {
          apps: [], startups: [], reviews: [], startupComments: [],
          appSummaries: [], communitySummaries: [],
        }
        // Use cross-category prompt via a temporary provider call
        const crossPrompt = buildCrossCategoryPrompt(categoryResults)
        // Feed the prompt through the provider's analyze method by constructing a minimal input
        // The cross-category prompt is self-contained, so we pass it as appSummaries context
        const crossResults = await analyzeWithRetry(provider, {
          ...crossInput,
          appSummaries: [{ index: 0, id: "", name: crossPrompt, category: "Cross-Category", mrr: null, downloads: null, rating: null, store: "", themes: [], total_reviews: 0 }],
        })

        for (const result of crossResults) {
          try {
            result.category = "Cross-Category"
            await saveOpportunity(result, crossInput)
            totalOpps++
            logger.info(`Cross-category: "${result.title}" (score: ${result.score})`)
          } catch (err: unknown) {
            logger.warn(`Failed to save cross-category "${result.title}": ${(err as Error).message}`)
          }
        }
      } catch (err: unknown) {
        logger.warn(`Cross-category analysis failed: ${(err as Error).message}`)
      }
    }

    await completeCrawlJob(jobId, { found: summaries.length + communitySummaries.length, inserted: totalOpps, updated: 0 })
    logger.info(`Done. Categories: ${categories.length}, Opportunities: ${totalOpps}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Analysis failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

import "dotenv/config"
import { supabaseAdmin } from "../crawlers/lib/supabase-admin"
import {
  createLogger,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
} from "../crawlers/lib/crawler-utils"
import type { AIProvider, AnalysisInput, OpportunityResult, AppContext, StartupContext, ReviewContext } from "./providers/types"
import type { App, StoreReview, Startup } from "@/lib/types/database"

const logger = createLogger("analyze")
const MAX_REVIEWS_PER_BATCH = 50

// -- Data gathering --

async function getUnprocessedReviews(): Promise<StoreReview[]> {
  const { data, error } = await supabaseAdmin
    .from("store_reviews")
    .select("*")
    .eq("is_processed", false)
    .order("created_at", { ascending: true })

  if (error) throw new Error(`Failed to fetch reviews: ${error.message}`)
  return (data ?? []) as StoreReview[]
}

async function getAppsByIds(ids: string[]): Promise<App[]> {
  if (ids.length === 0) return []
  const { data, error } = await supabaseAdmin
    .from("apps")
    .select("*")
    .in("id", ids)

  if (error) throw new Error(`Failed to fetch apps: ${error.message}`)
  return (data ?? []) as App[]
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

function buildInput(
  apps: App[],
  startups: Startup[],
  reviews: StoreReview[]
): AnalysisInput {
  const appContexts: AppContext[] = apps.map((a, i) => ({
    index: i,
    id: a.id,
    name: a.name,
    category: a.category,
    mrr: a.estimated_mrr,
    downloads: a.downloads,
    rating: a.avg_rating,
    store: a.store,
  }))

  const appIdToIndex = new Map(apps.map((a, i) => [a.id, i]))

  const startupContexts: StartupContext[] = startups.map((s, i) => ({
    index: i,
    id: s.id,
    name: s.name,
    tagline: s.tagline,
    upvotes: s.upvotes,
    source: s.source,
  }))

  const reviewContexts: ReviewContext[] = reviews.map((r, i) => ({
    index: i,
    id: r.id,
    appIndex: appIdToIndex.get(r.app_id) ?? -1,
    body: r.body,
    rating: r.rating,
    title: r.title,
  }))

  return { apps: appContexts, startups: startupContexts, reviews: reviewContexts }
}

// -- Save results to DB --

async function saveOpportunity(
  result: OpportunityResult,
  input: AnalysisInput
): Promise<void> {
  // Insert opportunity
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

  // Insert opportunity_apps
  for (const appIdx of result.appIndices) {
    const app = input.apps[appIdx]
    if (!app) continue
    await supabaseAdmin.from("opportunity_apps").insert({
      opportunity_id: oppId,
      app_id: app.id,
      ai_comment: result.appComments[appIdx] ?? null,
    })
  }

  // Insert opportunity_startups
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

  // Insert opportunity_reviews
  for (const reviewIdx of result.reviewIndices) {
    const review = input.reviews[reviewIdx]
    if (!review) continue
    await supabaseAdmin.from("opportunity_reviews").insert({
      opportunity_id: oppId,
      review_id: review.id,
    })
  }
}

async function markReviewsProcessed(reviewIds: string[]): Promise<void> {
  if (reviewIds.length === 0) return
  const { error } = await supabaseAdmin
    .from("store_reviews")
    .update({ is_processed: true })
    .in("id", reviewIds)

  if (error) logger.warn(`Failed to mark reviews processed: ${error.message}`)
}

// -- Retry wrapper for transient AI failures --

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
      const delay = 1000 * Math.pow(2, attempt) // 1s, 2s backoff
      logger.warn(`AI call failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying in ${delay}ms: ${(err as Error).message}`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }
  return [] // unreachable but satisfies TS
}

// -- Main --

async function main() {
  // Parse CLI args
  const args = process.argv.slice(2)
  const useApi = args.includes("--api")
  const providerName = useApi ? "anthropic-sdk" : "claude-cli"

  logger.info(`Starting analysis with provider: ${providerName}`)

  // Dynamic import of provider
  let provider: AIProvider
  if (useApi) {
    const { AnthropicSDKProvider } = await import("./providers/anthropic-sdk")
    provider = new AnthropicSDKProvider()
  } else {
    const { ClaudeCLIProvider } = await import("./providers/claude-cli")
    provider = new ClaudeCLIProvider()
  }

  const jobId = await startCrawlJob("analyze")

  try {
    // Gather data
    const reviews = await getUnprocessedReviews()
    if (reviews.length === 0) {
      logger.info("No unprocessed reviews found. Nothing to analyze.")
      await completeCrawlJob(jobId, { found: 0, inserted: 0, updated: 0 })
      return
    }

    const appIds = [...new Set(reviews.map((r) => r.app_id))]
    const apps = await getAppsByIds(appIds)
    const startups = await getAllStartups()

    logger.info(`Data: ${reviews.length} reviews, ${apps.length} apps, ${startups.length} startups`)

    // Batch reviews (max 50 per AI call)
    let totalOpps = 0
    const allReviewIds: string[] = []

    for (let i = 0; i < reviews.length; i += MAX_REVIEWS_PER_BATCH) {
      const batchReviews = reviews.slice(i, i + MAX_REVIEWS_PER_BATCH)
      const batchAppIds = [...new Set(batchReviews.map((r) => r.app_id))]
      const batchApps = apps.filter((a) => batchAppIds.includes(a.id))

      logger.info(
        `Batch ${Math.floor(i / MAX_REVIEWS_PER_BATCH) + 1}: ${batchReviews.length} reviews, ${batchApps.length} apps`
      )

      const input = buildInput(batchApps, startups, batchReviews)
      const results = await analyzeWithRetry(provider, input)

      logger.info(`AI returned ${results.length} opportunities`)

      for (const result of results) {
        try {
          await saveOpportunity(result, input)
          totalOpps++
          logger.info(`Saved: "${result.title}" (score: ${result.score}, verdict: ${result.verdict})`)
        } catch (err: unknown) {
          logger.warn(`Failed to save "${result.title}": ${(err as Error).message}`)
        }
      }

      // Collect review IDs for marking processed
      allReviewIds.push(...batchReviews.map((r) => r.id))
    }

    // Mark all processed reviews
    await markReviewsProcessed(allReviewIds)

    await completeCrawlJob(jobId, {
      found: reviews.length,
      inserted: totalOpps,
      updated: allReviewIds.length,
    })
    logger.info(`Done. Reviews processed: ${allReviewIds.length}, Opportunities created: ${totalOpps}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Analysis failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

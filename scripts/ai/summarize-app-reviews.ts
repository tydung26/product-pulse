import "dotenv/config"
import { spawn } from "child_process"
import { supabaseAdmin } from "../crawlers/lib/supabase-admin"
import {
  createLogger,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
} from "../crawlers/lib/crawler-utils"
import type { App, StoreReview, AppPainSummary } from "@/lib/types/database"

const logger = createLogger("summarize")
const MAX_REVIEWS_PER_APP = 100
const PAGE_SIZE = 1000

// -- Data fetching --

async function getAppsWithUnprocessedReviews(): Promise<App[]> {
  // Get distinct app_ids that have unprocessed reviews, then fetch app records
  const appIds = new Set<string>()
  let offset = 0

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("store_reviews")
      .select("app_id")
      .eq("is_processed", false)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch review app IDs: ${error.message}`)
    for (const row of data) appIds.add(row.app_id)
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  if (appIds.size === 0) return []

  // Fetch app records in chunks of 200 (Supabase .in() URL limit)
  const CHUNK = 200
  const ids = [...appIds]
  const allApps: App[] = []

  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabaseAdmin
      .from("apps")
      .select("*")
      .in("id", ids.slice(i, i + CHUNK))

    if (error) throw new Error(`Failed to fetch apps: ${error.message}`)
    allApps.push(...(data as App[]))
  }

  return allApps
}

async function getReviewsForApp(appId: string): Promise<StoreReview[]> {
  const { data, error } = await supabaseAdmin
    .from("store_reviews")
    .select("*")
    .eq("app_id", appId)
    .eq("is_processed", false)
    .order("created_at", { ascending: false })
    .limit(MAX_REVIEWS_PER_APP)

  if (error) throw new Error(`Failed to fetch reviews for app ${appId}: ${error.message}`)
  return (data ?? []) as StoreReview[]
}

// -- Summarization prompt --

function buildSummarizationPrompt(app: App, reviews: StoreReview[]): string {
  const reviewLines = reviews
    .map((r, i) => `[${i + 1}] (${r.rating}★) ${r.title ? r.title + ": " : ""}${r.body.slice(0, 400)}`)
    .join("\n")

  return `You are a product analyst. Analyze these 1-3 star reviews for "${app.name}" (${app.category ?? "unknown category"}) and identify the top pain themes.

## REVIEWS (${reviews.length} total)
${reviewLines}

## TASK
Group the reviews into 3-5 distinct pain themes. For each theme provide:
- theme: short descriptive name (5-10 words)
- severity: 0-100 (how severe/painful is this issue for users?)
- review_count: how many of the reviews mention this theme
- example_quotes: 2-3 short representative quotes (max 100 chars each)

## OUTPUT FORMAT
Return raw JSON only (no markdown fences):
{
  "themes": [
    {"theme": "Login failures blocking app access", "severity": 85, "review_count": 12, "example_quotes": ["Can't login...", "Auth broken..."]}
  ]
}

Return themes sorted by severity descending. Only return the JSON object.`
}

// -- Claude CLI call --

type SummarizationResult = {
  themes: AppPainSummary["themes"]
}

function callClaudeCLI(prompt: string): Promise<SummarizationResult> {
  return new Promise((resolve, reject) => {
    const proc = spawn("claude", ["--print"], { stdio: ["pipe", "pipe", "pipe"] })
    let stdout = ""
    let stderr = ""

    proc.stdout.on("data", (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on("data", (d: Buffer) => { stderr += d.toString() })

    proc.on("error", (err) => {
      if (err.message.includes("ENOENT")) reject(new Error("Claude CLI not found."))
      else reject(err)
    })

    proc.on("close", (code) => {
      if (code !== 0) return reject(new Error(`Claude CLI exited ${code}: ${stderr}`))
      try { resolve(parseSummarizationResponse(stdout)) }
      catch (e) { reject(e) }
    })

    proc.stdin.write(prompt)
    proc.stdin.end()

    setTimeout(() => { proc.kill(); reject(new Error("Claude CLI timeout (120s)")) }, 120_000)
  })
}

function parseSummarizationResponse(raw: string): SummarizationResult {
  // Strip markdown fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : raw.trim()

  // Find object boundaries
  const start = jsonStr.indexOf("{")
  const end = jsonStr.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("No JSON object found in response")

  const parsed = JSON.parse(jsonStr.slice(start, end + 1))
  if (!parsed.themes || !Array.isArray(parsed.themes)) {
    throw new Error("Response missing 'themes' array")
  }

  return { themes: parsed.themes }
}

// -- DB operations --

async function upsertPainSummary(appId: string, themes: AppPainSummary["themes"], totalReviews: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("app_pain_summaries")
    .upsert({ app_id: appId, themes, total_reviews: totalReviews }, { onConflict: "app_id" })

  if (error) throw new Error(`Failed to upsert pain summary: ${error.message}`)
}

async function markReviewsProcessed(reviewIds: string[]): Promise<void> {
  if (reviewIds.length === 0) return
  const { error } = await supabaseAdmin
    .from("store_reviews")
    .update({ is_processed: true })
    .in("id", reviewIds)

  if (error) logger.warn(`Failed to mark reviews processed: ${error.message}`)
}

// -- Main --

async function main() {
  // Parse --store flag for parallel execution (e.g., --store app_store)
  const args = process.argv.slice(2)
  const storeIdx = args.indexOf("--store")
  const storeFilter = storeIdx !== -1 ? args[storeIdx + 1] : null

  logger.info(`Starting Step 1: Summarize app reviews${storeFilter ? ` (store: ${storeFilter})` : ""}`)
  const jobId = await startCrawlJob("analyze")

  try {
    let apps = await getAppsWithUnprocessedReviews()
    if (storeFilter) {
      apps = apps.filter((a) => a.store === storeFilter)
    }

    if (apps.length === 0) {
      logger.info("No apps with unprocessed reviews found.")
      await completeCrawlJob(jobId, { found: 0, inserted: 0, updated: 0 })
      return
    }

    logger.info(`Found ${apps.length} apps with unprocessed reviews`)

    // Parse --concurrency flag (default 4)
    const concIdx = args.indexOf("--concurrency")
    const CONCURRENCY = concIdx !== -1 ? parseInt(args[concIdx + 1], 10) : 4

    let summarized = 0
    let failed = 0
    const queued = 0

    // Process a single app
    async function processApp(app: App): Promise<void> {
      const reviews = await getReviewsForApp(app.id)
      if (reviews.length === 0) return

      logger.info(`[${app.name}] Summarizing ${reviews.length} reviews...`)

      const prompt = buildSummarizationPrompt(app, reviews)
      const { themes } = await callClaudeCLI(prompt)

      await upsertPainSummary(app.id, themes, reviews.length)
      await markReviewsProcessed(reviews.map((r) => r.id))

      summarized++
      logger.info(`[${app.name}] Done — ${themes.length} themes (${summarized}/${apps.length})`)
    }

    // Concurrency pool — run N apps at a time
    logger.info(`Running with concurrency: ${CONCURRENCY}`)
    const queue = [...apps]

    async function worker(): Promise<void> {
      while (queue.length > 0) {
        const app = queue.shift()!
        try {
          await processApp(app)
        } catch (err: unknown) {
          failed++
          logger.warn(`[${app.name}] Failed: ${(err as Error).message}`)
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

    await completeCrawlJob(jobId, {
      found: apps.length,
      inserted: summarized,
      updated: 0,
    })
    logger.info(`Done. Summarized: ${summarized}, Failed: ${failed}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Summarization failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

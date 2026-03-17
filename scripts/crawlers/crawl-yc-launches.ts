import * as cheerio from "cheerio"
import {
  createLogger,
  rateLimit,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  upsertStartup,
  upsertStartupComment,
  fetchHtml,
} from "./lib/crawler-utils"
import type { StartupInsert, StartupCommentInsert } from "@/lib/types/database"

const logger = createLogger("yc-launches")
const delay = rateLimit(1000)

const YC_LAUNCHES_URL = "https://www.ycombinator.com/launches"

type LaunchItem = {
  name: string
  tagline: string
  slug: string
  url: string
}

async function fetchLaunches(): Promise<LaunchItem[]> {
  const html = await fetchHtml(YC_LAUNCHES_URL)
  const $ = cheerio.load(html)
  const launches: LaunchItem[] = []

  // YC launches page renders launch cards — selectors may change
  $("a[href^='/launches/']").each((_, el) => {
    const $el = $(el)
    const href = $el.attr("href") ?? ""
    const slug = href.replace("/launches/", "").split("?")[0]
    if (!slug || slug.includes("/")) return

    const name = $el.find("h3, [class*='title']").first().text().trim()
    const tagline = $el.find("p, [class*='tagline'], [class*='description']").first().text().trim()

    if (name && !launches.some((l) => l.slug === slug)) {
      launches.push({
        name,
        tagline,
        slug,
        url: `https://www.ycombinator.com/launches/${slug}`,
      })
    }
  })

  return launches
}

async function fetchLaunchDetail(url: string) {
  try {
    const html = await fetchHtml(url)
    const $ = cheerio.load(html)

    // Extract description from detail page
    const description =
      $("[class*='description'], article, .prose").first().text().trim() || null

    // Extract comments if available
    const comments: { author: string; body: string }[] = []
    $("[class*='comment']").each((_, el) => {
      const $comment = $(el)
      const author = $comment.find("[class*='author'], [class*='name']").first().text().trim()
      const body = $comment.find("[class*='body'], p").first().text().trim()
      if (body) comments.push({ author: author || "Anonymous", body })
    })

    return { description, comments }
  } catch {
    return { description: null, comments: [] }
  }
}

async function main() {
  logger.info("Starting YC Launches crawl")
  const jobId = await startCrawlJob("yc")

  try {
    const launches = await fetchLaunches()
    logger.info(`Found ${launches.length} launches`)

    if (launches.length === 0) {
      logger.warn("No launches found — YC page structure may have changed")
      await completeCrawlJob(jobId, { found: 0, inserted: 0, updated: 0 })
      return
    }

    let inserted = 0

    for (const launch of launches) {
      await delay()

      const detail = await fetchLaunchDetail(launch.url)

      const startupData: StartupInsert = {
        source: "yc",
        source_id: launch.slug,
        name: launch.name,
        tagline: launch.tagline || null,
        description: detail.description,
        url: launch.url,
        logo_url: null,
        funding_stage: null,
        category: null,
        launched_at: null,
        metadata: { batch: null },
      }

      try {
        const startup = await upsertStartup(startupData)
        inserted++

        // Insert comments
        for (const comment of detail.comments) {
          const commentData: StartupCommentInsert = {
            startup_id: startup.id,
            author: comment.author,
            body: comment.body,
            posted_at: null,
          }
          try {
            await upsertStartupComment(commentData)
          } catch (err: unknown) {
            logger.warn(`Failed to insert comment for ${launch.name}: ${(err as Error).message}`)
          }
        }
      } catch (err: unknown) {
        logger.warn(`Failed to upsert ${launch.name}: ${(err as Error).message}`)
      }
    }

    await completeCrawlJob(jobId, { found: launches.length, inserted, updated: 0 })
    logger.info(`Done. Found: ${launches.length}, Upserted: ${inserted}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Crawl failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

import * as cheerio from "cheerio"
import {
  createLogger,
  rateLimit,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  upsertStartup,
  fetchHtml,
} from "./lib/crawler-utils"
import type { StartupInsert } from "@/lib/types/database"

const logger = createLogger("unikorn")
const delay = rateLimit(1000)

const UNIKORN_URL = "https://unikorn.vn"

type StartupItem = {
  name: string
  description: string | null
  category: string | null
  slug: string
  url: string
  logo_url: string | null
  funding_stage: string | null
}

async function fetchStartups(): Promise<StartupItem[]> {
  const html = await fetchHtml(UNIKORN_URL)
  const $ = cheerio.load(html)

  // Check if page has meaningful content (SSR check)
  const bodyText = $("body").text().trim()
  if (bodyText.length < 200) {
    logger.warn("Page content too short — may be SPA (needs JS rendering). Skipping.")
    return []
  }

  const startups: StartupItem[] = []

  // Unikorn lists startups in cards — selectors will need adjustment at runtime
  $("a[href*='/startup'], a[href*='/company'], [class*='startup'], [class*='company']").each(
    (_, el) => {
      const $el = $(el)
      const href = $el.attr("href") ?? ""
      const slug =
        href
          .replace(/^https?:\/\/[^/]+/, "")
          .replace(/^\//, "")
          .split("?")[0] || ""

      if (!slug) return

      const name =
        $el.find("h2, h3, h4, [class*='name'], [class*='title']").first().text().trim() ||
        $el.text().trim().split("\n")[0]?.trim()

      if (!name || startups.some((s) => s.slug === slug)) return

      const description =
        $el.find("p, [class*='desc']").first().text().trim() || null
      const category =
        $el.find("[class*='category'], [class*='tag']").first().text().trim() || null
      const logo_url = $el.find("img").first().attr("src") ?? null
      const funding_stage =
        $el.find("[class*='funding'], [class*='stage']").first().text().trim() || null

      startups.push({
        name,
        description,
        category,
        slug,
        url: href.startsWith("http") ? href : `${UNIKORN_URL}/${slug}`,
        logo_url: logo_url?.startsWith("http") ? logo_url : logo_url ? `${UNIKORN_URL}${logo_url}` : null,
        funding_stage,
      })
    }
  )

  return startups
}

async function main() {
  logger.info("Starting Unikorn crawl")
  const jobId = await startCrawlJob("unikorn")

  try {
    const startups = await fetchStartups()
    logger.info(`Found ${startups.length} startups`)

    if (startups.length === 0) {
      logger.warn("No startups found — page may be SPA or structure changed")
      await completeCrawlJob(jobId, { found: 0, inserted: 0, updated: 0 })
      return
    }

    let inserted = 0

    for (const item of startups) {
      await delay()

      const startupData: StartupInsert = {
        source: "unikorn",
        source_id: item.slug,
        name: item.name,
        tagline: null,
        description: item.description,
        url: item.url,
        logo_url: item.logo_url,
        funding_stage: item.funding_stage,
        category: item.category,
        launched_at: null,
        metadata: {},
      }

      try {
        await upsertStartup(startupData)
        inserted++
      } catch (err: unknown) {
        logger.warn(`Failed to upsert ${item.name}: ${(err as Error).message}`)
      }
    }

    await completeCrawlJob(jobId, { found: startups.length, inserted, updated: 0 })
    logger.info(`Done. Found: ${startups.length}, Upserted: ${inserted}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Crawl failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

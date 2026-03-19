// eslint-disable-next-line @typescript-eslint/no-require-imports
const gplay = require("google-play-scraper").default
import {
  createLogger,
  rateLimit,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  upsertApp,
} from "./lib/crawler-utils"
import type { AppInsert } from "@/lib/types/database"

const logger = createLogger("google-play")
const delay = rateLimit(500)

// All Google Play app categories (excluding games, wear, watch faces)
const TARGET_CATEGORIES: string[] = [
  "ART_AND_DESIGN",
  "AUTO_AND_VEHICLES",
  "BEAUTY",
  "BOOKS_AND_REFERENCE",
  "BUSINESS",
  "COMMUNICATION",
  "DATING",
  "EDUCATION",
  "ENTERTAINMENT",
  "EVENTS",
  "FINANCE",
  "FOOD_AND_DRINK",
  "HEALTH_AND_FITNESS",
  "HOUSE_AND_HOME",
  "LIFESTYLE",
  "MAPS_AND_NAVIGATION",
  "MEDICAL",
  "MUSIC_AND_AUDIO",
  "NEWS_AND_MAGAZINES",
  "PARENTING",
  "PERSONALIZATION",
  "PHOTOGRAPHY",
  "PRODUCTIVITY",
  "SHOPPING",
  "SOCIAL",
  "SPORTS",
  "TOOLS",
  "TRAVEL_AND_LOCAL",
  "VIDEO_PLAYERS",
  "WEATHER",
]

const APPS_PER_CATEGORY = 48

type GPlayAppItem = {
  appId: string
  title: string
  url: string
  icon: string
  score: number
}

type GPlayAppDetail = {
  appId: string
  title: string
  url: string
  icon: string
  score: number
  genre: string
  free: boolean
  price: number
  installs: string
  summary: string
  description: string
}

function parseInstalls(installs: string | undefined): number | null {
  if (!installs) return null
  const cleaned = installs.replace(/[^0-9]/g, "")
  return cleaned ? parseInt(cleaned, 10) : null
}

function estimateMrr(price: number, installs: number | null): number | null {
  if (!installs) return null
  if (price > 0) {
    // Paid app: rough monthly estimate = price * installs * 0.01 (1% monthly new)
    return Math.round(price * installs * 0.01 * 100) / 100
  }
  // Free app: estimate from ads (~$1 CPM * DAU estimate)
  const estimatedDau = installs * 0.01
  return Math.round(estimatedDau * 30 * 0.001 * 100) / 100
}

async function fetchCategoryApps(category: string): Promise<GPlayAppItem[]> {
  try {
    return await gplay.list({
      category,
      collection: gplay.collection.TOP_FREE,
      num: APPS_PER_CATEGORY,
      country: "us",
      lang: "en",
    })
  } catch (err: unknown) {
    logger.warn(`Failed to list category ${category}: ${(err as Error).message}`)
    return []
  }
}

async function fetchAppDetail(appId: string): Promise<GPlayAppDetail | null> {
  try {
    return await gplay.app({ appId, country: "us", lang: "en" })
  } catch {
    return null
  }
}

function mapToAppInsert(detail: GPlayAppDetail): AppInsert {
  const installs = parseInstalls(detail.installs)
  return {
    store: "google_play",
    store_id: detail.appId,
    name: detail.title,
    category: detail.genre,
    price: detail.free ? "Free" : `$${detail.price ?? 0}`,
    icon_url: detail.icon,
    store_url: detail.url,
    description: detail.summary ?? detail.description?.slice(0, 500) ?? null,
    avg_rating: detail.score ? Math.round(detail.score * 10) / 10 : null,
    overall_rating: detail.score ? Math.round(detail.score * 10) / 10 : null,
    downloads: installs,
    estimated_mrr: estimateMrr(detail.free ? 0 : (detail.price ?? 0), installs),
  }
}

async function main() {
  logger.info("Starting Google Play crawl")
  const jobId = await startCrawlJob("google_play")

  try {
    let found = 0
    let inserted = 0
    const seenAppIds = new Set<string>()

    for (const category of TARGET_CATEGORIES) {
      logger.info(`Fetching category: ${category}`)
      const apps = await fetchCategoryApps(category)
      logger.info(`Found ${apps.length} apps in ${category}`)

      for (const app of apps) {
        if (seenAppIds.has(app.appId)) continue
        seenAppIds.add(app.appId)

        found++
        await delay()

        const detail = await fetchAppDetail(app.appId)
        if (!detail) {
          logger.warn(`Failed to get detail for ${app.appId}`)
          continue
        }

        try {
          await upsertApp(mapToAppInsert(detail))
          inserted++
        } catch (err: unknown) {
          logger.warn(`Failed to upsert ${detail.title}: ${(err as Error).message}`)
        }
      }
    }

    await completeCrawlJob(jobId, { found, inserted, updated: 0 })
    logger.info(`Done. Found: ${found}, Upserted: ${inserted}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Crawl failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

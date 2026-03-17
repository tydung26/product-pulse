// eslint-disable-next-line @typescript-eslint/no-require-imports
const gplay = require("google-play-scraper").default
import {
  createLogger,
  rateLimit,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  upsertReview,
  updateAppLastCrawled,
  getActiveApps,
  fetchJson,
} from "./lib/crawler-utils"
import type { App, StoreReviewInsert } from "@/lib/types/database"

const logger = createLogger("store-reviews")
const delay = rateLimit(1000)

const MAX_REVIEWS_PER_APP = 100

// -- App Store review fetcher (Apple RSS) --

type AppleReviewEntry = {
  id: { label: string }
  author: { name: { label: string } }
  "im:rating": { label: string }
  title: { label: string }
  content: { label: string }
  "im:version"?: { label: string }
  link?: { attributes: { href: string } }
}

async function fetchAppStoreReviews(app: App): Promise<StoreReviewInsert[]> {
  // Apple RSS feed returns recent reviews (up to ~50 per page)
  const url = `https://itunes.apple.com/us/rss/customerreviews/id=${app.store_id}/sortBy=mostRecent/json`

  try {
    const data = await fetchJson<{ feed: { entry?: AppleReviewEntry[] } }>(url)
    const entries = data.feed.entry ?? []

    return entries
      .filter((e) => parseInt(e["im:rating"].label, 10) <= 3)
      .slice(0, MAX_REVIEWS_PER_APP)
      .map((e) => ({
        app_id: app.id,
        source: "app_store" as const,
        external_id: e.id.label,
        author: e.author.name.label,
        rating: parseInt(e["im:rating"].label, 10),
        title: e.title.label || null,
        body: e.content.label,
        version: e["im:version"]?.label ?? null,
        review_date: null, // RSS doesn't include date reliably
        source_url: e.link?.attributes?.href ?? null,
      }))
  } catch (err: unknown) {
    logger.warn(`App Store reviews failed for ${app.name}: ${(err as Error).message}`)
    return []
  }
}

// -- Google Play review fetcher --

type GPlayReview = {
  id: string
  userName: string
  score: number
  title: string | null
  text: string
  date: string
  version: string | null
  url: string | null
}

async function fetchGooglePlayReviews(app: App): Promise<StoreReviewInsert[]> {
  try {
    const reviews: GPlayReview[] = await gplay.reviews({
      appId: app.store_id,
      sort: gplay.sort.NEWEST,
      num: MAX_REVIEWS_PER_APP,
      country: "us",
      lang: "en",
    }).then((res: { data: GPlayReview[] }) => res.data)

    return reviews
      .filter((r) => r.score <= 3)
      .map((r) => ({
        app_id: app.id,
        source: "google_play" as const,
        external_id: r.id,
        author: r.userName,
        rating: r.score,
        title: r.title || null,
        body: r.text,
        version: r.version ?? null,
        review_date: r.date ? new Date(r.date).toISOString() : null,
        source_url: r.url ?? null,
      }))
  } catch (err: unknown) {
    logger.warn(`Google Play reviews failed for ${app.name}: ${(err as Error).message}`)
    return []
  }
}

// -- Main orchestration --

async function main() {
  logger.info("Starting store reviews crawl")

  const apps = await getActiveApps()
  if (apps.length === 0) {
    logger.info("No active apps to crawl (all recently crawled or none exist)")
    return
  }

  logger.info(`Processing ${apps.length} active apps`)

  let totalApps = 0
  let totalReviews = 0
  let totalInserted = 0

  for (const app of apps) {
    const jobId = await startCrawlJob(app.store as "app_store" | "google_play", app.id)

    try {
      const reviews =
        app.store === "app_store"
          ? await fetchAppStoreReviews(app)
          : await fetchGooglePlayReviews(app)

      let inserted = 0
      for (const review of reviews) {
        try {
          const result = await upsertReview(review)
          if (result) inserted++
        } catch (err: unknown) {
          logger.warn(`Failed to upsert review: ${(err as Error).message}`)
        }
      }

      await updateAppLastCrawled(app.id)
      await completeCrawlJob(jobId, { found: reviews.length, inserted, updated: 0 })

      totalApps++
      totalReviews += reviews.length
      totalInserted += inserted

      logger.info(`${app.name}: ${reviews.length} reviews found, ${inserted} upserted`)
    } catch (err: unknown) {
      await failCrawlJob(jobId, (err as Error).message)
      logger.warn(`Failed for ${app.name}: ${(err as Error).message}`)
    }

    await delay()
  }

  logger.info(`Done. Apps: ${totalApps}, Reviews found: ${totalReviews}, Upserted: ${totalInserted}`)
}

main()

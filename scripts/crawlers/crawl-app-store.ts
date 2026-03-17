import {
  createLogger,
  rateLimit,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  upsertApp,
  fetchJson,
} from "./lib/crawler-utils"
import type { AppInsert } from "@/lib/types/database"

const logger = createLogger("app-store")
const delay = rateLimit(500)

// Target genre IDs for Apple App Store RSS feeds
// https://affiliate.itunes.apple.com/resources/documentation/genre-mapping/
const TARGET_GENRES = [
  { id: 6007, name: "Productivity" },
  { id: 6013, name: "Health & Fitness" },
  { id: 6015, name: "Finance" },
  { id: 6017, name: "Education" },
  { id: 6000, name: "Business" },
]

const COUNTRY = "us"
const LIMIT = 50

// Apple RSS feed types
type RSSFeedEntry = {
  "im:bundleId": { attributes: { "im:bundleId": string } }
  "im:name": { label: string }
  category: { attributes: { label: string } }
  "im:price": { attributes: { amount: string } }
  "im:image": { label: string }[]
  link: { attributes: { href: string } }
  id: { attributes: { "im:id": string } }
}

type ITunesLookupResult = {
  trackName: string
  bundleId: string
  primaryGenreName: string
  price: number
  artworkUrl100: string
  trackViewUrl: string
  description: string
  averageUserRating: number
  userRatingCount: number
}

async function fetchTopApps(genreId: number): Promise<RSSFeedEntry[]> {
  const url = `https://itunes.apple.com/${COUNTRY}/rss/topfreeapplications/limit=${LIMIT}/genre=${genreId}/json`
  try {
    const data = await fetchJson<{ feed: { entry?: RSSFeedEntry[] } }>(url)
    return data.feed.entry ?? []
  } catch (err) {
    logger.warn(`Failed to fetch genre ${genreId}: ${(err as Error).message}`)
    return []
  }
}

async function lookupApp(appId: string): Promise<ITunesLookupResult | null> {
  const url = `https://itunes.apple.com/lookup?id=${appId}&country=${COUNTRY}`
  try {
    const data = await fetchJson<{ results: ITunesLookupResult[] }>(url)
    return data.results[0] ?? null
  } catch {
    return null
  }
}

function mapToAppInsert(entry: RSSFeedEntry, lookup: ITunesLookupResult | null): AppInsert {
  const bundleId = entry["im:bundleId"].attributes["im:bundleId"]
  const images = entry["im:image"]
  const iconUrl = images.length > 0 ? images[images.length - 1].label : null

  return {
    store: "app_store",
    store_id: bundleId,
    name: lookup?.trackName ?? entry["im:name"].label,
    category: lookup?.primaryGenreName ?? entry.category.attributes.label,
    price: lookup ? (lookup.price === 0 ? "Free" : `$${lookup.price}`) : entry["im:price"].attributes.amount,
    icon_url: lookup?.artworkUrl100 ?? iconUrl,
    store_url: lookup?.trackViewUrl ?? entry.link.attributes.href,
    description: lookup?.description ?? null,
    avg_rating: lookup?.averageUserRating ?? null,
    overall_rating: lookup?.averageUserRating ?? null,
    downloads: lookup ? lookup.userRatingCount * 5 : null, // rough estimate
    estimated_mrr: null,
  }
}

async function main() {
  logger.info("Starting App Store crawl")
  const jobId = await startCrawlJob("app_store")

  try {
    let found = 0
    let inserted = 0
    let updated = 0
    const seenBundleIds = new Set<string>()

    for (const genre of TARGET_GENRES) {
      logger.info(`Fetching genre: ${genre.name} (${genre.id})`)
      const entries = await fetchTopApps(genre.id)
      logger.info(`Found ${entries.length} apps in ${genre.name}`)

      for (const entry of entries) {
        const bundleId = entry["im:bundleId"].attributes["im:bundleId"]

        // Skip duplicates across genres
        if (seenBundleIds.has(bundleId)) continue
        seenBundleIds.add(bundleId)

        found++
        await delay()

        const appId = entry.id.attributes["im:id"]
        const lookup = await lookupApp(appId)
        const appData = mapToAppInsert(entry, lookup)

        try {
          await upsertApp(appData)
          inserted++ // upsert — counts as inserted or updated
        } catch (err) {
          logger.warn(`Failed to upsert ${appData.name}: ${(err as Error).message}`)
        }
      }
    }

    updated = 0 // upsert doesn't distinguish, count all as inserted
    await completeCrawlJob(jobId, { found, inserted, updated })
    logger.info(`Done. Found: ${found}, Upserted: ${inserted}`)
  } catch (err) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Crawl failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

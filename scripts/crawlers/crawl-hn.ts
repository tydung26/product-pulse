import "dotenv/config"
import {
  createLogger,
  rateLimit,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  fetchJson,
  hasWillingnessToPay,
  upsertCommunityPost,
} from "./lib/crawler-utils"
import type { CommunityPostInsert } from "@/lib/types/database"

const logger = createLogger("hn")
const delay = rateLimit(1000)

// -- HN Algolia API types --

type HNHit = {
  objectID: string
  title: string | null
  story_text: string | null
  comment_text: string | null
  author: string
  points: number | null
  num_comments: number | null
  url: string | null
  created_at: string
  _tags: string[]
}

type HNSearchResponse = {
  hits: HNHit[]
  nbHits: number
  nbPages: number
}

// -- Pain-related search keywords --

const SEARCH_QUERIES = [
  "I wish there was",
  "looking for alternative",
  "anyone know a tool",
  "frustrated with",
  "need a better",
  "would pay for",
  "someone should build",
]

const HN_ALGOLIA_BASE = "https://hn.algolia.com/api/v1"

// -- Fetch functions --

async function searchHN(query: string, tags: string, page = 0): Promise<HNHit[]> {
  const params = new URLSearchParams({
    query,
    tags,
    hitsPerPage: "50",
    page: String(page),
    numericFilters: "points>3",
  })
  const url = `${HN_ALGOLIA_BASE}/search?${params}`
  const data = await fetchJson<HNSearchResponse>(url)
  return data.hits
}

async function fetchRecentAskHN(): Promise<HNHit[]> {
  const params = new URLSearchParams({
    tags: "ask_hn",
    hitsPerPage: "50",
    numericFilters: "points>5",
  })
  const url = `${HN_ALGOLIA_BASE}/search_by_date?${params}`
  const data = await fetchJson<HNSearchResponse>(url)
  return data.hits
}

// -- Convert HN hit to community post --

function hitToPost(hit: HNHit): CommunityPostInsert | null {
  const body = hit.story_text || hit.comment_text || hit.title || ""
  if (!body || body.length < 20) return null

  // Determine channel from tags
  const tags = hit._tags ?? []
  let channel = "story"
  if (tags.includes("ask_hn")) channel = "ask_hn"
  else if (tags.includes("show_hn")) channel = "show_hn"

  const fullText = `${hit.title ?? ""} ${body}`
  const postUrl = hit.url || `https://news.ycombinator.com/item?id=${hit.objectID}`

  return {
    source: "hn",
    external_id: hit.objectID,
    channel,
    title: hit.title ?? null,
    body,
    author: hit.author,
    url: postUrl,
    score: hit.points ?? 0,
    comment_count: hit.num_comments ?? 0,
    has_wtp: hasWillingnessToPay(fullText),
  }
}

// -- Main --

async function main() {
  logger.info("Starting HN Algolia crawl")
  const jobId = await startCrawlJob("hn")

  try {
    // Dedup by objectID across all searches
    const seen = new Set<string>()
    const posts: CommunityPostInsert[] = []

    // 1. Search for pain keywords in Ask HN and stories
    for (const query of SEARCH_QUERIES) {
      for (const tags of ["ask_hn", "story"]) {
        try {
          const hits = await searchHN(query, tags)
          for (const hit of hits) {
            if (seen.has(hit.objectID)) continue
            seen.add(hit.objectID)
            const post = hitToPost(hit)
            if (post) posts.push(post)
          }
          logger.info(`Search "${query}" [${tags}]: ${hits.length} hits`)
        } catch (err: unknown) {
          logger.warn(`Search "${query}" [${tags}] failed: ${(err as Error).message}`)
        }
        await delay()
      }
    }

    // 2. Fetch recent Ask HN posts (high-signal)
    try {
      const recent = await fetchRecentAskHN()
      for (const hit of recent) {
        if (seen.has(hit.objectID)) continue
        seen.add(hit.objectID)
        const post = hitToPost(hit)
        if (post) posts.push(post)
      }
      logger.info(`Recent Ask HN: ${recent.length} hits`)
    } catch (err: unknown) {
      logger.warn(`Recent Ask HN failed: ${(err as Error).message}`)
    }

    logger.info(`Total unique posts: ${posts.length}, WTP flagged: ${posts.filter((p) => p.has_wtp).length}`)

    // 3. Upsert all posts
    let inserted = 0
    for (const post of posts) {
      try {
        await upsertCommunityPost(post)
        inserted++
      } catch (err: unknown) {
        logger.warn(`Failed to upsert ${post.external_id}: ${(err as Error).message}`)
      }
    }

    await completeCrawlJob(jobId, { found: posts.length, inserted, updated: 0 })
    logger.info(`Done. Found: ${posts.length}, Upserted: ${inserted}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Crawl failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

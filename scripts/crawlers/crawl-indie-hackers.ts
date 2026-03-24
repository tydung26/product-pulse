import "dotenv/config"
import {
  createLogger,
  rateLimit,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  hasWillingnessToPay,
  upsertCommunityPost,
} from "./lib/crawler-utils"
import type { CommunityPostInsert } from "@/lib/types/database"

const logger = createLogger("indie-hackers")
const delay = rateLimit(500)

// -- IH uses Algolia for search (public search-only key) --

const ALGOLIA_APP_ID = "N86T1R3OWZ"
const ALGOLIA_SEARCH_KEY = "5140dac5e87f47346abbda1a34ee70c3"
const ALGOLIA_URL = `https://${ALGOLIA_APP_ID}-dsn.algolia.net/1/indexes/discussions/query`

const SEARCH_QUERIES = [
  "I wish there was",
  "looking for alternative",
  "need a tool for",
  "frustrated with",
  "would pay for",
  "someone should build",
  "pain point",
  "biggest challenge",
  "hate using",
  "switching from",
  "recommend a tool",
  "what tool do you use",
  "too expensive",
  "missing feature",
  "bad experience",
  "struggle with",
  "any alternative",
  "overpriced",
]

const MAX_PAGES_PER_QUERY = 5

// -- Algolia response types --

type IHHit = {
  objectID: string
  itemId: string
  title: string
  body: string
  username: string
  numUpvotes: number
  numReplies: number
  groupName?: string
  createdTimestamp: number
}

type AlgoliaResponse = {
  hits: IHHit[]
  nbHits: number
  nbPages: number
}

// -- Search IH Algolia --

async function searchIH(query: string, page = 0): Promise<IHHit[]> {
  const response = await fetch(ALGOLIA_URL, {
    method: "POST",
    headers: {
      "X-Algolia-Application-Id": ALGOLIA_APP_ID,
      "X-Algolia-API-Key": ALGOLIA_SEARCH_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      hitsPerPage: 50,
      page,
    }),
  })

  if (!response.ok) {
    throw new Error(`IH Algolia search failed: ${response.status} ${response.statusText}`)
  }

  const data = (await response.json()) as AlgoliaResponse
  return data.hits
}

// -- Convert IH hit to community post --

function hitToPost(hit: IHHit): CommunityPostInsert | null {
  if (!hit.body || hit.body.length < 20) return null

  const fullText = `${hit.title ?? ""} ${hit.body}`

  return {
    source: "indie_hackers",
    external_id: hit.objectID,
    channel: hit.groupName ?? null,
    title: hit.title ?? null,
    body: hit.body,
    author: hit.username,
    url: `https://www.indiehackers.com/post/${hit.itemId}`,
    score: hit.numUpvotes ?? 0,
    comment_count: hit.numReplies ?? 0,
    has_wtp: hasWillingnessToPay(fullText),
  }
}

// -- Main --

async function main() {
  logger.info("Starting Indie Hackers Algolia crawl")
  const jobId = await startCrawlJob("indie_hackers")

  try {
    const seen = new Set<string>()
    const posts: CommunityPostInsert[] = []

    for (const query of SEARCH_QUERIES) {
      try {
        for (let page = 0; page < MAX_PAGES_PER_QUERY; page++) {
          const hits = await searchIH(query, page)
          if (hits.length === 0) break

          for (const hit of hits) {
            if (seen.has(hit.objectID)) continue
            seen.add(hit.objectID)
            const post = hitToPost(hit)
            if (post) posts.push(post)
          }

          await delay()
        }

        logger.info(`Search "${query}": found results`)
      } catch (err: unknown) {
        logger.warn(`Search "${query}" failed: ${(err as Error).message}`)
      }
    }

    logger.info(`Total unique posts: ${posts.length}, WTP flagged: ${posts.filter((p) => p.has_wtp).length}`)

    // Upsert all posts
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

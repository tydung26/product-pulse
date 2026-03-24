import "dotenv/config"
import {
  createLogger,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
  hasWillingnessToPay,
  upsertCommunityPost,
} from "./lib/crawler-utils"
import { RedditAuth } from "./lib/reddit-auth"
import type { CommunityPostInsert } from "@/lib/types/database"

const logger = createLogger("reddit")

// -- Target subreddits and search keywords --

const SUBREDDITS = [
  "SaaS",
  "smallbusiness",
  "Entrepreneur",
  "selfhosted",
  "startups",
  "webdev",
  "ProductManagement",
  "indiehackers",
]

const SEARCH_QUERIES = [
  "I wish there was",
  "looking for alternative",
  "anyone know a tool",
  "need a tool for",
  "frustrated with",
  "would pay for",
]

// -- Reddit API types --

type RedditPost = {
  id: string
  subreddit: string
  title: string
  selftext: string
  author: string
  permalink: string
  score: number
  num_comments: number
  created_utc: number
}

type RedditListing = {
  data: {
    after: string | null
    children: Array<{ data: RedditPost }>
  }
}

// -- Adaptive rate limiting from Reddit response headers --

async function respectRateLimit(response: Response): Promise<void> {
  const remaining = parseInt(response.headers.get("X-Ratelimit-Remaining") ?? "100")
  const resetSecs = parseInt(response.headers.get("X-Ratelimit-Reset") ?? "60")

  if (remaining < 5) {
    logger.info(`Rate limit low (${remaining} remaining), waiting ${resetSecs}s`)
    await new Promise((r) => setTimeout(r, resetSecs * 1000))
  } else {
    // Minimum 600ms between requests (100 req/min safe)
    await new Promise((r) => setTimeout(r, 600))
  }
}

// -- Convert Reddit post to community post --

function postToCommunityPost(post: RedditPost): CommunityPostInsert | null {
  // Skip link-only posts with no selftext
  if (!post.selftext || post.selftext.length < 20) return null
  // Skip deleted/removed
  if (post.selftext === "[removed]" || post.selftext === "[deleted]") return null

  const fullText = `${post.title} ${post.selftext}`

  return {
    source: "reddit",
    external_id: post.id,
    channel: post.subreddit,
    title: post.title,
    body: post.selftext,
    author: post.author,
    url: `https://reddit.com${post.permalink}`,
    score: post.score,
    comment_count: post.num_comments,
    has_wtp: hasWillingnessToPay(fullText),
  }
}

// -- Main --

async function main() {
  const clientId = process.env.REDDIT_CLIENT_ID
  const clientSecret = process.env.REDDIT_CLIENT_SECRET

  if (!clientId || !clientSecret) {
    logger.warn("REDDIT_CLIENT_ID or REDDIT_CLIENT_SECRET not set. Skipping Reddit crawl.")
    return
  }

  logger.info("Starting Reddit crawl")
  const auth = new RedditAuth(clientId, clientSecret)
  const jobId = await startCrawlJob("reddit")

  try {
    const seen = new Set<string>()
    const posts: CommunityPostInsert[] = []

    // 1. Crawl each subreddit for new posts
    for (const sub of SUBREDDITS) {
      try {
        const response = await auth.fetchAuthenticated(
          `https://oauth.reddit.com/r/${sub}/new?limit=100&t=month&raw_json=1`
        )

        if (!response.ok) {
          logger.warn(`/r/${sub}: ${response.status} ${response.statusText}`)
          await respectRateLimit(response)
          continue
        }

        const listing = (await response.json()) as RedditListing

        for (const child of listing.data.children) {
          if (seen.has(child.data.id)) continue
          seen.add(child.data.id)
          const post = postToCommunityPost(child.data)
          if (post) posts.push(post)
        }

        logger.info(`/r/${sub}: ${listing.data.children.length} posts`)
        await respectRateLimit(response)
      } catch (err: unknown) {
        logger.warn(`/r/${sub} failed: ${(err as Error).message}`)
      }
    }

    // 2. Keyword searches across all of Reddit
    for (const query of SEARCH_QUERIES) {
      try {
        const params = new URLSearchParams({
          q: query,
          sort: "new",
          t: "month",
          restrict_sr: "false",
          limit: "100",
          type: "link",
          raw_json: "1",
        })

        const response = await auth.fetchAuthenticated(
          `https://oauth.reddit.com/search?${params}`
        )

        if (!response.ok) {
          logger.warn(`Search "${query}": ${response.status}`)
          await respectRateLimit(response)
          continue
        }

        const listing = (await response.json()) as RedditListing

        for (const child of listing.data.children) {
          if (seen.has(child.data.id)) continue
          seen.add(child.data.id)
          const post = postToCommunityPost(child.data)
          if (post) posts.push(post)
        }

        logger.info(`Search "${query}": ${listing.data.children.length} results`)
        await respectRateLimit(response)
      } catch (err: unknown) {
        logger.warn(`Search "${query}" failed: ${(err as Error).message}`)
      }
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

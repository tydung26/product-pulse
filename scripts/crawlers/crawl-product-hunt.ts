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

const logger = createLogger("product-hunt")
const delay = rateLimit(1500)

const PH_TOKEN = process.env.PRODUCTHUNT_TOKEN

// -- GraphQL API path (preferred, needs token) --

type PHPost = {
  id: string
  name: string
  tagline: string
  description: string
  votesCount: number
  url: string
  thumbnail?: { url: string } | null
  topics?: { edges: { node: { name: string } }[] }
  comments?: { edges: { node: { body: string; user: { name: string }; createdAt: string } }[] }
}

async function fetchViaApi(): Promise<PHPost[]> {
  const query = `{
    posts(order: NEWEST, first: 50) {
      edges {
        node {
          id name tagline description votesCount url
          thumbnail { url }
          topics(first: 1) { edges { node { name } } }
          comments(first: 10) { edges { node { body user { name } createdAt } } }
        }
      }
    }
  }`

  const response = await fetch("https://api.producthunt.com/v2/api/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${PH_TOKEN}`,
    },
    body: JSON.stringify({ query }),
  })

  if (!response.ok) {
    throw new Error(`PH API returned ${response.status}: ${response.statusText}`)
  }

  const json = await response.json() as { data: { posts: { edges: { node: PHPost }[] } } }
  return json.data.posts.edges.map((e) => e.node)
}

// -- Scrape fallback (no token needed) --

type ScrapedPost = {
  name: string
  tagline: string
  slug: string
  url: string
  upvotes: number
}

async function fetchViaScrape(): Promise<ScrapedPost[]> {
  const html = await fetchHtml("https://www.producthunt.com")
  const $ = cheerio.load(html)
  const posts: ScrapedPost[] = []

  // PH homepage renders product cards — selectors are fragile
  $("a[href^='/posts/']").each((_, el) => {
    const $el = $(el)
    const href = $el.attr("href") ?? ""
    const slug = href.replace("/posts/", "").split("?")[0]
    if (!slug || slug.includes("/")) return

    const name = $el.find("h3, [class*='title']").first().text().trim()
    const tagline = $el.find("p, [class*='tagline']").first().text().trim()

    if (name && !posts.some((p) => p.slug === slug)) {
      posts.push({
        name,
        tagline,
        slug,
        url: `https://www.producthunt.com/posts/${slug}`,
        upvotes: 0,
      })
    }
  })

  return posts
}

async function main() {
  logger.info("Starting Product Hunt crawl")
  const jobId = await startCrawlJob("product_hunt")

  try {
    let inserted = 0
    let found = 0

    if (PH_TOKEN) {
      // API path
      logger.info("Using GraphQL API (token found)")
      const posts = await fetchViaApi()
      found = posts.length
      logger.info(`Found ${found} posts via API`)

      for (const post of posts) {
        const category = post.topics?.edges[0]?.node.name ?? null

        const startupData: StartupInsert = {
          source: "producthunt",
          source_id: post.id,
          name: post.name,
          tagline: post.tagline || null,
          description: post.description || null,
          url: post.url,
          logo_url: post.thumbnail?.url ?? null,
          upvotes: post.votesCount,
          funding_stage: null,
          category,
          launched_at: null,
          last_active_date: null,
          status: "active",  // PH featured products are active
          metadata: {},
        }

        try {
          const startup = await upsertStartup(startupData)
          inserted++

          // Insert comments from API
          for (const edge of post.comments?.edges ?? []) {
            const c = edge.node
            const commentData: StartupCommentInsert = {
              startup_id: startup.id,
              author: c.user.name,
              body: c.body,
              posted_at: c.createdAt,
            }
            try {
              await upsertStartupComment(commentData)
            } catch (err: unknown) {
              logger.warn(`Failed to insert comment: ${(err as Error).message}`)
            }
          }
        } catch (err: unknown) {
          logger.warn(`Failed to upsert ${post.name}: ${(err as Error).message}`)
        }
      }
    } else {
      // Scrape fallback
      logger.info("No PRODUCTHUNT_TOKEN — falling back to scraping")
      const posts = await fetchViaScrape()
      found = posts.length
      logger.info(`Found ${found} posts via scrape`)

      for (const post of posts) {
        await delay()

        const startupData: StartupInsert = {
          source: "producthunt",
          source_id: post.slug,
          name: post.name,
          tagline: post.tagline || null,
          description: null,
          url: post.url,
          logo_url: null,
          upvotes: post.upvotes,
          funding_stage: null,
          category: null,
          launched_at: null,
          last_active_date: null,
          metadata: {},
        }

        try {
          await upsertStartup(startupData)
          inserted++
        } catch (err: unknown) {
          logger.warn(`Failed to upsert ${post.name}: ${(err as Error).message}`)
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

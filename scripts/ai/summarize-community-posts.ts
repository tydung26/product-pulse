import "dotenv/config"
import { spawn } from "child_process"
import { supabaseAdmin } from "../crawlers/lib/supabase-admin"
import {
  createLogger,
  startCrawlJob,
  completeCrawlJob,
  failCrawlJob,
} from "../crawlers/lib/crawler-utils"
import type { CommunityPost } from "@/lib/types/database"

const logger = createLogger("summarize-community")
const MAX_POSTS_PER_BATCH = 50
const SOURCES = ["reddit", "hn", "indie_hackers"] as const

// -- Data fetching --

async function getUnprocessedPosts(source: string): Promise<CommunityPost[]> {
  const { data, error } = await supabaseAdmin
    .from("community_posts")
    .select("*")
    .eq("source", source)
    .eq("is_processed", false)
    .order("score", { ascending: false })
    .limit(MAX_POSTS_PER_BATCH * 4) // max 4 batches per source per run

  if (error) throw new Error(`Failed to fetch community posts: ${error.message}`)
  return (data ?? []) as CommunityPost[]
}

// -- Prompt --

function buildCommunityPrompt(source: string, posts: CommunityPost[]): string {
  const postLines = posts
    .map((p, i) => {
      const wtpFlag = p.has_wtp ? "(WTP) " : ""
      const channel = p.channel ? `[${p.channel}] ` : ""
      return `[${i}] ${wtpFlag}${channel}${p.title ?? ""}: ${p.body.slice(0, 400)}`
    })
    .join("\n")

  return `You are a product analyst. Analyze these ${posts.length} community posts from ${source} and group them into 3-8 distinct topic clusters based on the pain points or needs they express.

## POSTS
${postLines}

## TASK

For each topic cluster:
1. Assign a descriptive topic name (5-15 words)
2. Extract 2-5 pain themes with severity scores
3. Count how many posts in the cluster have (WTP) flag
4. List which post indices belong to this cluster

## OUTPUT FORMAT

Return raw JSON only (no markdown fences):
{
  "clusters": [
    {
      "topic": "CRM tools too complex for solo founders",
      "themes": [
        {"theme": "Feature bloat in existing CRMs", "severity": 75, "review_count": 8, "example_quotes": ["Too many features", "Just want contacts"]}
      ],
      "wtp_count": 3,
      "post_indices": [1, 5, 12]
    }
  ]
}

Return 3-8 clusters sorted by theme severity descending. Only return the JSON object.`
}

// -- AI call via Claude CLI --

type ClusterResult = {
  topic: string
  themes: { theme: string; severity: number; review_count: number; example_quotes: string[] }[]
  wtp_count: number
  post_indices: number[]
}

type SummarizationResult = {
  clusters: ClusterResult[]
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
      try { resolve(parseResponse(stdout)) }
      catch (e) { reject(e) }
    })

    proc.stdin.write(prompt)
    proc.stdin.end()

    setTimeout(() => { proc.kill(); reject(new Error("Claude CLI timeout (120s)")) }, 120_000)
  })
}

function parseResponse(raw: string): SummarizationResult {
  // Strip markdown fences if present
  const fenceMatch = raw.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  const jsonStr = fenceMatch ? fenceMatch[1].trim() : raw.trim()

  const start = jsonStr.indexOf("{")
  const end = jsonStr.lastIndexOf("}")
  if (start === -1 || end === -1) throw new Error("No JSON object found in response")

  const parsed = JSON.parse(jsonStr.slice(start, end + 1))
  if (!parsed.clusters || !Array.isArray(parsed.clusters)) {
    throw new Error("Response missing 'clusters' array")
  }

  // Validate and clamp severity scores
  for (const cluster of parsed.clusters) {
    if (!cluster.topic || !Array.isArray(cluster.themes)) continue
    for (const theme of cluster.themes) {
      theme.severity = Math.min(100, Math.max(0, theme.severity ?? 0))
      theme.review_count = theme.review_count ?? 0
      theme.example_quotes = theme.example_quotes ?? []
    }
  }

  return { clusters: parsed.clusters }
}

// -- DB operations --

async function upsertCluster(source: string, cluster: ClusterResult): Promise<void> {
  const { error } = await supabaseAdmin
    .from("community_pain_summaries")
    .upsert(
      {
        source,
        topic: cluster.topic,
        themes: cluster.themes,
        total_posts: cluster.post_indices.length,
      },
      { onConflict: "source,topic" }
    )

  if (error) throw new Error(`Failed to upsert cluster: ${error.message}`)
}

async function markPostsProcessed(postIds: string[]): Promise<void> {
  if (postIds.length === 0) return
  const { error } = await supabaseAdmin
    .from("community_posts")
    .update({ is_processed: true })
    .in("id", postIds)

  if (error) logger.warn(`Failed to mark posts processed: ${error.message}`)
}

// -- Batch utility --

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
}

// -- Main --

async function main() {
  logger.info("Starting community post summarization")
  const jobId = await startCrawlJob("community_summarize")

  try {
    let totalClusters = 0
    let totalPosts = 0

    for (const source of SOURCES) {
      const posts = await getUnprocessedPosts(source)
      if (posts.length === 0) {
        logger.info(`[${source}] No unprocessed posts`)
        continue
      }

      logger.info(`[${source}] ${posts.length} unprocessed posts`)
      const batches = chunkArray(posts, MAX_POSTS_PER_BATCH)

      for (const batch of batches) {
        logger.info(`[${source}] Summarizing batch of ${batch.length} posts...`)

        try {
          const prompt = buildCommunityPrompt(source, batch)
          const result = await callClaudeCLI(prompt)

          for (const cluster of result.clusters) {
            try {
              await upsertCluster(source, cluster)
              totalClusters++
              logger.info(`[${source}] Cluster: "${cluster.topic}" (${cluster.themes.length} themes, ${cluster.wtp_count} WTP)`)
            } catch (err: unknown) {
              logger.warn(`Failed to save cluster "${cluster.topic}": ${(err as Error).message}`)
            }
          }

          await markPostsProcessed(batch.map((p) => p.id))
          totalPosts += batch.length
        } catch (err: unknown) {
          logger.warn(`[${source}] Batch failed: ${(err as Error).message}`)
        }
      }
    }

    await completeCrawlJob(jobId, { found: totalPosts, inserted: totalClusters, updated: 0 })
    logger.info(`Done. Posts processed: ${totalPosts}, Clusters: ${totalClusters}`)
  } catch (err: unknown) {
    await failCrawlJob(jobId, (err as Error).message)
    logger.error("Summarization failed:", (err as Error).message)
    process.exit(1)
  }
}

main()

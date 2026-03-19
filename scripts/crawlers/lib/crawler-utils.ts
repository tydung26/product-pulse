import { supabaseAdmin } from "./supabase-admin"
import type {
  AppInsert,
  App,
  Startup,
  StartupInsert,
  StartupCommentInsert,
  StoreReview,
  StoreReviewInsert,
  CrawlJob,
} from "@/lib/types/database"

// -- Logging --

export function createLogger(source: string) {
  const prefix = `[${source}]`
  return {
    info: (...args: unknown[]) => console.log(prefix, new Date().toISOString(), ...args),
    warn: (...args: unknown[]) => console.warn(prefix, new Date().toISOString(), ...args),
    error: (...args: unknown[]) => console.error(prefix, new Date().toISOString(), ...args),
  }
}

// -- Rate Limiting --

export function rateLimit(ms: number) {
  return () => new Promise<void>((resolve) => setTimeout(resolve, ms))
}

// -- Crawl Jobs --

export async function startCrawlJob(
  jobType: CrawlJob["job_type"],
  appId?: string
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("crawl_jobs")
    .insert({
      job_type: jobType,
      status: "running",
      started_at: new Date().toISOString(),
      ...(appId ? { app_id: appId } : {}),
    })
    .select("id")
    .single()

  if (error) throw new Error(`Failed to start crawl job: ${error.message}`)
  return data.id
}

export async function completeCrawlJob(
  jobId: string,
  counts: { found: number; inserted: number; updated: number }
) {
  const { error } = await supabaseAdmin
    .from("crawl_jobs")
    .update({
      status: "completed",
      items_found: counts.found,
      items_inserted: counts.inserted,
      items_updated: counts.updated,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)

  if (error) throw new Error(`Failed to complete crawl job: ${error.message}`)
}

export async function failCrawlJob(jobId: string, errorMessage: string) {
  const { error } = await supabaseAdmin
    .from("crawl_jobs")
    .update({
      status: "failed",
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq("id", jobId)

  if (error) console.error(`Failed to update crawl job as failed: ${error.message}`)
}

// -- App Upsert --

export async function upsertApp(data: AppInsert): Promise<App> {
  const { data: app, error } = await supabaseAdmin
    .from("apps")
    .upsert(data, { onConflict: "store,store_id" })
    .select()
    .single()

  if (error) throw new Error(`Failed to upsert app: ${error.message}`)
  return app as App
}

// -- Startup Upsert --

export async function upsertStartup(data: StartupInsert): Promise<Startup> {
  const { data: startup, error } = await supabaseAdmin
    .from("startups")
    .upsert(data, { onConflict: "source,source_id" })
    .select()
    .single()

  if (error) throw new Error(`Failed to upsert startup: ${error.message}`)
  return startup as Startup
}

export async function upsertStartupComment(data: StartupCommentInsert): Promise<void> {
  // Dedup by startup_id + author + body prefix (first 100 chars)
  const bodyPrefix = data.body.slice(0, 100)
  const { data: existing } = await supabaseAdmin
    .from("startup_comments")
    .select("id")
    .eq("startup_id", data.startup_id)
    .eq("author", data.author ?? "")
    .like("body", `${bodyPrefix}%`)
    .limit(1)

  if (existing && existing.length > 0) return

  const { error } = await supabaseAdmin
    .from("startup_comments")
    .insert(data)

  if (error) throw new Error(`Failed to insert startup comment: ${error.message}`)
}

// -- Review Upsert --

export async function upsertReview(data: StoreReviewInsert): Promise<StoreReview | null> {
  // external_id is required for dedup via unique constraint — generate fallback if missing
  if (!data.external_id) {
    data.external_id = `${data.app_id}-${data.author ?? "anon"}-${data.body.slice(0, 50).replace(/\W/g, "")}`
  }

  const { data: review, error } = await supabaseAdmin
    .from("store_reviews")
    .upsert(data, { onConflict: "source,external_id" })
    .select()
    .single()

  if (error) throw new Error(`Failed to upsert review: ${error.message}`)
  return review as StoreReview
}

export async function updateAppLastCrawled(appId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("apps")
    .update({ last_crawled_at: new Date().toISOString() })
    .eq("id", appId)

  if (error) throw new Error(`Failed to update last_crawled_at: ${error.message}`)
}

export async function getActiveApps(): Promise<App[]> {
  // ISO 8601 string interpolation is idiomatic for Supabase PostgREST timestamptz filters
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  // Paginate to bypass Supabase's default 1000-row limit
  const PAGE_SIZE = 1000
  const allApps: App[] = []
  let offset = 0

  while (true) {
    const { data, error } = await supabaseAdmin
      .from("apps")
      .select("*")
      .eq("is_active", true)
      .or(`last_crawled_at.is.null,last_crawled_at.lt.${oneDayAgo}`)
      .range(offset, offset + PAGE_SIZE - 1)

    if (error) throw new Error(`Failed to fetch active apps: ${error.message}`)
    allApps.push(...(data as App[]))
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
  }

  return allApps
}

// -- HTML Fetching --

export async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.text()
}

// -- JSON Fetching --

export async function fetchJson<T = unknown>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`)
  }
  return response.json() as Promise<T>
}

// Database types matching supabase/migrations/001-initial-schema.sql

export type App = {
  id: string
  store: "app_store" | "google_play"
  store_id: string
  name: string
  category: string | null
  avg_rating: number | null
  price: string | null
  icon_url: string | null
  store_url: string | null
  description: string | null
  downloads: number | null
  overall_rating: number | null
  estimated_mrr: number | null
  is_active: boolean
  last_crawled_at: string | null
  created_at: string
  updated_at: string
}

export type AppInsert = Omit<App, "id" | "created_at" | "updated_at" | "is_active" | "last_crawled_at"> & {
  id?: string
  is_active?: boolean
  last_crawled_at?: string | null
}

export type StoreReview = {
  id: string
  app_id: string
  source: "app_store" | "google_play"
  external_id: string | null
  author: string | null
  rating: number
  title: string | null
  body: string
  version: string | null
  review_date: string | null
  source_url: string | null
  is_processed: boolean
  created_at: string
}

export type StoreReviewInsert = Omit<StoreReview, "id" | "created_at" | "is_processed"> & {
  id?: string
  is_processed?: boolean
}

export type Startup = {
  id: string
  source: "yc" | "producthunt" | "unikorn"
  source_id: string | null
  name: string
  tagline: string | null
  description: string | null
  url: string | null
  logo_url: string | null
  upvotes: number
  funding_stage: string | null
  category: string | null
  launched_at: string | null
  last_active_date: string | null
  status: "active" | "inactive" | "unknown"
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type StartupInsert = Omit<Startup, "id" | "created_at" | "updated_at" | "upvotes" | "status"> & {
  status?: "active" | "inactive" | "unknown"
  id?: string
  upvotes?: number
}

export type StartupComment = {
  id: string
  startup_id: string
  author: string | null
  body: string
  posted_at: string | null
  created_at: string
}

export type StartupCommentInsert = Omit<StartupComment, "id" | "created_at"> & {
  id?: string
}

export type Opportunity = {
  id: string
  title: string
  description: string
  category: string | null
  score: number
  pain_severity: number
  market_size: number
  competition: number
  verdict: "strong" | "moderate" | "weak"
  pain_summary: string[]
  solution_angles: string[]
  ai_reasoning: Record<string, unknown>
  evidence_summary: Record<string, unknown>
  wtp_count: number
  source_count: Record<string, number>
  score_breakdown: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type OpportunityInsert = Omit<Opportunity, "id" | "created_at" | "updated_at"> & {
  id?: string
}

export type OpportunityApp = {
  opportunity_id: string
  app_id: string
  ai_comment: string | null
  review_count: number
  avg_rating: number | null
}

export type OpportunityStartup = {
  opportunity_id: string
  startup_id: string
  ai_comment: string | null
  role: "competitor" | "inspiration" | "related"
}

export type OpportunityReview = {
  opportunity_id: string
  review_id: string
  quote: string | null
  relevance: string | null
}

export type OpportunityCommunityPost = {
  opportunity_id: string
  community_post_id: string
  quote: string | null
  relevance: string | null
}

export type AppPainSummary = {
  id: string
  app_id: string
  themes: { theme: string; severity: number; review_count: number; example_quotes: string[] }[]
  total_reviews: number
  created_at: string
}

// -- Community types --

export type CommunityPost = {
  id: string
  source: "reddit" | "hn" | "indie_hackers" | "producthunt" | "yc"
  external_id: string
  channel: string | null
  title: string | null
  body: string
  author: string | null
  url: string
  score: number
  comment_count: number
  has_wtp: boolean
  is_processed: boolean
  created_at: string
  updated_at: string
}

export type CommunityPostInsert = Omit<CommunityPost, "id" | "created_at" | "updated_at" | "is_processed" | "score" | "comment_count" | "has_wtp"> & {
  id?: string
  is_processed?: boolean
  score?: number
  comment_count?: number
  has_wtp?: boolean
}

export type CommunityPainSummary = {
  id: string
  source: string
  topic: string
  themes: { theme: string; severity: number; review_count: number; example_quotes: string[] }[]
  total_posts: number
  created_at: string
  updated_at: string
}

export type CrawlJob = {
  id: string
  job_type: "app_store" | "google_play" | "yc" | "product_hunt" | "unikorn" | "analyze" | "hn" | "reddit" | "indie_hackers" | "community_summarize"
  status: "pending" | "running" | "completed" | "failed"
  app_id: string | null
  items_found: number
  items_inserted: number
  items_updated: number
  error_message: string | null
  started_at: string | null
  completed_at: string | null
  metadata: Record<string, unknown>
  created_at: string
}

export type CrawlJobInsert = Omit<CrawlJob, "id" | "created_at" | "items_found" | "items_inserted" | "items_updated"> & {
  id?: string
  items_found?: number
  items_inserted?: number
  items_updated?: number
}

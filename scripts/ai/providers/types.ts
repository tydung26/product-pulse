// AI provider interface and analysis types

export type PainTheme = {
  theme: string
  severity: number
  review_count: number
  example_quotes: string[]
}

export type AppSummaryContext = {
  index: number
  id: string
  name: string
  category: string | null
  mrr: number | null
  downloads: number | null
  rating: number | null
  store: string
  themes: PainTheme[]
  total_reviews: number
}

export type CommunitySummaryContext = {
  index: number
  id: string
  source: string
  topic: string
  themes: PainTheme[]
  total_posts: number
}

export type AnalysisInput = {
  apps: AppContext[]
  startups: StartupContext[]
  reviews: ReviewContext[]
  startupComments: StartupCommentContext[]
  appSummaries?: AppSummaryContext[]
  communitySummaries?: CommunitySummaryContext[]
}

export type AppContext = {
  index: number
  id: string
  name: string
  category: string | null
  mrr: number | null
  downloads: number | null
  rating: number | null
  store: string
}

export type StartupContext = {
  index: number
  id: string
  name: string
  tagline: string | null
  upvotes: number
  source: string
}

export type ReviewContext = {
  index: number
  id: string
  appIndex: number
  body: string
  rating: number
  title: string | null
}

export type StartupCommentContext = {
  index: number
  id: string
  startupIndex: number
  body: string
  author: string | null
}

export type EvidenceItem = {
  type: "app_review" | "community_post"
  sourceIndex: number
  quote: string
  relevance: string
  hasWtp: boolean
}

export type ScoreBreakdown = {
  pain: { score: number; reasoning: string }
  market: { score: number; reasoning: string }
  competition: { score: number; reasoning: string }
  wtp_bonus: number
}

export type OpportunityResult = {
  title: string
  description: string
  category: string
  score: number
  painSeverity: number
  marketSize: number
  competition: number
  verdict: "strong" | "moderate" | "weak"
  painSummary: string[]
  solutionAngles: string[]
  reasoning: string
  appIndices: number[]
  startupIndices: number[]
  // Evidence chain
  evidence: EvidenceItem[]
  scoreBreakdown: ScoreBreakdown | null
  wtpCount: number
  sourceDistribution: Record<string, number>
  // Legacy fields (backward compat)
  reviewIndices: number[]
  commentIndices: number[]
  appComments: Record<number, string>
  startupComments: Record<number, { comment: string; role: string }>
}

export interface AIProvider {
  analyze(input: AnalysisInput): Promise<OpportunityResult[]>
}

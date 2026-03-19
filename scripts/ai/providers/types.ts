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

export type AnalysisInput = {
  apps: AppContext[]
  startups: StartupContext[]
  reviews: ReviewContext[]
  startupComments: StartupCommentContext[]
  // Step 2: app pain summaries (replaces raw reviews when present)
  appSummaries?: AppSummaryContext[]
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
  reviewIndices: number[]
  commentIndices: number[]
  appComments: Record<number, string>
  startupComments: Record<number, { comment: string; role: string }>
}

export interface AIProvider {
  analyze(input: AnalysisInput): Promise<OpportunityResult[]>
}

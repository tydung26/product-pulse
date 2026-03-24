import { notFound } from "next/navigation"
import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase/server"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { ScoreBreakdown } from "@/components/opportunity-detail/score-breakdown"
import { SourceDistribution } from "@/components/opportunity-detail/source-distribution"
import { OpportunityDossierTabs } from "@/components/opportunity-detail/opportunity-dossier-tabs"
import { verdictColor } from "@/lib/constants"
import type { Opportunity, StoreReview, CommunityPost, Startup } from "@/lib/types/database"

type Props = {
  params: Promise<{ id: string }>
}

export default async function OpportunityDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServer()

  // Parallel fetch: opportunity + all evidence + competition
  const [
    { data: oppRaw },
    { data: reviewLinks },
    { data: communityLinks },
    { data: startupLinks },
  ] = await Promise.all([
    supabase.from("opportunities").select("*").eq("id", id).single(),
    supabase
      .from("opportunity_reviews")
      .select("*, review:store_reviews(*)")
      .eq("opportunity_id", id),
    supabase
      .from("opportunity_community_posts")
      .select("*, post:community_posts(*)")
      .eq("opportunity_id", id),
    supabase
      .from("opportunity_startups")
      .select("*, startup:startups(*)")
      .eq("opportunity_id", id),
  ])

  if (!oppRaw) notFound()

  const opp = oppRaw as Opportunity

  // Cast joined data with nested types
  const typedReviewLinks = (reviewLinks ?? []) as Array<{
    opportunity_id: string
    review_id: string
    quote: string | null
    relevance: string | null
    review: StoreReview | null
  }>

  const typedCommunityLinks = (communityLinks ?? []) as Array<{
    opportunity_id: string
    community_post_id: string
    quote: string | null
    relevance: string | null
    post: CommunityPost | null
  }>

  const typedStartupLinks = (startupLinks ?? []) as Array<{
    opportunity_id: string
    startup_id: string
    ai_comment: string | null
    role: "competitor" | "inspiration" | "related"
    startup: Startup | null
  }>

  const sourceCount = (opp.source_count ?? {}) as Record<string, number>

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/opportunities" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Opportunities
      </Link>

      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-2xl font-semibold leading-snug">{opp.title}</h1>
          <div className="flex shrink-0 items-center gap-2">
            <span className="text-3xl font-bold">{opp.score}</span>
            <Badge className={verdictColor[opp.verdict] ?? ""}>
              {opp.verdict}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {opp.category && <span>{opp.category}</span>}
          {opp.wtp_count > 0 && (
            <Badge className="bg-emerald-100 text-emerald-800 text-xs">
              {opp.wtp_count} WTP
            </Badge>
          )}
        </div>

        <SourceDistribution sourceCount={sourceCount} />
      </div>

      <p className="text-sm text-muted-foreground leading-relaxed">{opp.description}</p>

      <Separator />

      {/* Score breakdown */}
      <ScoreBreakdown opportunity={opp} />

      <Separator />

      {/* Pain signals + solution angles */}
      {(opp.pain_summary.length > 0 || opp.solution_angles.length > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {opp.pain_summary.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Pain Signals</h2>
              <ul className="space-y-1">
                {opp.pain_summary.map((p, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="mt-0.5 shrink-0 text-foreground/40">•</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {opp.solution_angles.length > 0 && (
            <div>
              <h2 className="mb-2 text-sm font-semibold">Solution Angles</h2>
              <ul className="space-y-1">
                {opp.solution_angles.map((s, i) => (
                  <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                    <span className="mt-0.5 shrink-0 text-foreground/40">→</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Devil's advocate: critique + open questions */}
      {(() => {
        const aiReasoning = opp.ai_reasoning as Record<string, unknown> | null
        const critique = (aiReasoning?.critique ?? []) as string[]
        const openQuestions = (aiReasoning?.openQuestions ?? []) as string[]
        if (critique.length === 0 && openQuestions.length === 0) return null
        return (
          <>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              {critique.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-red-700">Why This Might NOT Work</h2>
                  <ul className="space-y-1">
                    {critique.map((c, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-0.5 shrink-0 text-red-400">!</span>
                        {c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {openQuestions.length > 0 && (
                <div>
                  <h2 className="mb-2 text-sm font-semibold text-amber-700">Open Questions to Validate</h2>
                  <ul className="space-y-1">
                    {openQuestions.map((q, i) => (
                      <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                        <span className="mt-0.5 shrink-0 text-amber-400">?</span>
                        {q}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )
      })()}

      <Separator />

      {/* Evidence / Competition / WTP tabs */}
      <OpportunityDossierTabs
        opportunity={opp}
        reviewEvidence={typedReviewLinks}
        communityEvidence={typedCommunityLinks}
        startupLinks={typedStartupLinks}
      />
    </div>
  )
}

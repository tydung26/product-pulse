import { Badge } from "@/components/ui/badge"
import { SourceBadge } from "@/components/community-post-card"
import type { StoreReview, CommunityPost } from "@/lib/types/database"

type ReviewEvidence = {
  opportunity_id: string
  review_id: string
  quote: string | null
  relevance: string | null
  review: StoreReview | null
}

type CommunityEvidence = {
  opportunity_id: string
  community_post_id: string
  quote: string | null
  relevance: string | null
  post: CommunityPost | null
}

type Props = {
  reviewEvidence: ReviewEvidence[]
  communityEvidence: CommunityEvidence[]
}

function EvidenceItem({
  quote,
  relevance,
  sourceLabel,
  sourceBadge,
  url,
  isWtp,
}: {
  quote: string | null
  relevance: string | null
  sourceLabel: string
  sourceBadge: React.ReactNode
  url?: string | null
  isWtp?: boolean
}) {
  return (
    <div className="rounded-lg border p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {sourceBadge}
        {isWtp && <Badge className="bg-emerald-100 text-emerald-800 text-xs">WTP</Badge>}
      </div>
      {quote && (
        <blockquote className="border-l-2 border-muted pl-3 text-sm italic text-muted-foreground">
          &ldquo;{quote}&rdquo;
        </blockquote>
      )}
      {relevance && <p className="text-xs text-muted-foreground">Relevance: {relevance}</p>}
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">{sourceLabel}</span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-foreground underline-offset-2 hover:underline"
          >
            Open Original &rarr;
          </a>
        )}
      </div>
    </div>
  )
}

export function EvidenceTab({ reviewEvidence, communityEvidence }: Props) {
  const hasEvidence = reviewEvidence.length > 0 || communityEvidence.length > 0

  if (!hasEvidence) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No evidence data available. This opportunity was generated before evidence tracking was added.
      </p>
    )
  }

  return (
    <div className="space-y-4">
      {reviewEvidence.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            App Reviews ({reviewEvidence.length})
          </h3>
          <div className="space-y-2">
            {reviewEvidence.map((item) => (
              <EvidenceItem
                key={item.review_id}
                quote={item.quote}
                relevance={item.relevance}
                sourceLabel={item.review?.source === "app_store" ? "App Store" : "Google Play"}
                sourceBadge={
                  <Badge variant="secondary" className="text-xs">
                    {item.review?.source === "app_store" ? "App Store" : "Google Play"}
                  </Badge>
                }
                url={item.review?.source_url}
              />
            ))}
          </div>
        </section>
      )}

      {communityEvidence.length > 0 && (
        <section>
          <h3 className="mb-3 text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            Community Posts ({communityEvidence.length})
          </h3>
          <div className="space-y-2">
            {communityEvidence.map((item) => (
              <EvidenceItem
                key={item.community_post_id}
                quote={item.quote}
                relevance={item.relevance}
                sourceLabel={item.post?.channel ?? item.post?.source ?? "Community"}
                sourceBadge={
                  item.post ? (
                    <SourceBadge source={item.post.source} />
                  ) : (
                    <Badge variant="secondary" className="text-xs">Community</Badge>
                  )
                }
                url={item.post?.url}
                isWtp={item.post?.has_wtp}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

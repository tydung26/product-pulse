import { Badge } from "@/components/ui/badge"
import { SourceBadge } from "@/components/community-post-card"
import type { CommunityPost } from "@/lib/types/database"

type CommunityEvidence = {
  community_post_id: string
  quote: string | null
  relevance: string | null
  post: CommunityPost | null
}

type Props = {
  wtpCount: number
  communityEvidence: CommunityEvidence[]
}

export function WtpSignals({ wtpCount, communityEvidence }: Props) {
  if (wtpCount === 0) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        No willingness-to-pay signals detected for this opportunity.
      </p>
    )
  }

  // Filter to only WTP-tagged community posts
  const wtpItems = communityEvidence.filter((e) => e.post?.has_wtp)

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge className="bg-emerald-100 text-emerald-800">
          {wtpCount} WTP {wtpCount === 1 ? "signal" : "signals"}
        </Badge>
        <span className="text-xs text-muted-foreground">
          Posts expressing direct willingness to pay
        </span>
      </div>

      {wtpItems.length > 0 && (
        <div className="space-y-2">
          {wtpItems.map((item) => (
            <div key={item.community_post_id} className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {item.post && <SourceBadge source={item.post.source} />}
                {item.post?.channel && (
                  <span className="text-xs text-muted-foreground">{item.post.channel}</span>
                )}
              </div>
              {item.quote && (
                <blockquote className="border-l-2 border-emerald-400 pl-3 text-sm italic text-muted-foreground">
                  &ldquo;{item.quote}&rdquo;
                </blockquote>
              )}
              {item.relevance && (
                <p className="text-xs text-muted-foreground">Relevance: {item.relevance}</p>
              )}
              {item.post?.url && (
                <a
                  href={item.post.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-foreground underline-offset-2 hover:underline"
                >
                  Open Original &rarr;
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

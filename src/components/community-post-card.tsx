import Link from "next/link"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { CommunityPost } from "@/lib/types/database"

// Source badge color mapping
export const SOURCE_COLORS: Record<string, string> = {
  reddit: "bg-orange-100 text-orange-800",
  hn: "bg-amber-100 text-amber-800",
  indie_hackers: "bg-blue-100 text-blue-800",
  producthunt: "bg-rose-100 text-rose-800",
  yc: "bg-purple-100 text-purple-800",
  app_store: "bg-gray-100 text-gray-800",
  google_play: "bg-green-100 text-green-800",
}

const SOURCE_LABELS: Record<string, string> = {
  reddit: "Reddit",
  hn: "HN",
  indie_hackers: "Indie Hackers",
  producthunt: "Product Hunt",
  yc: "YC",
}

export function SourceBadge({ source }: { source: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
        SOURCE_COLORS[source] ?? "bg-gray-100 text-gray-800"
      )}
    >
      {SOURCE_LABELS[source] ?? source}
    </span>
  )
}

type Props = {
  post: CommunityPost
}

export function CommunityPostCard({ post }: Props) {
  const preview = post.body.length > 150 ? post.body.slice(0, 150) + "…" : post.body
  const dateStr = post.created_at
    ? new Date(post.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null

  return (
    <Link href={`/community/${post.id}`} className="block">
      <Card className="transition-colors hover:bg-muted/50">
        <CardHeader className="pb-2">
          <div className="flex flex-wrap items-center gap-2">
            <SourceBadge source={post.source} />
            {post.channel && (
              <span className="text-xs text-muted-foreground">{post.channel}</span>
            )}
            {post.has_wtp && (
              <Badge className="bg-emerald-100 text-emerald-800 text-xs">WTP</Badge>
            )}
          </div>
          {post.title && (
            <h2 className="mt-1 text-sm font-semibold leading-snug">{post.title}</h2>
          )}
        </CardHeader>
        <CardContent className="pt-0 space-y-2">
          <p className="text-sm text-muted-foreground">{preview}</p>
          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            <span>Score: {post.score}</span>
            <span>{post.comment_count} comments</span>
            {dateStr && <span>{dateStr}</span>}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

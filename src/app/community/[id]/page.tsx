import { notFound } from "next/navigation"
import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase/server"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SourceBadge } from "@/components/community-post-card"
import type { CommunityPost } from "@/lib/types/database"

type Props = {
  params: Promise<{ id: string }>
}

export default async function CommunityDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServer()

  const { data: post } = await supabase
    .from("community_posts")
    .select("*")
    .eq("id", id)
    .single()

  if (!post) notFound()
  const p = post as CommunityPost

  const dateStr = p.created_at
    ? new Date(p.created_at).toLocaleDateString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : null

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/community" className="text-sm text-muted-foreground hover:text-foreground">
        &larr; Back to Community
      </Link>

      {/* Header */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <SourceBadge source={p.source} />
          {p.channel && (
            <Badge variant="secondary" className="text-xs">
              {p.channel}
            </Badge>
          )}
          {p.has_wtp && (
            <Badge className="bg-emerald-100 text-emerald-800 text-xs">WTP Signal</Badge>
          )}
        </div>
        {p.title && <h1 className="text-2xl font-semibold">{p.title}</h1>}
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          {p.author && <span>By {p.author}</span>}
          {dateStr && <span>{dateStr}</span>}
          <span>Score: {p.score}</span>
          <span>{p.comment_count} comments</span>
        </div>
      </div>

      <Separator />

      {/* Full body */}
      <Card>
        <CardContent className="p-5">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{p.body}</p>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-4">
        {p.url && (
          <a
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition-opacity hover:opacity-80"
          >
            View Original &rarr;
          </a>
        )}
        <Link href="/community" className="text-sm text-muted-foreground hover:text-foreground">
          &larr; Back to listing
        </Link>
      </div>
    </div>
  )
}

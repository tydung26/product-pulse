import { Suspense } from "react"
import { createSupabaseServer } from "@/lib/supabase/server"
import { CommunityFilters } from "@/components/community-filters"
import { Skeleton } from "@/components/ui/skeleton"
import type { CommunityPost } from "@/lib/types/database"

export default async function CommunityPage() {
  const supabase = await createSupabaseServer()

  const { data: posts } = await supabase
    .from("community_posts")
    .select("*")
    .order("score", { ascending: false })
    .limit(100)

  const typedPosts = (posts ?? []) as CommunityPost[]

  // Extract unique sources for filter dropdown
  const sources = [...new Set(typedPosts.map((p) => p.source))]

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold">
          Community Signals
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {typedPosts.length} posts
          </span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Posts from Reddit, Hacker News, and Indie Hackers with product pain signals.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <CommunityFilters posts={typedPosts} sources={sources} />
      </Suspense>
    </div>
  )
}

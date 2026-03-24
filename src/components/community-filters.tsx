"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CommunityPostCard } from "@/components/community-post-card"
import type { CommunityPost } from "@/lib/types/database"

type Props = {
  posts: CommunityPost[]
  sources: string[]
}

const SOURCE_LABELS: Record<string, string> = {
  reddit: "Reddit",
  hn: "Hacker News",
  indie_hackers: "Indie Hackers",
  producthunt: "Product Hunt",
  yc: "YC",
}

export function CommunityFilters({ posts, sources }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const source = searchParams.get("source") ?? "all"
  const wtp = searchParams.get("wtp") === "1"
  const sort = searchParams.get("sort") ?? "score"

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== "all" && value !== "0") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/community?${params.toString()}`)
    },
    [router, searchParams]
  )

  // Client-side filter + sort
  let filtered = posts
  if (source !== "all") {
    filtered = filtered.filter((p) => p.source === source)
  }
  if (wtp) {
    filtered = filtered.filter((p) => p.has_wtp)
  }
  filtered = [...filtered].sort((a, b) => {
    if (sort === "date") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    return b.score - a.score // default: score desc
  })

  return (
    <div>
      {/* Filters bar */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select value={source} onValueChange={(v) => updateParam("source", v ?? "all")}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            {sources.map((s) => (
              <SelectItem key={s} value={s}>
                {SOURCE_LABELS[s] ?? s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sort} onValueChange={(v) => updateParam("sort", v ?? "score")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="score">Highest score</SelectItem>
            <SelectItem value="date">Newest first</SelectItem>
          </SelectContent>
        </Select>

        <button
          onClick={() => updateParam("wtp", wtp ? "0" : "1")}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            wtp
              ? "bg-emerald-100 text-emerald-800"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          WTP only
        </button>

        <span className="ml-auto text-sm text-muted-foreground">
          {filtered.length} posts
        </span>
      </div>

      {/* Post list */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No community posts found. Run the community crawler to import posts.
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map((post) => (
            <CommunityPostCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  )
}

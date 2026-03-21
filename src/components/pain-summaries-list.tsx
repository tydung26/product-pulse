"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { useDebouncedCallback } from "@/lib/use-debounce"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SafeImage } from "@/components/safe-image"
import { PainThemeBar } from "@/components/pain-theme-bar"
import type { PainSummaryWithApp } from "@/app/pain-summaries/page"

type Props = {
  summaries: PainSummaryWithApp[]
  categories: string[]
  total: number
}

// Compute max severity across all themes for a summary
function maxSeverity(summary: PainSummaryWithApp): number {
  if (!summary.themes.length) return 0
  return Math.max(...summary.themes.map((t) => t.severity))
}

export function PainSummariesList({ summaries, categories, total }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const search = searchParams.get("search") ?? ""
  const category = searchParams.get("category") ?? "all"
  const sort = searchParams.get("sort") ?? "severity"

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== "all") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/pain-summaries?${params.toString()}`)
    },
    [router, searchParams]
  )

  const debouncedSearch = useDebouncedCallback(
    (e: unknown) =>
      updateParam("search", (e as React.ChangeEvent<HTMLInputElement>).target.value),
    300
  )

  // Client-side filter
  let filtered = summaries
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter((s) => s.app.name.toLowerCase().includes(q))
  }
  if (category !== "all") {
    filtered = filtered.filter((s) => s.app.category === category)
  }

  // Client-side sort
  filtered = [...filtered].sort((a, b) => {
    if (sort === "reviews") return b.total_reviews - a.total_reviews
    if (sort === "name") return a.app.name.localeCompare(b.app.name)
    return maxSeverity(b) - maxSeverity(a) // default: severity
  })

  return (
    <div>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">
          Pain Summaries
          <span className="ml-2 text-sm font-normal text-muted-foreground">
            {total} {total === 1 ? "app" : "apps"}
          </span>
        </h1>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search apps..."
          defaultValue={search}
          onChange={debouncedSearch}
          className="sm:max-w-xs"
        />
        <Select value={category} onValueChange={(v) => updateParam("category", v ?? "all")}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => updateParam("sort", v ?? "severity")}>
          <SelectTrigger className="sm:w-44">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="severity">Highest severity</SelectItem>
            <SelectItem value="reviews">Total reviews</SelectItem>
            <SelectItem value="name">App name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No pain summaries found. Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">pnpm analyze</code>{" "}
          to generate pain summaries from reviews.
        </p>
      ) : (
        <div className="space-y-4">
          {filtered.map((summary) => (
            <Link key={summary.id} href={`/pain-summaries/${summary.id}`} className="block">
              <Card className="transition-colors hover:bg-muted/50">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-3">
                    <SafeImage src={summary.app.icon_url} alt={summary.app.name} size={40} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="truncate text-sm font-semibold">{summary.app.name}</h2>
                        <Badge variant="secondary" className="shrink-0 text-xs">
                          {summary.app.store === "app_store" ? "iOS" : "Android"}
                        </Badge>
                        {summary.app.category && (
                          <span className="text-xs text-muted-foreground">{summary.app.category}</span>
                        )}
                        {summary.app.avg_rating !== null && (
                          <span className="text-xs text-muted-foreground">
                            {summary.app.avg_rating.toFixed(1)} stars
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {summary.total_reviews} reviews analyzed &middot; {summary.themes.length}{" "}
                        {summary.themes.length === 1 ? "theme" : "themes"}
                      </p>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-3">
                    {summary.themes.slice(0, 3).map((theme, i) => (
                      <PainThemeBar key={i} theme={theme} expanded={false} />
                    ))}
                    {summary.themes.length > 3 && (
                      <p className="text-xs text-muted-foreground">
                        +{summary.themes.length - 3} more themes
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

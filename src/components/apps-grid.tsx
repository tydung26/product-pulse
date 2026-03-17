"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { AppCard } from "@/components/app-card"
import type { App } from "@/lib/types/database"

type Props = {
  apps: App[]
  categories: string[]
}

export function AppsGrid({ apps, categories }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const search = searchParams.get("search") ?? ""
  const category = searchParams.get("category") ?? "all"
  const sort = searchParams.get("sort") ?? "rating"

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== "all") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/apps?${params.toString()}`)
    },
    [router, searchParams]
  )

  // Client-side filtering (RSC already applied DB-level filters, this is for instant UX)
  let filtered = apps
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter((a) => a.name.toLowerCase().includes(q))
  }
  if (category !== "all") {
    filtered = filtered.filter((a) => a.category === category)
  }

  // Client-side sort
  filtered = [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name)
    if (sort === "mrr") return (b.estimated_mrr ?? 0) - (a.estimated_mrr ?? 0)
    return (b.avg_rating ?? 0) - (a.avg_rating ?? 0) // default: rating
  })

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search apps..."
          defaultValue={search}
          onChange={(e) => updateParam("search", e.target.value)}
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
        <Select value={sort} onValueChange={(v) => updateParam("sort", v ?? "rating")}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rating">Rating</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="mrr">Est. MRR</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No apps found. Run <code className="rounded bg-muted px-1.5 py-0.5 text-sm">pnpm crawl:apps</code> to collect app data.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((app) => (
            <AppCard key={app.id} app={app} />
          ))}
        </div>
      )}
    </div>
  )
}

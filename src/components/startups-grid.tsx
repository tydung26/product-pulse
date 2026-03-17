"use client"

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
import { StartupCard } from "@/components/startup-card"
import type { Startup } from "@/lib/types/database"

type Props = {
  startups: Startup[]
}

export function StartupsGrid({ startups }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const search = searchParams.get("search") ?? ""
  const source = searchParams.get("source") ?? "all"
  const sort = searchParams.get("sort") ?? "upvotes"

  const updateParam = useCallback(
    (key: string, value: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (value && value !== "all") {
        params.set(key, value)
      } else {
        params.delete(key)
      }
      router.push(`/startups?${params.toString()}`)
    },
    [router, searchParams]
  )

  let filtered = startups
  if (search) {
    const q = search.toLowerCase()
    filtered = filtered.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        (s.tagline?.toLowerCase().includes(q) ?? false)
    )
  }
  if (source !== "all") {
    filtered = filtered.filter((s) => s.source === source)
  }

  filtered = [...filtered].sort((a, b) => {
    if (sort === "name") return a.name.localeCompare(b.name)
    if (sort === "date") {
      return (
        new Date(b.launched_at ?? 0).getTime() -
        new Date(a.launched_at ?? 0).getTime()
      )
    }
    return b.upvotes - a.upvotes // default: upvotes
  })

  return (
    <div>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <Input
          placeholder="Search startups..."
          defaultValue={search}
          onChange={useDebouncedCallback((e: unknown) => updateParam("search", (e as React.ChangeEvent<HTMLInputElement>).target.value), 300)}
          className="sm:max-w-xs"
        />
        <Select value={source} onValueChange={(v) => updateParam("source", v ?? "all")}>
          <SelectTrigger className="sm:w-48">
            <SelectValue placeholder="Source" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Sources</SelectItem>
            <SelectItem value="yc">YC Launches</SelectItem>
            <SelectItem value="producthunt">Product Hunt</SelectItem>
            <SelectItem value="unikorn">Unikorn</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sort} onValueChange={(v) => updateParam("sort", v ?? "upvotes")}>
          <SelectTrigger className="sm:w-40">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="upvotes">Upvotes</SelectItem>
            <SelectItem value="date">Launch Date</SelectItem>
            <SelectItem value="name">Name</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No startups found. Run <code className="rounded bg-muted px-1.5 py-0.5 text-sm">pnpm crawl:apps</code> to collect startup data.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <StartupCard key={s.id} startup={s} />
          ))}
        </div>
      )}
    </div>
  )
}

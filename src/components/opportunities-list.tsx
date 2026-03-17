"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"
import { OpportunityCard } from "@/components/opportunity-card"
import type { Opportunity } from "@/lib/types/database"

type OpportunityWithCounts = Opportunity & { app_count?: number; startup_count?: number }

type Props = {
  opportunities: OpportunityWithCounts[]
}

const verdictButtons = ["all", "strong", "moderate", "weak"] as const

export function OpportunitiesList({ opportunities }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const verdict = searchParams.get("verdict") ?? "all"

  const updateVerdict = useCallback(
    (v: string) => {
      const params = new URLSearchParams(searchParams.toString())
      if (v !== "all") {
        params.set("verdict", v)
      } else {
        params.delete("verdict")
      }
      router.push(`/opportunities?${params.toString()}`)
    },
    [router, searchParams]
  )

  const filtered =
    verdict === "all"
      ? opportunities
      : opportunities.filter((o) => o.verdict === verdict)

  return (
    <div>
      <div className="mb-4 flex gap-1">
        {verdictButtons.map((v) => (
          <button
            key={v}
            onClick={() => updateVerdict(v)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              verdict === v
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {v === "all" ? "All" : v.charAt(0).toUpperCase() + v.slice(1)}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          No opportunities yet. Run{" "}
          <code className="rounded bg-muted px-1.5 py-0.5 text-sm">pnpm analyze --local-ai</code>{" "}
          after crawling.
        </p>
      ) : (
        <div className="space-y-4">
          {filtered.map((opp) => (
            <OpportunityCard key={opp.id} opportunity={opp} />
          ))}
        </div>
      )}
    </div>
  )
}

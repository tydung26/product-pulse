import { Suspense } from "react"
import { createSupabaseServer } from "@/lib/supabase/server"
import { OpportunitiesList } from "@/components/opportunities-list"
import { Skeleton } from "@/components/ui/skeleton"
import type { Opportunity } from "@/lib/types/database"

export default async function OpportunitiesPage() {
  const supabase = await createSupabaseServer()

  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("*")
    .order("score", { ascending: false })
    .limit(50)

  const typedOpps = (opportunities ?? []) as Opportunity[]
  const oppIds = typedOpps.map((o) => o.id)

  // Batch fetch counts in 2 queries instead of N+1
  const [{ data: appLinks }, { data: startupLinks }] = await Promise.all([
    oppIds.length > 0
      ? supabase.from("opportunity_apps").select("opportunity_id").in("opportunity_id", oppIds)
      : { data: [] },
    oppIds.length > 0
      ? supabase.from("opportunity_startups").select("opportunity_id").in("opportunity_id", oppIds)
      : { data: [] },
  ])

  // Group counts by opportunity_id in JS
  const appCounts = new Map<string, number>()
  for (const link of appLinks ?? []) {
    appCounts.set(link.opportunity_id, (appCounts.get(link.opportunity_id) ?? 0) + 1)
  }
  const startupCounts = new Map<string, number>()
  for (const link of startupLinks ?? []) {
    startupCounts.set(link.opportunity_id, (startupCounts.get(link.opportunity_id) ?? 0) + 1)
  }

  const oppsWithCounts = typedOpps.map((opp) => ({
    ...opp,
    app_count: appCounts.get(opp.id) ?? 0,
    startup_count: startupCounts.get(opp.id) ?? 0,
  }))

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <OpportunitiesList opportunities={oppsWithCounts} />
    </Suspense>
  )
}

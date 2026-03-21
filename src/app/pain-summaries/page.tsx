import { Suspense } from "react"
import { createSupabaseServer } from "@/lib/supabase/server"
import { PainSummariesList } from "@/components/pain-summaries-list"
import { Skeleton } from "@/components/ui/skeleton"
import type { App, AppPainSummary } from "@/lib/types/database"

export type PainSummaryWithApp = AppPainSummary & {
  app: Pick<App, "id" | "name" | "icon_url" | "store" | "category" | "avg_rating">
}

export default async function PainSummariesPage() {
  const supabase = await createSupabaseServer()

  const { data: summaries } = await supabase
    .from("app_pain_summaries")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100)

  const typedSummaries = (summaries ?? []) as AppPainSummary[]

  // Batch-fetch apps to avoid N+1
  const appIds = [...new Set(typedSummaries.map((s) => s.app_id))]
  const { data: apps } =
    appIds.length > 0
      ? await supabase
          .from("apps")
          .select("id, name, icon_url, store, category, avg_rating")
          .in("id", appIds)
      : { data: [] }

  const appMap = new Map<string, PainSummaryWithApp["app"]>()
  for (const app of apps ?? []) {
    appMap.set(app.id, app as PainSummaryWithApp["app"])
  }

  const summariesWithApps: PainSummaryWithApp[] = typedSummaries
    .filter((s) => appMap.has(s.app_id))
    .map((s) => ({ ...s, app: appMap.get(s.app_id)! }))

  // Extract unique categories for filter dropdown
  const categories = [
    ...new Set(summariesWithApps.map((s) => s.app.category).filter(Boolean)),
  ] as string[]

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <PainSummariesList
        summaries={summariesWithApps}
        categories={categories}
        total={summariesWithApps.length}
      />
    </Suspense>
  )
}

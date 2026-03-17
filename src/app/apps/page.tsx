import { Suspense } from "react"
import { createSupabaseServer } from "@/lib/supabase/server"
import { AppsGrid } from "@/components/apps-grid"
import { Skeleton } from "@/components/ui/skeleton"
import type { App } from "@/lib/types/database"

export default async function AppsPage() {
  const supabase = await createSupabaseServer()

  const { data: apps } = await supabase
    .from("apps")
    .select("*")
    .order("avg_rating", { ascending: false })
    .limit(100)

  const typedApps = (apps ?? []) as App[]

  // Extract unique categories for filter dropdown
  const categories = [...new Set(typedApps.map((a) => a.category).filter(Boolean))] as string[]

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <AppsGrid apps={typedApps} categories={categories} />
    </Suspense>
  )
}

import { Suspense } from "react"
import { createSupabaseServer } from "@/lib/supabase/server"
import { StartupsGrid } from "@/components/startups-grid"
import { Skeleton } from "@/components/ui/skeleton"
import type { Startup } from "@/lib/types/database"

export default async function StartupsPage() {
  const supabase = await createSupabaseServer()

  const { data: startups } = await supabase
    .from("startups")
    .select("*")
    .order("upvotes", { ascending: false })
    .limit(100)

  return (
    <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
      <StartupsGrid startups={(startups ?? []) as Startup[]} />
    </Suspense>
  )
}

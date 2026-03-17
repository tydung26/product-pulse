import { Suspense } from "react"
import { createSupabaseServer } from "@/lib/supabase/server"
import { OpportunitiesList } from "@/components/opportunities-list"
import type { Opportunity } from "@/lib/types/database"

export default async function OpportunitiesPage() {
  const supabase = await createSupabaseServer()

  // Fetch opportunities with app/startup counts via separate queries
  const { data: opportunities } = await supabase
    .from("opportunities")
    .select("*")
    .order("score", { ascending: false })
    .limit(50)

  const typedOpps = (opportunities ?? []) as Opportunity[]

  // Fetch counts for each opportunity
  const oppsWithCounts = await Promise.all(
    typedOpps.map(async (opp) => {
      const [{ count: appCount }, { count: startupCount }] = await Promise.all([
        supabase
          .from("opportunity_apps")
          .select("*", { count: "exact", head: true })
          .eq("opportunity_id", opp.id),
        supabase
          .from("opportunity_startups")
          .select("*", { count: "exact", head: true })
          .eq("opportunity_id", opp.id),
      ])

      return {
        ...opp,
        app_count: appCount ?? 0,
        startup_count: startupCount ?? 0,
      }
    })
  )

  return (
    <Suspense>
      <OpportunitiesList opportunities={oppsWithCounts} />
    </Suspense>
  )
}

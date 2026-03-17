import { notFound } from "next/navigation"
import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SafeImage } from "@/components/safe-image"
import { StarRating } from "@/components/star-rating"
import { verdictColor } from "@/lib/constants"
import type { App, StoreReview, Opportunity } from "@/lib/types/database"

type Props = {
  params: Promise<{ id: string }>
}

export default async function AppDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServer()

  const { data: app } = await supabase
    .from("apps")
    .select("*")
    .eq("id", id)
    .single()

  if (!app) notFound()
  const typedApp = app as App

  const { data: reviews } = await supabase
    .from("store_reviews")
    .select("*")
    .eq("app_id", id)
    .order("review_date", { ascending: false })
    .limit(20)

  const typedReviews = (reviews ?? []) as StoreReview[]

  const { data: oppLinks } = await supabase
    .from("opportunity_apps")
    .select("opportunity_id, ai_comment")
    .eq("app_id", id)

  let typedOpps: (Opportunity & { ai_comment: string | null })[] = []
  if (oppLinks && oppLinks.length > 0) {
    const oppIds = oppLinks.map((l) => l.opportunity_id)
    const { data: opps } = await supabase
      .from("opportunities")
      .select("*")
      .in("id", oppIds)
      .order("score", { ascending: false })

    typedOpps = ((opps ?? []) as Opportunity[]).map((o) => ({
      ...o,
      ai_comment: oppLinks.find((l) => l.opportunity_id === o.id)?.ai_comment ?? null,
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex gap-4">
        <SafeImage src={typedApp.icon_url} alt={typedApp.name} size={64} className="rounded-xl" />
        <div>
          <h1 className="text-2xl font-semibold">{typedApp.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">
              {typedApp.store === "app_store" ? "App Store" : "Google Play"}
            </Badge>
            <span className="text-sm text-muted-foreground">{typedApp.category}</span>
            <span className="text-sm text-muted-foreground">{typedApp.price ?? "Free"}</span>
          </div>
          <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
            <StarRating rating={typedApp.avg_rating} />
            {typedApp.downloads !== null && (
              <span>{typedApp.downloads.toLocaleString()} downloads</span>
            )}
            {typedApp.estimated_mrr !== null && typedApp.estimated_mrr > 0 && (
              <span>~${Math.round(typedApp.estimated_mrr).toLocaleString()}/mo</span>
            )}
          </div>
        </div>
      </div>

      {typedApp.description && (
        <p className="max-w-2xl text-sm text-muted-foreground">{typedApp.description.slice(0, 500)}</p>
      )}

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Reviews ({typedReviews.length})</h2>
        {typedReviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews yet.</p>
        ) : (
          <div className="space-y-3">
            {typedReviews.map((review) => (
              <Card key={review.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} />
                    {review.title && <span className="text-sm font-medium">{review.title}</span>}
                    <span className="text-xs text-muted-foreground">{review.author}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{review.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      <section>
        <h2 className="mb-3 text-lg font-medium">Opportunities ({typedOpps.length})</h2>
        {typedOpps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No opportunities linked to this app yet.</p>
        ) : (
          <div className="space-y-3">
            {typedOpps.map((opp) => (
              <Card key={opp.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">
                      <Link href="/opportunities" className="hover:underline">{opp.title}</Link>
                    </CardTitle>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{opp.score}</span>
                      <Badge className={verdictColor[opp.verdict] ?? ""}>{opp.verdict}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{opp.description}</p>
                  {opp.ai_comment && (
                    <p className="mt-2 text-sm italic text-muted-foreground">AI: {opp.ai_comment}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

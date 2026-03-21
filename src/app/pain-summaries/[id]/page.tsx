import { notFound } from "next/navigation"
import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SafeImage } from "@/components/safe-image"
import { StarRating } from "@/components/star-rating"
import { PainThemeBar } from "@/components/pain-theme-bar"
import type { App, AppPainSummary } from "@/lib/types/database"

type Props = {
  params: Promise<{ id: string }>
}

export default async function PainSummaryDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServer()

  const { data: summary } = await supabase
    .from("app_pain_summaries")
    .select("*")
    .eq("id", id)
    .single()

  if (!summary) notFound()
  const typedSummary = summary as AppPainSummary

  const { data: app } = await supabase
    .from("apps")
    .select("*")
    .eq("id", typedSummary.app_id)
    .single()

  if (!app) notFound()
  const typedApp = app as App

  // Fetch recent low-rated reviews linked to this app
  const { data: reviews } = await supabase
    .from("store_reviews")
    .select("id, rating, title, body, author, review_date")
    .eq("app_id", typedSummary.app_id)
    .lte("rating", 3)
    .order("review_date", { ascending: false })
    .limit(15)

  const typedReviews = (reviews ?? []) as Array<{
    id: string
    rating: number
    title: string | null
    body: string
    author: string | null
    review_date: string | null
  }>

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/pain-summaries"
        className="text-sm text-muted-foreground hover:text-foreground"
      >
        &larr; Back to Pain Summaries
      </Link>

      {/* App header */}
      <div className="flex gap-4">
        <SafeImage src={typedApp.icon_url} alt={typedApp.name} size={64} className="rounded-xl" />
        <div>
          <h1 className="text-2xl font-semibold">{typedApp.name}</h1>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              {typedApp.store === "app_store" ? "App Store" : "Google Play"}
            </Badge>
            {typedApp.category && (
              <span className="text-sm text-muted-foreground">{typedApp.category}</span>
            )}
            <StarRating rating={typedApp.avg_rating} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {typedSummary.total_reviews} reviews analyzed &middot;{" "}
            {typedSummary.themes.length}{" "}
            {typedSummary.themes.length === 1 ? "pain theme" : "pain themes"}
          </p>
        </div>
      </div>

      <div className="flex gap-3">
        <Link
          href={`/apps/${typedApp.id}`}
          className="text-sm text-muted-foreground underline-offset-2 hover:underline"
        >
          View app detail &rarr;
        </Link>
        {typedApp.store_url && (
          <a
            href={typedApp.store_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-muted-foreground underline-offset-2 hover:underline"
          >
            Open in store &rarr;
          </a>
        )}
      </div>

      <Separator />

      {/* Pain themes — all expanded */}
      <section>
        <h2 className="mb-4 text-lg font-medium">Pain Themes</h2>
        {typedSummary.themes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No themes extracted yet.</p>
        ) : (
          <div className="space-y-4">
            {typedSummary.themes.map((theme, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <PainThemeBar theme={theme} expanded={true} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Sample reviews */}
      <section>
        <h2 className="mb-3 text-lg font-medium">
          Recent Low-Rated Reviews ({typedReviews.length})
        </h2>
        {typedReviews.length === 0 ? (
          <p className="text-sm text-muted-foreground">No reviews found.</p>
        ) : (
          <div className="space-y-3">
            {typedReviews.map((review) => (
              <Card key={review.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <StarRating rating={review.rating} />
                    {review.title && (
                      <CardTitle className="text-sm">{review.title}</CardTitle>
                    )}
                    {review.author && (
                      <span className="text-xs text-muted-foreground">{review.author}</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{review.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

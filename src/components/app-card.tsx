import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SafeImage } from "@/components/safe-image"
import { StarRating } from "@/components/star-rating"
import type { App } from "@/lib/types/database"

export function AppCard({ app }: { app: App }) {
  return (
    <Link href={`/apps/${app.id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="flex gap-3 p-4">
          <SafeImage src={app.icon_url} alt={app.name} size={48} />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-medium">{app.name}</h3>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {app.store === "app_store" ? "iOS" : "Android"}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">{app.category ?? "Uncategorized"}</p>
            <div className="mt-1 flex items-center gap-3">
              <StarRating rating={app.avg_rating} />
              <span className="text-xs text-muted-foreground">{app.price ?? "Free"}</span>
            </div>
            {app.estimated_mrr !== null && app.estimated_mrr > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                ~${Math.round(app.estimated_mrr).toLocaleString()}/mo
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

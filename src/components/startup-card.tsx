import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { SafeImage } from "@/components/safe-image"
import type { Startup } from "@/lib/types/database"

const sourceLabel: Record<string, string> = {
  yc: "YC",
  producthunt: "PH",
  unikorn: "Unikorn",
}

export function StartupCard({ startup }: { startup: Startup }) {
  return (
    <Link href={`/startups/${startup.id}`}>
      <Card className="transition-colors hover:bg-muted/50">
        <CardContent className="flex gap-3 p-4">
          <SafeImage src={startup.logo_url} alt={startup.name} size={48} className="object-cover" />
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-medium">{startup.name}</h3>
              <Badge variant="secondary" className="shrink-0 text-xs">
                {sourceLabel[startup.source] ?? startup.source}
              </Badge>
            </div>
            {startup.tagline && (
              <p className="truncate text-xs text-muted-foreground">{startup.tagline}</p>
            )}
            <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
              {startup.upvotes > 0 && <span>▲ {startup.upvotes}</span>}
              {startup.category && <span>{startup.category}</span>}
              {startup.funding_stage && <span>{startup.funding_stage}</span>}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

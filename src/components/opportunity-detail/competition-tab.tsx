import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { SafeImage } from "@/components/safe-image"
import type { Startup } from "@/lib/types/database"

type StartupLink = {
  opportunity_id: string
  startup_id: string
  ai_comment: string | null
  role: "competitor" | "inspiration" | "related"
  startup: Startup | null
}

type Props = {
  startupLinks: StartupLink[]
}

const ROLE_COLORS: Record<string, string> = {
  competitor: "bg-red-100 text-red-800",
  inspiration: "bg-blue-100 text-blue-800",
  related: "bg-gray-100 text-gray-800",
}

export function CompetitionTab({ startupLinks }: Props) {
  if (startupLinks.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        No competitive landscape data available.
      </p>
    )
  }

  // Sort: competitors first, then inspiration, then related
  const roleOrder = { competitor: 0, inspiration: 1, related: 2 }
  const sorted = [...startupLinks].sort(
    (a, b) => (roleOrder[a.role] ?? 3) - (roleOrder[b.role] ?? 3)
  )

  return (
    <div className="space-y-3">
      {sorted.map((link) => {
        const s = link.startup
        return (
          <Card key={link.startup_id}>
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                {s?.logo_url && (
                  <SafeImage src={s.logo_url} alt={s?.name ?? ""} size={40} className="rounded-md shrink-0" />
                )}
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-sm">{s?.name ?? "Unknown startup"}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        ROLE_COLORS[link.role] ?? "bg-gray-100 text-gray-800"
                      }`}
                    >
                      {link.role}
                    </span>
                    {s?.source && (
                      <Badge variant="secondary" className="text-xs">{s.source}</Badge>
                    )}
                  </div>
                  {s?.tagline && (
                    <p className="text-xs text-muted-foreground">{s.tagline}</p>
                  )}
                  {link.ai_comment && (
                    <p className="text-xs text-muted-foreground border-l-2 border-muted pl-2 mt-1">
                      {link.ai_comment}
                    </p>
                  )}
                  {s?.url && (
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-foreground underline-offset-2 hover:underline"
                    >
                      Visit &rarr;
                    </a>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

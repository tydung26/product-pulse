import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { verdictColor } from "@/lib/constants"
import type { Opportunity } from "@/lib/types/database"

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="w-20 text-muted-foreground">{label}</span>
      <div className="h-1.5 flex-1 rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-foreground/60"
          style={{ width: `${value}%` }}
        />
      </div>
      <span className="w-6 text-right font-medium">{value}</span>
    </div>
  )
}

type Props = {
  opportunity: Opportunity & { app_count?: number; startup_count?: number }
}

export function OpportunityCard({ opportunity: opp }: Props) {
  return (
    <Link href={`/opportunities/${opp.id}`} className="block">
    <Card className="transition-colors hover:bg-muted/50">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">{opp.title}</CardTitle>
            {opp.category && (
              <span className="text-xs text-muted-foreground">{opp.category}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{opp.score}</span>
            <Badge className={verdictColor[opp.verdict] ?? ""}>
              {opp.verdict}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">{opp.description}</p>

        <div className="space-y-1">
          <ScoreBar label="Pain" value={opp.pain_severity} />
          <ScoreBar label="Market" value={opp.market_size} />
          <ScoreBar label="Competition" value={opp.competition} />
        </div>

        {opp.pain_summary.length > 0 && (
          <div>
            <p className="text-xs font-medium">Pain signals:</p>
            <ul className="ml-4 list-disc text-xs text-muted-foreground">
              {opp.pain_summary.slice(0, 3).map((p, i) => (
                <li key={i}>{p}</li>
              ))}
            </ul>
          </div>
        )}

        {opp.solution_angles.length > 0 && (
          <div>
            <p className="text-xs font-medium">Solution ideas:</p>
            <ul className="ml-4 list-disc text-xs text-muted-foreground">
              {opp.solution_angles.slice(0, 2).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex gap-3 text-xs text-muted-foreground">
          {opp.app_count !== undefined && <span>{opp.app_count} apps</span>}
          {opp.startup_count !== undefined && <span>{opp.startup_count} startups</span>}
        </div>
      </CardContent>
    </Card>
    </Link>
  )
}

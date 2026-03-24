import type { Opportunity } from "@/lib/types/database"

type ScoreBreakdown = {
  pain_reasoning?: string
  market_reasoning?: string
  competition_reasoning?: string
  wtp_bonus?: number
}

type Props = {
  opportunity: Opportunity
}

function DimensionBar({
  label,
  value,
  reasoning,
  inverted,
}: {
  label: string
  value: number
  reasoning?: string
  inverted?: boolean
}) {
  // For competition: lower is better, so bar shows inverse
  const displayWidth = inverted ? 100 - value : value
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-3 text-sm">
        <span className="w-24 font-medium">{label}</span>
        <div className="h-2 flex-1 rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-foreground/60 transition-all"
            style={{ width: `${displayWidth}%` }}
          />
        </div>
        <span className="w-8 text-right font-bold">{value}</span>
      </div>
      {reasoning && (
        <p className="ml-27 pl-[124px] text-xs text-muted-foreground">{reasoning}</p>
      )}
    </div>
  )
}

export function ScoreBreakdown({ opportunity: opp }: Props) {
  const bd = (opp.score_breakdown ?? {}) as ScoreBreakdown

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Score Breakdown
      </h2>
      <div className="space-y-3">
        <DimensionBar
          label="Pain"
          value={opp.pain_severity}
          reasoning={bd.pain_reasoning}
        />
        <DimensionBar
          label="Market"
          value={opp.market_size}
          reasoning={bd.market_reasoning}
        />
        <DimensionBar
          label="Competition"
          value={opp.competition}
          reasoning={bd.competition_reasoning}
          inverted
        />
      </div>
      {opp.wtp_count > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm">
          <span className="font-medium text-emerald-800">WTP signals:</span>
          <span className="text-emerald-700">{opp.wtp_count} posts expressing willingness to pay</span>
        </div>
      )}
      {bd.wtp_bonus !== undefined && bd.wtp_bonus > 0 && (
        <p className="text-xs text-muted-foreground">WTP bonus: +{bd.wtp_bonus} points applied</p>
      )}
    </div>
  )
}

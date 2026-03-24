import { SOURCE_COLORS } from "@/components/community-post-card"
import { cn } from "@/lib/utils"

type Props = {
  sourceCount: Record<string, number>
}

const SOURCE_LABELS: Record<string, string> = {
  reddit: "Reddit",
  hn: "HN",
  indie_hackers: "IH",
  producthunt: "PH",
  yc: "YC",
  app_store: "App Store",
  google_play: "Google Play",
}

export function SourceDistribution({ sourceCount }: Props) {
  const entries = Object.entries(sourceCount).filter(([, count]) => count > 0)
  if (entries.length === 0) return null

  const total = entries.reduce((sum, [, c]) => sum + c, 0)

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Sources:</span>
      {entries.map(([source, count]) => (
        <span
          key={source}
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
            SOURCE_COLORS[source] ?? "bg-gray-100 text-gray-800"
          )}
        >
          {SOURCE_LABELS[source] ?? source}
          <span className="opacity-70">{count}</span>
        </span>
      ))}
      <span className="text-xs text-muted-foreground">{total} total signals</span>
    </div>
  )
}

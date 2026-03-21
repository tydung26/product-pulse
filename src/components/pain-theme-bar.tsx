"use client"

import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

type Theme = {
  theme: string
  severity: number
  review_count: number
  example_quotes: string[]
}

type Props = {
  theme: Theme
  expanded?: boolean
}

// Returns Tailwind color class based on severity score (0-100)
function severityColor(severity: number): string {
  if (severity > 70) return "bg-red-500"
  if (severity >= 40) return "bg-yellow-400"
  return "bg-green-500"
}

function severityLabel(severity: number): string {
  if (severity > 70) return "High"
  if (severity >= 40) return "Medium"
  return "Low"
}

function severityBadgeClass(severity: number): string {
  if (severity > 70) return "bg-red-100 text-red-800"
  if (severity >= 40) return "bg-yellow-100 text-yellow-800"
  return "bg-green-100 text-green-800"
}

export function PainThemeBar({ theme, expanded = false }: Props) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">{theme.theme}</span>
        <div className="flex shrink-0 items-center gap-1.5">
          <Badge className={cn("text-xs", severityBadgeClass(theme.severity))}>
            {severityLabel(theme.severity)} ({theme.severity})
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {theme.review_count} {theme.review_count === 1 ? "review" : "reviews"}
          </Badge>
        </div>
      </div>

      {/* Severity bar */}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full transition-all", severityColor(theme.severity))}
          style={{ width: `${theme.severity}%` }}
        />
      </div>

      {/* Example quotes */}
      {expanded && theme.example_quotes.length > 0 && (
        <ul className="mt-2 space-y-1">
          {theme.example_quotes.slice(0, 3).map((q, i) => (
            <li key={i} className="text-xs italic text-muted-foreground before:mr-1 before:content-['\u201c']">
              {q}&rdquo;
            </li>
          ))}
        </ul>
      )}

      {/* Collapsed: show first quote truncated */}
      {!expanded && theme.example_quotes.length > 0 && (
        <p className="truncate text-xs italic text-muted-foreground">
          &ldquo;{theme.example_quotes[0]}&rdquo;
        </p>
      )}
    </div>
  )
}

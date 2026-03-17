// Shared star rating display component
export function StarRating({ rating }: { rating: number | null }) {
  if (rating === null) return <span className="text-xs text-muted-foreground">No rating</span>
  return (
    <span className="text-sm font-medium">
      {"★".repeat(Math.round(rating))}
      {"☆".repeat(5 - Math.round(rating))}
      <span className="ml-1 text-muted-foreground">{rating.toFixed(1)}</span>
    </span>
  )
}

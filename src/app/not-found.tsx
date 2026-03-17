import Link from "next/link"

export default function NotFoundPage() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <h2 className="text-lg font-semibold">Not Found</h2>
      <p className="text-sm text-muted-foreground">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link
        href="/apps"
        className="rounded-md bg-foreground px-4 py-2 text-sm text-background hover:bg-foreground/90"
      >
        Go to Apps
      </Link>
    </div>
  )
}

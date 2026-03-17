import { notFound } from "next/navigation"
import Link from "next/link"
import { createSupabaseServer } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { SafeImage } from "@/components/safe-image"
import { verdictColor } from "@/lib/constants"
import type { Startup, StartupComment, Opportunity } from "@/lib/types/database"

type Props = {
  params: Promise<{ id: string }>
}

const sourceLabel: Record<string, string> = {
  yc: "YC Launches",
  producthunt: "Product Hunt",
  unikorn: "Unikorn",
}

export default async function StartupDetailPage({ params }: Props) {
  const { id } = await params
  const supabase = await createSupabaseServer()

  const { data: startup } = await supabase
    .from("startups")
    .select("*")
    .eq("id", id)
    .single()

  if (!startup) notFound()
  const typed = startup as Startup

  // Fetch comments
  const { data: comments } = await supabase
    .from("startup_comments")
    .select("*")
    .eq("startup_id", id)
    .order("posted_at", { ascending: false })

  const typedComments = (comments ?? []) as StartupComment[]

  // Fetch linked opportunities
  const { data: oppLinks } = await supabase
    .from("opportunity_startups")
    .select("opportunity_id, ai_comment, role")
    .eq("startup_id", id)

  let typedOpps: (Opportunity & { ai_comment: string | null; role: string })[] = []
  if (oppLinks && oppLinks.length > 0) {
    const oppIds = oppLinks.map((l) => l.opportunity_id)
    const { data: opps } = await supabase
      .from("opportunities")
      .select("*")
      .in("id", oppIds)
      .order("score", { ascending: false })

    typedOpps = ((opps ?? []) as Opportunity[]).map((o) => {
      const link = oppLinks.find((l) => l.opportunity_id === o.id)
      return { ...o, ai_comment: link?.ai_comment ?? null, role: link?.role ?? "related" }
    })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex gap-4">
        <SafeImage src={typed.logo_url} alt={typed.name} size={64} className="rounded-xl object-cover" />
        <div>
          <h1 className="text-2xl font-semibold">{typed.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <Badge variant="secondary">{sourceLabel[typed.source] ?? typed.source}</Badge>
            {typed.category && <span className="text-sm text-muted-foreground">{typed.category}</span>}
            {typed.upvotes > 0 && <span className="text-sm text-muted-foreground">▲ {typed.upvotes}</span>}
          </div>
          {typed.tagline && <p className="mt-1 text-sm text-muted-foreground">{typed.tagline}</p>}
          {typed.funding_stage && (
            <p className="mt-1 text-xs text-muted-foreground">Funding: {typed.funding_stage}</p>
          )}
        </div>
      </div>

      {typed.description && (
        <p className="max-w-2xl text-sm text-muted-foreground">{typed.description}</p>
      )}

      {typed.url && (
        <a href={typed.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline">
          Visit website →
        </a>
      )}

      <Separator />

      {/* Comments */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Comments ({typedComments.length})</h2>
        {typedComments.length === 0 ? (
          <p className="text-sm text-muted-foreground">No comments available.</p>
        ) : (
          <div className="space-y-3">
            {typedComments.map((c) => (
              <Card key={c.id}>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{c.author ?? "Anonymous"}</span>
                    {c.posted_at && <span>{new Date(c.posted_at).toLocaleDateString()}</span>}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{c.body}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <Separator />

      {/* Linked Opportunities */}
      <section>
        <h2 className="mb-3 text-lg font-medium">Opportunities ({typedOpps.length})</h2>
        {typedOpps.length === 0 ? (
          <p className="text-sm text-muted-foreground">No opportunities linked to this startup yet.</p>
        ) : (
          <div className="space-y-3">
            {typedOpps.map((opp) => (
              <Card key={opp.id}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base">
                        <Link href="/opportunities" className="hover:underline">{opp.title}</Link>
                      </CardTitle>
                      <Badge variant="outline" className="mt-1 text-xs">{opp.role}</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{opp.score}</span>
                      <Badge className={verdictColor[opp.verdict] ?? ""}>{opp.verdict}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <p className="text-sm text-muted-foreground">{opp.description}</p>
                  {opp.ai_comment && (
                    <p className="mt-2 text-sm italic text-muted-foreground">AI: {opp.ai_comment}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

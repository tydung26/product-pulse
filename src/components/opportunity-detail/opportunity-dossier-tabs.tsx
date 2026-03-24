"use client"

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { EvidenceTab } from "@/components/opportunity-detail/evidence-tab"
import { CompetitionTab } from "@/components/opportunity-detail/competition-tab"
import { WtpSignals } from "@/components/opportunity-detail/wtp-signals"
import type { StoreReview, CommunityPost, Opportunity, Startup } from "@/lib/types/database"

type ReviewEvidence = {
  opportunity_id: string
  review_id: string
  quote: string | null
  relevance: string | null
  review: StoreReview | null
}

type CommunityEvidence = {
  opportunity_id: string
  community_post_id: string
  quote: string | null
  relevance: string | null
  post: CommunityPost | null
}

type StartupLink = {
  opportunity_id: string
  startup_id: string
  ai_comment: string | null
  role: "competitor" | "inspiration" | "related"
  startup: Startup | null
}

type Props = {
  opportunity: Opportunity
  reviewEvidence: ReviewEvidence[]
  communityEvidence: CommunityEvidence[]
  startupLinks: StartupLink[]
}

export function OpportunityDossierTabs({
  opportunity,
  reviewEvidence,
  communityEvidence,
  startupLinks,
}: Props) {
  const evidenceCount = reviewEvidence.length + communityEvidence.length

  return (
    <Tabs defaultValue="evidence">
      <TabsList>
        <TabsTrigger value="evidence">
          Evidence {evidenceCount > 0 && `(${evidenceCount})`}
        </TabsTrigger>
        <TabsTrigger value="competition">
          Competition {startupLinks.length > 0 && `(${startupLinks.length})`}
        </TabsTrigger>
        <TabsTrigger value="wtp">
          WTP {opportunity.wtp_count > 0 && `(${opportunity.wtp_count})`}
        </TabsTrigger>
      </TabsList>

      <TabsContent value="evidence" className="mt-4">
        <EvidenceTab
          reviewEvidence={reviewEvidence}
          communityEvidence={communityEvidence}
        />
      </TabsContent>

      <TabsContent value="competition" className="mt-4">
        <CompetitionTab startupLinks={startupLinks} />
      </TabsContent>

      <TabsContent value="wtp" className="mt-4">
        <WtpSignals
          wtpCount={opportunity.wtp_count}
          communityEvidence={communityEvidence}
        />
      </TabsContent>
    </Tabs>
  )
}

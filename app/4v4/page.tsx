import type { Metadata } from "next"
import { ScoreboardClient } from "@/components/scoreboard-client"
import { buildScoreboardInviteMetadata } from "@/lib/scoreboard-invite-metadata"

type PageProps = {
  searchParams: Promise<{ room?: string | string[] }>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams
  return buildScoreboardInviteMetadata("4v4", params.room)
}

export default function Page() {
  return <ScoreboardClient />
}

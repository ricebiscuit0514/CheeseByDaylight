import type { Metadata } from "next"
import { FivePlayerModeClient } from "@/components/five-player-mode-client"
import { buildScoreboardInviteMetadata } from "@/lib/scoreboard-invite-metadata"

type PageProps = {
  searchParams: Promise<{ room?: string | string[] }>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams
  return buildScoreboardInviteMetadata("5p", params.room)
}

export default function Page() {
  return <FivePlayerModeClient />
}

import type { Metadata } from "next"
import { headers } from "next/headers"
import { FivePlayerModeClient } from "@/components/five-player-mode-client"
import { buildScoreboardInviteMetadata } from "@/lib/scoreboard-invite-metadata"

type PageProps = {
  searchParams: Promise<{ room?: string | string[] }>
}

export async function generateMetadata({
  searchParams,
}: PageProps): Promise<Metadata> {
  const params = await searchParams
  const requestHeaders = await headers()
  return buildScoreboardInviteMetadata("5p", params.room, requestHeaders)
}

export default function Page() {
  return <FivePlayerModeClient />
}

import type { Metadata } from "next"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { JoinInviteLanding } from "@/components/join-invite-landing"
import { isInviteCrawler } from "@/lib/invite-crawler"
import {
  ROOM_QUERY_PARAM,
  parseInviteRoomToken,
} from "@/lib/scoreboard-invite"
import { buildJoinInviteMetadata } from "@/lib/scoreboard-invite-metadata"

type PageProps = {
  params: Promise<{ token: string }>
}

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { token } = await params
  return buildJoinInviteMetadata("/join/4v4", token)
}

export default async function JoinFourVFourPage({ params }: PageProps) {
  const { token } = await params
  const roomToken = parseInviteRoomToken(token)
  if (!roomToken) redirect("/4v4")

  const userAgent = (await headers()).get("user-agent")
  if (!isInviteCrawler(userAgent)) {
    redirect(`/4v4?${ROOM_QUERY_PARAM}=${encodeURIComponent(roomToken)}`)
  }

  return <JoinInviteLanding />
}

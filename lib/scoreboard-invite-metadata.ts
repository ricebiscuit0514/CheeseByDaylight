import type { Metadata } from "next"
import { parseInviteRoomToken } from "@/lib/scoreboard-invite"

const INVITE_TITLE = "치즈 바이 데이라이트 | 점수판 연동하기"
const INVITE_DESCRIPTION = "진행자의 실시간 점수판에 참가합니다."

function resolveInviteMetadataBase() {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (siteUrl) return new URL(siteUrl)

  const vercelUrl = process.env.VERCEL_URL?.trim()
  if (vercelUrl) return new URL(`https://${vercelUrl}`)

  return undefined
}

export function buildJoinInviteMetadata(
  joinPath: string,
  tokenParam: string,
): Metadata {
  const roomToken = parseInviteRoomToken(tokenParam)
  if (!roomToken) return {}

  const invitePath = `${joinPath}/${roomToken}`

  return {
    metadataBase: resolveInviteMetadataBase(),
    title: INVITE_TITLE,
    description: INVITE_DESCRIPTION,
    openGraph: {
      title: INVITE_TITLE,
      description: INVITE_DESCRIPTION,
      url: invitePath,
      siteName: "Cheese by Daylight",
      locale: "ko_KR",
      type: "website",
    },
    twitter: {
      card: "summary",
      title: INVITE_TITLE,
      description: INVITE_DESCRIPTION,
    },
    alternates: {
      canonical: invitePath,
    },
  }
}

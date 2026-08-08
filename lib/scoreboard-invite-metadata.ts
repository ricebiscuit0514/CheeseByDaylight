import type { Metadata } from "next"
import {
  ROOM_QUERY_PARAM,
  parseInviteRoomToken,
  type ScoreboardGameMode,
} from "@/lib/firebase/scoreboard-room"
import { getRequestOrigin } from "@/lib/request-origin"

const INVITE_TITLE = "치즈 바이 데이라이트 | 점수판 연동하기"
const INVITE_DESCRIPTION = "진행자의 실시간 점수판에 참가합니다."

const INVITE_PATHS: Record<ScoreboardGameMode, string> = {
  "4v4": "/4v4",
  "5p": "/1v4",
}

export function buildScoreboardInviteMetadata(
  gameMode: ScoreboardGameMode,
  roomParam: string | string[] | null | undefined,
  requestHeaders: Headers,
): Metadata {
  const roomValue = Array.isArray(roomParam) ? roomParam[0] : roomParam
  const roomToken = parseInviteRoomToken(roomValue)
  if (!roomToken) return {}

  const origin = getRequestOrigin(requestHeaders)
  if (!origin) return {}

  const inviteUrl = `${origin}${INVITE_PATHS[gameMode]}?${ROOM_QUERY_PARAM}=${encodeURIComponent(roomToken)}`

  return {
    title: INVITE_TITLE,
    description: INVITE_DESCRIPTION,
    openGraph: {
      title: INVITE_TITLE,
      description: INVITE_DESCRIPTION,
      url: inviteUrl,
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
      canonical: inviteUrl,
    },
  }
}

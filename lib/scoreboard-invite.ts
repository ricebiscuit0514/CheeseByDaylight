export const ROOM_QUERY_PARAM = "room"

const ROOM_TOKEN_PATTERN = /^[a-f0-9]{48,128}$/i

export function parseInviteRoomToken(
  queryRoom: string | null | undefined,
  hash: string | null | undefined = null,
): string | null {
  const fromQuery = queryRoom?.trim()
  if (fromQuery && ROOM_TOKEN_PATTERN.test(fromQuery)) {
    return fromQuery.toLowerCase()
  }

  const hashMatch = hash?.match(/^#room=([a-f0-9]{48,128})$/i)
  return hashMatch ? hashMatch[1].toLowerCase() : null
}

export const SCOREBOARD_JOIN_PATHS = {
  "4v4": "/join/4v4",
  "5p": "/join/1v4",
} as const

export type ScoreboardJoinGameMode = keyof typeof SCOREBOARD_JOIN_PATHS

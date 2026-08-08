import type { Player } from "@/components/player-row"

export type ScoreAnimationStyle = "four-v-four" | "five-player"

export type ScoreAnimationState = {
  anim: Record<string, number>
  prevKillsMap: Record<string, number>
}

export function buildScoreAnimationPatch(
  previousPlayers: Player[],
  nextPlayers: Player[],
  currentAnim: Record<string, number>,
  currentPrevKills: Record<string, number>,
  style: ScoreAnimationStyle,
): ScoreAnimationState {
  const anim = { ...currentAnim }
  const prevKillsMap = { ...currentPrevKills }
  const previousById = new Map(previousPlayers.map((player) => [player.id, player]))

  for (const next of nextPlayers) {
    const prev = previousById.get(next.id)
    if (!prev) continue

    if (!next.played && next.kills === 0) {
      anim[next.id] = 0
      delete prevKillsMap[next.id]
      continue
    }

    if (prev.kills === next.kills && prev.played === next.played) continue

    if (
      style === "four-v-four" &&
      next.played &&
      next.kills === 0 &&
      prev.kills !== 0
    ) {
      continue
    }

    if (prev.kills !== next.kills) {
      prevKillsMap[next.id] = style === "four-v-four" ? 0 : prev.kills
      anim[next.id] = (anim[next.id] ?? 0) + 1
    }
  }

  const nextIds = new Set(nextPlayers.map((player) => player.id))
  for (const id of Object.keys(anim)) {
    if (!nextIds.has(id)) {
      delete anim[id]
      delete prevKillsMap[id]
    }
  }

  return { anim, prevKillsMap }
}

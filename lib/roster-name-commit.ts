import {
  migrateKillerPicksOnNameCommit,
  type FearlessPlayer,
} from "./fearless"

type RosterClearablePlayer = FearlessPlayer & {
  kills: number
  played: boolean
}

export function clearPlayerRosterField<T extends RosterClearablePlayer>(
  player: T,
): T {
  const nameBeforeClear = player.name.trim()
  const picks = player.killerPicks ?? []
  const nextPicks =
    nameBeforeClear.length > 0 && picks.length > 0
      ? picks.map((pick) => ({
          ...pick,
          playerName: pick.playerName.trim() || nameBeforeClear,
        }))
      : picks

  return {
    ...player,
    name: "",
    kills: 0,
    played: false,
    ...(nextPicks.length > 0 ? { killerPicks: nextPicks } : {}),
  }
}

export function applyFourVFourNameCommit<T extends FearlessPlayer>(
  thomas: readonly T[],
  ada: readonly T[],
  targetPlayerId: string,
  committedName: string,
  previousTargetName: string,
): { thomas: T[]; ada: T[] } {
  const cleanName = committedName.trim()
  const thomasIds = new Set(thomas.map((player) => player.id))
  const migrated = migrateKillerPicksOnNameCommit(
    [...thomas, ...ada],
    targetPlayerId,
    cleanName,
    previousTargetName,
  )
  const withName = migrated.map((player) =>
    player.id === targetPlayerId ? { ...player, name: cleanName } : player,
  )

  return {
    thomas: withName.filter((player) => thomasIds.has(player.id)),
    ada: withName.filter((player) => !thomasIds.has(player.id)),
  }
}

export function applyFivePlayerNameCommit<T extends FearlessPlayer>(
  players: readonly T[],
  targetPlayerId: string,
  committedName: string,
  previousTargetName: string,
): T[] {
  const cleanName = committedName.trim()
  const migrated = migrateKillerPicksOnNameCommit(
    players,
    targetPlayerId,
    cleanName,
    previousTargetName,
  )
  return migrated.map((player) =>
    player.id === targetPlayerId ? { ...player, name: cleanName } : player,
  )
}

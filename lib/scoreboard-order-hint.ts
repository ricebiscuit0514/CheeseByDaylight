export const DRAG_HINT_SEEN_4V4_KEY = "dbd-drag-hint-seen-4v4"

export type PlayableItem = {
  id?: string
  played: boolean
}

/**
 * Checks if a player at a given index in a team's roster was entered out of order
 * (i.e. this player has played: true, but at least one player before them has played: false).
 */
export function isPlayerEnteredOutOfOrder<T extends PlayableItem>(
  roster: readonly T[],
  index: number
): boolean {
  if (index <= 0 || index >= roster.length) return false
  const current = roster[index]
  if (!current || !current.played) return false
  return roster.slice(0, index).some((prev) => !prev.played)
}

/**
 * Finds the ID of the first player entered out of order in a roster.
 */
export function getFirstOutOfOrderPlayerId<T extends PlayableItem & { id: string }>(
  roster: readonly T[]
): string | null {
  for (let i = 1; i < roster.length; i++) {
    if (isPlayerEnteredOutOfOrder(roster, i)) {
      return roster[i].id
    }
  }
  return null
}

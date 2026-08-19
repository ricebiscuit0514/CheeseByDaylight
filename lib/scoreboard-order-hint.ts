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

/**
 * Automatically repositions a player to the top of the unplayed queue when their score is entered.
 * If the player was not yet played (played === false) and there are unplayed players before them,
 * swaps the player with the first unplayed slot in the roster.
 * If the player is already marked as played, updates their properties in place without reordering.
 */
export function autoLineupRosterOnScore<T extends { id: string; played: boolean }>(
  roster: readonly T[],
  scoredPlayerId: string,
  updatedProperties: Partial<T>,
): T[] {
  const currentIndex = roster.findIndex((p) => p.id === scoredPlayerId)
  if (currentIndex === -1) return [...roster]

  const currentPlayer = roster[currentIndex]

  // If the player was already marked as played, do not reorder. Just update their properties in place.
  if (currentPlayer.played) {
    return roster.map((p, idx) =>
      idx === currentIndex ? { ...p, ...updatedProperties } : p,
    )
  }

  // Find the first unplayed slot in the roster.
  const firstUnplayedIndex = roster.findIndex((p) => !p.played)

  // If there are no unplayed slots or the player is already at the first unplayed slot, update without swap.
  if (firstUnplayedIndex === -1 || firstUnplayedIndex === currentIndex) {
    return roster.map((p, idx) =>
      idx === currentIndex ? { ...p, ...updatedProperties } : p,
    )
  }

  // Swap currentIndex with firstUnplayedIndex.
  const next = [...roster]
  const targetSlotPlayer = next[firstUnplayedIndex]
  const updatedScoredPlayer = { ...currentPlayer, ...updatedProperties }

  next[firstUnplayedIndex] = updatedScoredPlayer
  next[currentIndex] = targetSlotPlayer

  return next
}

/**
 * Automatically packs played players continuously at the top when a score is cancelled.
 * Sets the cancelled player's kills to 0 and played to false.
 * If there are remaining played players, they are pulled to the top preserving relative order,
 * followed by unplayed players preserving their relative order.
 */
export function autoLineupRosterOnCancel<T extends { id: string; played: boolean; kills?: number }>(
  roster: readonly T[],
  cancelledPlayerId: string,
): T[] {
  const currentIndex = roster.findIndex((p) => p.id === cancelledPlayerId)
  if (currentIndex === -1) return [...roster]

  const updated = roster.map((p, idx) =>
    idx === currentIndex ? { ...p, kills: 0, played: false } : p,
  )

  const playedPlayers = updated.filter((p) => p.played)
  const unplayedPlayers = updated.filter((p) => !p.played)

  return [...playedPlayers, ...unplayedPlayers]
}



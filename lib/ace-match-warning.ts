export const ACE_KILL_STEPS = [1, 2, 3, 3.5, 4] as const
export const ACE_MAX_KILLS = 4

export type AceMatchNotice = {
  killText: string
  suffix: string
}

function formatKillStep(kills: number): string {
  return Number.isInteger(kills) ? String(kills) : kills.toFixed(1)
}

/** Smallest valid ace-match kill total strictly above the opponent's score. */
export function minAceKillsToWin(opponentKills: number): number | null {
  const step = ACE_KILL_STEPS.find((value) => value > opponentKills)
  return step ?? null
}

/** Smallest valid ace-match kill total that ties the opponent's score. */
export function minAceKillsToTie(opponentKills: number): number {
  const step = ACE_KILL_STEPS.find((value) => value >= opponentKills)
  return step ?? ACE_MAX_KILLS
}

/** Builds the remaining player's ace-match notice from the opponent's current kills. */
export function buildAceMatchNotice(opponentKills: number): AceMatchNotice {
  const winNeed = minAceKillsToWin(opponentKills)

  if (winNeed !== null) {
    if (winNeed >= ACE_MAX_KILLS) {
      return { killText: "올킬", suffix: "을 하면 우승입니다" }
    }
    return {
      killText: `${formatKillStep(winNeed)}킬`,
      suffix: " 이상 하면 우승입니다",
    }
  }

  const tieNeed = minAceKillsToTie(opponentKills)
  if (tieNeed >= ACE_MAX_KILLS) {
    return { killText: "올킬", suffix: "을 하면 동점입니다" }
  }
  return {
    killText: `${formatKillStep(tieNeed)}킬`,
    suffix: " 이상 하면 동점입니다",
  }
}

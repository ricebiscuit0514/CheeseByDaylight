import type { Player } from "@/components/player-row"

export type AceModalStep =
  | "prompt"
  | "method_select"
  | "manual_select"
  | "random_slot"
  | null

export type AceLockedTeams = {
  thomas: boolean
  ada: boolean
}

export type AceSlotSettleStyle = "overshoot" | "undershoot"

export type AceSlotSpinPlan = {
  targetThomasIdx: number
  targetAdaIdx: number
  thomasMaxSteps: number
  adaMaxSteps: number
  startThomasActiveIdx: number
  startAdaActiveIdx: number
  spinToken: number
  lockThomas: boolean
  lockAda: boolean
  /** Past the winner, then snap back. */
  thomasSettleStyle: AceSlotSettleStyle
  /** Stop short of the winner, then snap forward. */
  adaSettleStyle: AceSlotSettleStyle
}

export type AceModalSyncState = {
  step: Exclude<AceModalStep, null>
  selectedThomasId: string | null
  selectedAdaId: string | null
  slotThomasIdx: number
  slotAdaIdx: number
  isRolling: boolean
  slotFinished: boolean
  excludedIds: Record<string, boolean>
  slotLockedTeams: AceLockedTeams
  slotSpinToken: number
  slotSpinPlan: AceSlotSpinPlan | null
}

export const DEFAULT_ACE_LOCKED_TEAMS: AceLockedTeams = {
  thomas: false,
  ada: false,
}

export const DEFAULT_ACE_MODAL_SYNC: AceModalSyncState = {
  step: "prompt",
  selectedThomasId: null,
  selectedAdaId: null,
  slotThomasIdx: 0,
  slotAdaIdx: 0,
  isRolling: false,
  slotFinished: false,
  excludedIds: {},
  slotLockedTeams: DEFAULT_ACE_LOCKED_TEAMS,
  slotSpinToken: 0,
  slotSpinPlan: null,
}

export function buildExcludedIdsFromList(ids: readonly string[]) {
  return Object.fromEntries(ids.map((id) => [id, true]))
}

export function mergeAceDrawExcludedIds(
  previous: readonly string[],
  next: readonly string[],
): string[] {
  return [...new Set([...previous, ...next].filter(Boolean))]
}

export type AceRerollButtonState =
  | { kind: "draw" }
  | { kind: "reroll-all" }
  | { kind: "reroll-team"; team: "thomas" | "ada"; teamName: string }
  | { kind: "hidden" }

export function getAceRerollButtonState(
  lockedTeams: AceLockedTeams,
  thomasName: string,
  adaName: string,
  slotFinished: boolean,
): AceRerollButtonState {
  if (!slotFinished) return { kind: "draw" }
  if (lockedTeams.thomas && lockedTeams.ada) return { kind: "hidden" }
  if (lockedTeams.thomas) {
    return {
      kind: "reroll-team",
      team: "ada",
      teamName: adaName.trim() || "아다",
    }
  }
  if (lockedTeams.ada) {
    return {
      kind: "reroll-team",
      team: "thomas",
      teamName: thomasName.trim() || "토마스",
    }
  }
  return { kind: "reroll-all" }
}

/** @deprecated Use getAceRerollButtonState for rendered labels. */
export function getAceRerollButtonLabel(
  lockedTeams: AceLockedTeams,
  thomasName: string,
  adaName: string,
  slotFinished: boolean,
): string | null {
  const state = getAceRerollButtonState(
    lockedTeams,
    thomasName,
    adaName,
    slotFinished,
  )
  if (state.kind === "hidden") return null
  if (state.kind === "draw") return "추첨하기"
  if (state.kind === "reroll-all") return "다시 뽑기"
  return `${state.teamName}팀 다시 추첨하기`
}

export function aceSetupToModalSync(
  ace: {
    setupStep: AceModalStep
    setupSelectedThomasId: string | null
    setupSelectedAdaId: string | null
    setupSlotThomasIdx: number
    setupSlotAdaIdx: number
    setupSlotRolling: boolean
    setupSlotFinished: boolean
    setupSlotExcludedIds: string[]
    setupSlotLockedTeams: AceLockedTeams
    setupSlotSpinToken: number
    setupSlotSpinPlan: AceSlotSpinPlan | null
  },
): AceModalSyncState | null {
  if (!ace.setupStep) return null
  return {
    step: ace.setupStep,
    selectedThomasId: ace.setupSelectedThomasId,
    selectedAdaId: ace.setupSelectedAdaId,
    slotThomasIdx: ace.setupSlotThomasIdx,
    slotAdaIdx: ace.setupSlotAdaIdx,
    isRolling: ace.setupSlotRolling,
    slotFinished: ace.setupSlotFinished,
    excludedIds: Object.fromEntries(
      ace.setupSlotExcludedIds.map((id) => [id, true]),
    ),
    slotLockedTeams: ace.setupSlotLockedTeams,
    slotSpinToken: ace.setupSlotSpinToken,
    slotSpinPlan: ace.setupSlotSpinPlan,
  }
}

export function aceModalSyncToSetup(
  modal: AceModalSyncState,
): {
  setupStep: AceModalStep
  setupSelectedThomasId: string | null
  setupSelectedAdaId: string | null
  setupSlotThomasIdx: number
  setupSlotAdaIdx: number
  setupSlotRolling: boolean
  setupSlotFinished: boolean
  setupSlotExcludedIds: string[]
  setupSlotLockedTeams: AceLockedTeams
  setupSlotSpinToken: number
  setupSlotSpinPlan: AceSlotSpinPlan | null
} {
  return {
    setupStep: modal.step,
    setupSelectedThomasId: modal.selectedThomasId,
    setupSelectedAdaId: modal.selectedAdaId,
    setupSlotThomasIdx: modal.slotThomasIdx,
    setupSlotAdaIdx: modal.slotAdaIdx,
    setupSlotRolling: modal.isRolling,
    setupSlotFinished: modal.slotFinished,
    setupSlotExcludedIds: Object.keys(modal.excludedIds).filter(
      (id) => modal.excludedIds[id],
    ),
    setupSlotLockedTeams: modal.slotLockedTeams,
    setupSlotSpinToken: modal.slotSpinToken,
    setupSlotSpinPlan: modal.slotSpinPlan,
  }
}

function getSecureRandomInt(max: number): number {
  if (max <= 1) return 0
  const array = new Uint32Array(1)
  crypto.getRandomValues(array)
  return array[0] % max
}

export function getActiveRoster(
  roster: Player[],
  excludedIds: Record<string, boolean>,
) {
  const eligible = roster.filter((player) => !excludedIds[player.id])
  return eligible.length > 0 ? eligible : roster
}

export function pickInitialSlotIndices(
  thomas: Player[],
  ada: Player[],
  excludedIds: Record<string, boolean>,
) {
  const activeThomas = getActiveRoster(thomas, excludedIds)
  const activeAda = getActiveRoster(ada, excludedIds)
  const randThomas = activeThomas[getSecureRandomInt(activeThomas.length)]
  const randAda = activeAda[getSecureRandomInt(activeAda.length)]
  return {
    slotThomasIdx: thomas.findIndex((player) => player.id === randThomas.id),
    slotAdaIdx: ada.findIndex((player) => player.id === randAda.id),
  }
}

export function buildSlotSpinPlan(
  thomas: Player[],
  ada: Player[],
  excludedIds: Record<string, boolean>,
  slotThomasIdx: number,
  slotAdaIdx: number,
  spinToken: number,
  lockedTeams: AceLockedTeams = DEFAULT_ACE_LOCKED_TEAMS,
): AceSlotSpinPlan | null {
  if (thomas.length === 0 || ada.length === 0) return null
  if (lockedTeams.thomas && lockedTeams.ada) return null

  const activeThomas = getActiveRoster(thomas, excludedIds)
  const activeAda = getActiveRoster(ada, excludedIds)
  const tActiveLen = activeThomas.length
  const aActiveLen = activeAda.length

  let targetThomasIdx = slotThomasIdx
  let targetAdaIdx = slotAdaIdx
  let thomasMaxSteps = 0
  let adaMaxSteps = 0
  let startThomasActiveIdx = 0
  let startAdaActiveIdx = 0

  if (lockedTeams.thomas) {
    const lockedPlayer = thomas[slotThomasIdx]
    startThomasActiveIdx = activeThomas.findIndex(
      (player) => player.id === lockedPlayer?.id,
    )
    if (startThomasActiveIdx === -1) startThomasActiveIdx = 0
    targetThomasIdx = slotThomasIdx
  } else {
    const randTIdx = getSecureRandomInt(activeThomas.length)
    const chosenThomas = activeThomas[randTIdx]
    targetThomasIdx = thomas.findIndex((player) => player.id === chosenThomas.id)

    startThomasActiveIdx = activeThomas.findIndex(
      (player) => player.id === thomas[slotThomasIdx]?.id,
    )
    if (startThomasActiveIdx === -1) startThomasActiveIdx = 0

    const tStepsToTarget =
      (randTIdx - startThomasActiveIdx + tActiveLen * 10) % tActiveLen ||
      tActiveLen
    thomasMaxSteps = tStepsToTarget
  }

  if (lockedTeams.ada) {
    const lockedPlayer = ada[slotAdaIdx]
    startAdaActiveIdx = activeAda.findIndex(
      (player) => player.id === lockedPlayer?.id,
    )
    if (startAdaActiveIdx === -1) startAdaActiveIdx = 0
    targetAdaIdx = slotAdaIdx
  } else {
    const randAIdx = getSecureRandomInt(activeAda.length)
    const chosenAda = activeAda[randAIdx]
    targetAdaIdx = ada.findIndex((player) => player.id === chosenAda.id)

    startAdaActiveIdx = activeAda.findIndex(
      (player) => player.id === ada[slotAdaIdx]?.id,
    )
    if (startAdaActiveIdx === -1) startAdaActiveIdx = 0

    const aStepsToTarget =
      (randAIdx - startAdaActiveIdx + aActiveLen * 10) % aActiveLen ||
      aActiveLen
    adaMaxSteps = aStepsToTarget
  }

  // Same spin speed both sides; randomly decide who stops first when both roll.
  const sharedLoops = 5 + getSecureRandomInt(2)
  const lateExtraLoops = 2 + getSecureRandomInt(2)
  if (!lockedTeams.thomas && !lockedTeams.ada) {
    const thomasStopsFirst = getSecureRandomInt(2) === 0
    thomasMaxSteps +=
      tActiveLen * (sharedLoops + (thomasStopsFirst ? 0 : lateExtraLoops))
    adaMaxSteps +=
      aActiveLen * (sharedLoops + (thomasStopsFirst ? lateExtraLoops : 0))
  } else {
    if (!lockedTeams.thomas) thomasMaxSteps += tActiveLen * sharedLoops
    if (!lockedTeams.ada) adaMaxSteps += aActiveLen * sharedLoops
  }

  const pickSettleStyle = (): AceSlotSettleStyle =>
    getSecureRandomInt(2) === 0 ? "overshoot" : "undershoot"

  return {
    targetThomasIdx,
    targetAdaIdx,
    thomasMaxSteps,
    adaMaxSteps,
    startThomasActiveIdx,
    startAdaActiveIdx,
    spinToken,
    lockThomas: lockedTeams.thomas,
    lockAda: lockedTeams.ada,
    thomasSettleStyle: pickSettleStyle(),
    adaSettleStyle: pickSettleStyle(),
  }
}

export const SLOT_REEL_OVERSHOOT_MS = 220
/** Extra pause after both reels have landed, before swapping back to roster. */
export const SLOT_REEL_HOLD_MS = 1000
export const SLOT_SPIN_BASE_DELAY_MS = 55

export function getSlotStepDelayMs(remaining: number, baseDelay = 38): number {
  if (remaining <= 6) {
    return baseDelay + Math.pow(6 - remaining + 1, 2) * 18
  }
  return baseDelay
}

/** Matches the host/viewer step-delay curve used by runSlotSpinAnimation. */
export function estimateSlotSpinDurationMs(
  maxSteps: number,
  baseDelay = 38,
): number {
  if (maxSteps <= 0) return 0
  if (maxSteps === 1) return SLOT_REEL_OVERSHOOT_MS
  let total = 0
  // Delays are scheduled after steps 1..maxSteps-1 (last step does not schedule).
  for (let step = 1; step < maxSteps; step += 1) {
    total += getSlotStepDelayMs(maxSteps - step, baseDelay)
  }
  return total + SLOT_REEL_OVERSHOOT_MS
}

/** Time until both reels have finished their visual settle (no hold). */
export function estimateDualSlotSpinDurationMs(
  thomasMaxSteps: number,
  adaMaxSteps: number,
  baseDelay = SLOT_SPIN_BASE_DELAY_MS,
): number {
  return Math.max(
    estimateSlotSpinDurationMs(thomasMaxSteps, baseDelay),
    estimateSlotSpinDurationMs(adaMaxSteps, baseDelay),
  )
}

export function runSlotSpinAnimation(
  thomas: Player[],
  ada: Player[],
  excludedIds: Record<string, boolean>,
  plan: AceSlotSpinPlan,
  onUpdate: (state: {
    slotThomasIdx: number
    slotAdaIdx: number
    isRolling: boolean
    slotFinished: boolean
  }) => void,
) {
  const activeThomas = getActiveRoster(thomas, excludedIds)
  const activeAda = getActiveRoster(ada, excludedIds)
  const tActiveLen = activeThomas.length
  const aActiveLen = activeAda.length

  let thomasStep = 0
  let adaStep = 0
  let thomasDone = plan.lockThomas || plan.thomasMaxSteps === 0
  let adaDone = plan.lockAda || plan.adaMaxSteps === 0
  let curTIdx = plan.startThomasActiveIdx
  let curAIdx = plan.startAdaActiveIdx
  let cancelled = false
  const spinStartedAt = performance.now()
  const visualDurationMs = estimateDualSlotSpinDurationMs(
    thomasDone ? 0 : plan.thomasMaxSteps,
    adaDone ? 0 : plan.adaMaxSteps,
    SLOT_SPIN_BASE_DELAY_MS,
  )

  const finish = () => {
    // Wait until the slower reel has settled, then hold so the land shine is visible.
    const elapsed = performance.now() - spinStartedAt
    const wait = Math.max(
      0,
      visualDurationMs + SLOT_REEL_HOLD_MS - elapsed,
    )
    window.setTimeout(() => {
      if (cancelled) return
      onUpdate({
        slotThomasIdx: plan.targetThomasIdx,
        slotAdaIdx: plan.targetAdaIdx,
        isRolling: false,
        slotFinished: true,
      })
    }, wait)
  }

  onUpdate({
    slotThomasIdx: thomas.findIndex(
      (player) => player.id === activeThomas[curTIdx]?.id,
    ),
    slotAdaIdx: ada.findIndex((player) => player.id === activeAda[curAIdx]?.id),
    isRolling: true,
    slotFinished: false,
  })

  if (thomasDone && adaDone) {
    finish()
    return () => {
      cancelled = true
    }
  }

  const rollThomas = () => {
    if (cancelled || plan.lockThomas) return
    thomasStep += 1
    curTIdx = (curTIdx + 1) % tActiveLen
    const nextPlayer = activeThomas[curTIdx]
    onUpdate({
      slotThomasIdx: thomas.findIndex((player) => player.id === nextPlayer.id),
      slotAdaIdx: ada.findIndex((player) => player.id === activeAda[curAIdx]?.id),
      isRolling: true,
      slotFinished: false,
    })

    if (thomasStep >= plan.thomasMaxSteps) {
      thomasDone = true
      if (adaDone) finish()
      return
    }

    const remaining = plan.thomasMaxSteps - thomasStep
    window.setTimeout(
      rollThomas,
      getSlotStepDelayMs(remaining, SLOT_SPIN_BASE_DELAY_MS),
    )
  }

  const rollAda = () => {
    if (cancelled || plan.lockAda) return
    adaStep += 1
    curAIdx = (curAIdx + 1) % aActiveLen
    const nextPlayer = activeAda[curAIdx]
    onUpdate({
      slotThomasIdx: thomas.findIndex(
        (player) => player.id === activeThomas[curTIdx]?.id,
      ),
      slotAdaIdx: ada.findIndex((player) => player.id === nextPlayer.id),
      isRolling: true,
      slotFinished: false,
    })

    if (adaStep >= plan.adaMaxSteps) {
      adaDone = true
      if (thomasDone) finish()
      return
    }

    const remaining = plan.adaMaxSteps - adaStep
    window.setTimeout(
      rollAda,
      getSlotStepDelayMs(remaining, SLOT_SPIN_BASE_DELAY_MS),
    )
  }

  if (!thomasDone) rollThomas()
  if (!adaDone) rollAda()

  return () => {
    cancelled = true
  }
}

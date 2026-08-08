import type { Player } from "@/components/player-row"

export type AceModalStep =
  | "prompt"
  | "method_select"
  | "manual_select"
  | "random_slot"
  | null

export type AceSlotSpinPlan = {
  targetThomasIdx: number
  targetAdaIdx: number
  thomasMaxSteps: number
  adaMaxSteps: number
  startThomasActiveIdx: number
  startAdaActiveIdx: number
  spinToken: number
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
  slotSpinToken: number
  slotSpinPlan: AceSlotSpinPlan | null
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
  slotSpinToken: 0,
  slotSpinPlan: null,
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
): AceSlotSpinPlan | null {
  if (thomas.length === 0 || ada.length === 0) return null

  const activeThomas = getActiveRoster(thomas, excludedIds)
  const activeAda = getActiveRoster(ada, excludedIds)
  const randTIdx = getSecureRandomInt(activeThomas.length)
  const randAIdx = getSecureRandomInt(activeAda.length)
  const chosenThomas = activeThomas[randTIdx]
  const chosenAda = activeAda[randAIdx]
  const targetThomasIdx = thomas.findIndex((player) => player.id === chosenThomas.id)
  const targetAdaIdx = ada.findIndex((player) => player.id === chosenAda.id)

  const tActiveLen = activeThomas.length
  const aActiveLen = activeAda.length

  let startThomasActiveIdx = activeThomas.findIndex(
    (player) => player.id === thomas[slotThomasIdx]?.id,
  )
  if (startThomasActiveIdx === -1) startThomasActiveIdx = 0

  let startAdaActiveIdx = activeAda.findIndex(
    (player) => player.id === ada[slotAdaIdx]?.id,
  )
  if (startAdaActiveIdx === -1) startAdaActiveIdx = 0

  const tStepsToTarget =
    (randTIdx - startThomasActiveIdx + tActiveLen * 10) % tActiveLen
  const aStepsToTarget =
    (randAIdx - startAdaActiveIdx + aActiveLen * 10) % aActiveLen

  const thomasMaxSteps =
    (tStepsToTarget === 0 ? tActiveLen : tStepsToTarget) +
    tActiveLen * (3 + getSecureRandomInt(2))
  const adaMaxSteps =
    (aStepsToTarget === 0 ? aActiveLen : aStepsToTarget) +
    aActiveLen * (4 + getSecureRandomInt(2))

  return {
    targetThomasIdx,
    targetAdaIdx,
    thomasMaxSteps,
    adaMaxSteps,
    startThomasActiveIdx,
    startAdaActiveIdx,
    spinToken,
  }
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
  let thomasDone = false
  let adaDone = false
  let curTIdx = plan.startThomasActiveIdx
  let curAIdx = plan.startAdaActiveIdx
  let cancelled = false

  const finish = () => {
    onUpdate({
      slotThomasIdx: plan.targetThomasIdx,
      slotAdaIdx: plan.targetAdaIdx,
      isRolling: false,
      slotFinished: true,
    })
  }

  onUpdate({
    slotThomasIdx: thomas.findIndex(
      (player) => player.id === activeThomas[curTIdx]?.id,
    ),
    slotAdaIdx: ada.findIndex((player) => player.id === activeAda[curAIdx]?.id),
    isRolling: true,
    slotFinished: false,
  })

  const rollThomas = () => {
    if (cancelled) return
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
    let delay = 38
    if (remaining <= 4) {
      delay = 38 + Math.pow(4 - remaining + 1, 2) * 14
    }
    window.setTimeout(rollThomas, delay)
  }

  const rollAda = () => {
    if (cancelled) return
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
    let delay = 44
    if (remaining <= 4) {
      delay = 44 + Math.pow(4 - remaining + 1, 2) * 14
    }
    window.setTimeout(rollAda, delay)
  }

  rollThomas()
  rollAda()

  return () => {
    cancelled = true
  }
}

import { describe, expect, it } from "vitest"
import type { Player } from "@/components/player-row"
import {
  aceModalSyncToSetup,
  aceSetupToModalSync,
  buildExcludedIdsFromList,
  buildSlotSpinPlan,
  DEFAULT_ACE_LOCKED_TEAMS,
  estimateSlotSpinDurationMs,
  estimateDualSlotSpinDurationMs,
  getAceRerollButtonLabel,
  getAceRerollButtonState,
  buildNextAceRematchExcludedIds,
  mergeAceDrawExcludedIds,
  SLOT_REEL_OVERSHOOT_MS,
} from "@/lib/ace-modal-sync"

const thomas: Player[] = [
  { id: "t1", name: "T1", kills: 0, played: false },
  { id: "t2", name: "T2", kills: 0, played: false },
]
const ada: Player[] = [
  { id: "a1", name: "A1", kills: 0, played: false },
  { id: "a2", name: "A2", kills: 0, played: false },
]

describe("ace modal sync helpers", () => {
  it("builds reroll labels from lock state", () => {
    expect(
      getAceRerollButtonState(DEFAULT_ACE_LOCKED_TEAMS, "토마스", "아다", false),
    ).toEqual({ kind: "draw" })
    expect(
      getAceRerollButtonState(DEFAULT_ACE_LOCKED_TEAMS, "토마스", "아다", true),
    ).toEqual({ kind: "reroll-all" })
    expect(
      getAceRerollButtonState(
        { thomas: true, ada: false },
        "토마스",
        "아다",
        true,
      ),
    ).toEqual({ kind: "reroll-team", team: "ada", teamName: "아다" })
    expect(
      getAceRerollButtonLabel(
        { thomas: true, ada: false },
        "토마스",
        "아다",
        true,
      ),
    ).toBe("아다팀 다시 추첨하기")
    expect(
      getAceRerollButtonState(
        { thomas: true, ada: true },
        "토마스",
        "아다",
        true,
      ),
    ).toEqual({ kind: "hidden" })
  })

  it("roundtrips locked teams through setup sync", () => {
    const modal = aceSetupToModalSync({
      setupStep: "random_slot",
      setupSelectedThomasId: null,
      setupSelectedAdaId: null,
      setupSlotThomasIdx: 1,
      setupSlotAdaIdx: 0,
      setupSlotRolling: false,
      setupSlotFinished: true,
      setupSlotExcludedIds: ["t1", "a2"],
      setupSlotLockedTeams: { thomas: true, ada: false },
      setupSlotSpinToken: 2,
      setupSlotSpinPlan: null,
    })
    expect(modal?.slotLockedTeams).toEqual({ thomas: true, ada: false })
    expect(modal?.excludedIds).toEqual({ t1: true, a2: true })

    const setup = aceModalSyncToSetup(modal!)
    expect(setup.setupSlotLockedTeams).toEqual({ thomas: true, ada: false })
    expect(setup.setupSlotExcludedIds).toEqual(["t1", "a2"])
  })

  it("keeps thomas target fixed when thomas is locked", () => {
    const plan = buildSlotSpinPlan(
      thomas,
      ada,
      buildExcludedIdsFromList([]),
      1,
      0,
      1,
      { thomas: true, ada: false },
    )
    expect(plan).not.toBeNull()
    expect(plan?.targetThomasIdx).toBe(1)
    expect(plan?.thomasMaxSteps).toBe(0)
    expect(plan?.lockThomas).toBe(true)
    expect(plan?.lockAda).toBe(false)
    expect(plan?.adaMaxSteps).toBeGreaterThan(0)
  })

  it("returns null when both teams are locked", () => {
    const plan = buildSlotSpinPlan(
      thomas,
      ada,
      buildExcludedIdsFromList([]),
      0,
      0,
      1,
      { thomas: true, ada: true },
    )
    expect(plan).toBeNull()
  })

  it("merges ace draw exclusions across rounds", () => {
    expect(mergeAceDrawExcludedIds(["t1", "a1"], ["t2", "a2"])).toEqual([
      "t1",
      "a1",
      "t2",
      "a2",
    ])
    expect(mergeAceDrawExcludedIds(["t1", "a1"], ["a1", "t2"])).toEqual([
      "t1",
      "a1",
      "t2",
    ])
  })

  it("replaces rematch exclusions so manual re-includes stick", () => {
    // Previously excluded t2 was re-included in the modal → drop from snapshot.
    expect(
      buildNextAceRematchExcludedIds(["t1"], ["t3", "a1"]),
    ).toEqual(["t1", "t3", "a1"])
    expect(
      buildNextAceRematchExcludedIds([], ["t1", "a1"]),
    ).toEqual(["t1", "a1"])
  })

  it("estimates spin duration from the step delay curve", () => {
    expect(estimateSlotSpinDurationMs(0)).toBe(0)
    expect(estimateSlotSpinDurationMs(1, 52)).toBe(SLOT_REEL_OVERSHOOT_MS)
    // After step 1 of 2: remaining=1 → 52 + 6^2 * 18
    expect(estimateSlotSpinDurationMs(2, 52)).toBe(
      52 + 36 * 18 + SLOT_REEL_OVERSHOOT_MS,
    )
    expect(estimateSlotSpinDurationMs(8, 52)).toBeGreaterThan(7 * 52)
  })

  it("uses the slower reel when estimating dual spin duration", () => {
    expect(estimateDualSlotSpinDurationMs(2, 8, 52)).toBe(
      estimateSlotSpinDurationMs(8, 52),
    )
    expect(estimateDualSlotSpinDurationMs(10, 3, 52)).toBe(
      estimateSlotSpinDurationMs(10, 52),
    )
  })
})

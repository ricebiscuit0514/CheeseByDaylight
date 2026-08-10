import { describe, expect, it } from "vitest"
import {
  createDefaultScoreboardState,
  fromWireState,
  normalizeFivePlayerState,
  normalizeFourVFourState,
  toWireState,
  type FivePlayerSyncState,
  type FourVFourSyncState,
} from "../lib/firebase/scoreboard-room"
import {
  createInitialPickerUi,
  nextPickerFeedback,
  nextPickerSelection,
} from "../lib/picker-ui-sync"

function createFourVFourState(): FourVFourSyncState {
  return createDefaultScoreboardState("4v4") as FourVFourSyncState
}

describe("scoreboard room fearless normalization", () => {
  it("migrates legacy 4v4 killer text for players and ace backups", () => {
    const state = createFourVFourState()
    state.thomas[0] = {
      ...state.thomas[0],
      killer: "Ghost Face",
    }
    state.ace.thomasBackup = {
      id: "backup",
      name: "Backup",
      kills: 0,
      played: false,
      killer: "Nurse",
    }

    const normalized = normalizeFourVFourState(state)

    expect(normalized.thomas[0].killerPicks).toEqual(["ghost-face"])
    expect(normalized.ace.thomasBackup?.killerPicks).toEqual(["nurse"])
    expect(normalized.thomas[0]).not.toHaveProperty("killer")
    expect(normalized.ace.thomasBackup).not.toHaveProperty("killer")

    const legacyWire = toWireState(createFourVFourState())
    if (legacyWire.mode !== "4v4" || !legacyWire.thomas) {
      throw new Error("Expected 4v4 wire state")
    }
    legacyWire.thomas[0] = {
      ...legacyWire.thomas[0],
      killer: "Ghost Face",
    }
    const restored = fromWireState(legacyWire)
    expect(restored?.mode === "4v4" ? restored.thomas[0].killerPicks : null).toEqual(
      ["ghost-face"],
    )
  })

  it("round-trips unique picks, dedupes same-player duplicates, and serializes bans as a map", () => {
    const state = createFourVFourState()
    state.thomas[0] = {
      ...state.thomas[0],
      killerPicks: ["nurse", "nurse", "ghost-face"],
    }
    state.thomas[1] = {
      ...state.thomas[1],
      killerPicks: ["nurse"],
    }
    state.killerBans = ["artist", "xenomorph"]

    const wire = toWireState(state)
    expect(wire.mode).toBe("4v4")
    if (wire.mode !== "4v4") throw new Error("Expected 4v4 wire state")
    expect(wire.thomas?.[0].killerPicks).toEqual(["nurse", "ghost-face"])
    expect(wire.thomas?.[1].killerPicks).toEqual(["nurse"])
    expect(wire.thomas?.[0]).not.toHaveProperty("killer")
    expect(wire.killerBans).toEqual({ artist: true, xenomorph: true })

    const restored = fromWireState(wire)
    expect(restored?.mode).toBe("4v4")
    if (!restored || restored.mode !== "4v4") {
      throw new Error("Expected restored 4v4 state")
    }
    expect(restored.thomas[0].killerPicks).toEqual(["nurse", "ghost-face"])
    expect(restored.thomas[1].killerPicks).toEqual(["nurse"])
    expect(restored.killerBans).toEqual(["artist", "xenomorph"])
  })

  it("round-trips synced picker ui highlight and feedback", () => {
    const state = createFourVFourState()
    state.pickerUi = nextPickerFeedback(
      nextPickerSelection(createInitialPickerUi(), "nurse"),
      "nurse",
      "ban",
      4321,
    )

    const wire = toWireState(state)
    expect(wire.mode).toBe("4v4")
    if (wire.mode !== "4v4") throw new Error("Expected 4v4 wire state")
    expect(wire.pickerUi).toEqual({
      selSeq: 2,
      fb: { k: "nurse", kind: "ban", t: 4321 },
    })

    const restored = fromWireState(wire)
    expect(restored?.mode).toBe("4v4")
    if (!restored || restored.mode !== "4v4") {
      throw new Error("Expected restored 4v4 state")
    }
    expect(restored.pickerUi).toEqual(state.pickerUi)
  })

  it("deduplicates bans and removes unknown catalog IDs", () => {
    const state = createFourVFourState()
    state.killerBans = [
      "nurse",
      "not-in-catalog",
      "nurse",
      "unknown",
    ]

    expect(normalizeFourVFourState(state).killerBans).toEqual([
      "nurse",
      "unknown",
    ])

    const wire = toWireState(createFourVFourState())
    if (wire.mode !== "4v4") throw new Error("Expected 4v4 wire state")
    expect(wire).not.toHaveProperty("killerBans")
    wire.killerBans = {
      nurse: true,
      "not-in-catalog": true,
    }
    const restored = fromWireState(wire)
    expect(restored?.mode === "4v4" ? restored.killerBans : null).toEqual([
      "nurse",
    ])
  })

  it("normalizes 5p killer picks and migrates legacy free-text killer ids", () => {
    const state: FivePlayerSyncState = {
      mode: "5p",
      players: [
        {
          id: "1",
          name: "Player",
          kills: 4,
          played: true,
          killer: "free text killer",
          killerPicks: ["nurse"],
        },
      ],
      receivingConfig: [5, 8, 10, 12, 15],
      givingConfig: [15, 12, 10, 8, 5],
      killerBans: ["ghost-face", "xenomorph"],
      pickerUi: nextPickerFeedback(
        createInitialPickerUi(),
        "nurse",
        "ban",
      ),
    }

    const normalized = normalizeFivePlayerState(state)
    expect(normalized.players[0].killerPicks).toEqual(["nurse"])
    expect(normalized.players[0]).not.toHaveProperty("killer")
    expect(normalized.killerBans).toEqual(["ghost-face", "xenomorph"])

    const wire = toWireState(state)
    expect(wire.mode === "5p" ? wire.killerBans : null).toEqual({
      "ghost-face": true,
      xenomorph: true,
    })

    const restored = fromWireState(wire)
    expect(
      restored?.mode === "5p" ? restored.players[0].killerPicks : null,
    ).toEqual(["nurse"])
    expect(restored?.mode === "5p" ? restored.killerBans : null).toEqual([
      "ghost-face",
      "xenomorph",
    ])
    expect(restored?.mode === "5p" ? restored.pickerUi.feedbackKind : null).toBe(
      "ban",
    )
  })

  it("round-trips 5p picker ui selection and feedback", () => {
    const state: FivePlayerSyncState = {
      mode: "5p",
      players: [
        {
          id: "1",
          name: "Player",
          kills: 0,
          played: false,
        },
      ],
      receivingConfig: [5, 8, 10, 12, 15],
      givingConfig: [15, 12, 10, 8, 5],
      killerBans: [],
      pickerUi: nextPickerSelection(createInitialPickerUi(), "nurse"),
    }

    const wire = toWireState(state)
    expect(wire.mode === "5p" ? wire.pickerUi : null).toEqual({
      sel: "nurse",
      selSeq: 1,
    })

    const restored = fromWireState(wire)
    expect(restored?.mode === "5p" ? restored.pickerUi : null).toEqual(
      state.pickerUi,
    )
  })
})

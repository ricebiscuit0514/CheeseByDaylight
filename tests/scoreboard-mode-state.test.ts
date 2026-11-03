import { describe, expect, it } from "vitest"
import type { Player } from "../components/player-row"
import {
  createDefaultScoreboardState,
  fromWireState,
  toWireState,
  type FourVFourSyncState,
  type FivePlayerSyncState,
  type ScoreboardGameMode,
  type ScoreboardSyncState,
} from "../lib/firebase/scoreboard-room"
import { prepareScoreboardModeSwitch } from "../lib/scoreboard-mode-state"

const NOW = 1_800_000_000_000

function createStorage() {
  const entries = new Map<string, string>()
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value) },
  }
}

function enterScore(state: ScoreboardSyncState, name: string, kills: number): ScoreboardSyncState {
  const update = (players: Player[]) => players.map((player, index) => index === 0 ? {
    ...player,
    name,
    kills,
    played: true,
    killerPicks: [{ killerId: "nurse", playerName: name }],
  } : player)
  return state.mode === "4v4"
    ? { ...state, thomas: update(state.thomas), firstAttackerId: state.thomas[0].id, thomasName: "Team A" }
    : { ...state, players: update(state.players), receivingConfig: [1, 2, 3, 4, 5] }
}

function expectScores(state: ScoreboardSyncState, name: string, kills: number) {
  // This is the state the host and viewers attach to after a mode switch.
  const received = fromWireState(toWireState(state))
  if (!received) throw new Error("Expected valid shared scoreboard")
  const player = received.mode === "4v4" ? received.thomas[0] : received.players[0]
  expect(player).toMatchObject({ name, kills, played: true, killerPicks: [{ killerId: "nurse", playerName: name }] })
}

describe("shared scoreboard mode persistence", () => {
  it.each(["4v4", "5p"] as const)(
    "preserves both scoreboards when leaving and returning to %s",
    (mode) => {
      const storage = createStorage()
      const other: ScoreboardGameMode = mode === "4v4" ? "5p" : "4v4"
      const original = enterScore(createDefaultScoreboardState(mode), "Original", 3)
      original.killerBans = ["artist"]
      const firstSwitch = prepareScoreboardModeSwitch(storage, original, other, NOW)
      const editedOther = enterScore(firstSwitch, "Other", 4)

      const returned = prepareScoreboardModeSwitch(storage, editedOther, mode, NOW + 100)
      expectScores(returned, "Original", 3)
      expect(returned.killerBans).toEqual(["artist"])
      if (returned.mode === "4v4") {
        expect(returned.thomasName).toBe("Team A")
        expect(returned.firstAttackerId).toBe(returned.thomas[0].id)
      } else {
        expect(returned.receivingConfig).toEqual([1, 2, 3, 4, 5])
      }

      const revisited = prepareScoreboardModeSwitch(storage, returned, other, NOW + 200)
      expectScores(revisited, "Other", 4)
    },
  )

  it("captures the latest score even before normal autosave has run", () => {
    const storage = createStorage()
    const before = enterScore(createDefaultScoreboardState("4v4"), "Player", 1)
    storage.setItem("dbd-scoreboard-v1", JSON.stringify({ ...before, updatedAt: NOW }))
    const latest = enterScore(before, "Player", 4)

    const other = prepareScoreboardModeSwitch(storage, latest, "5p", NOW + 1)
    const restored = prepareScoreboardModeSwitch(storage, other, "4v4", NOW + 2)
    expectScores(restored, "Player", 4)
  })

  it("restores the existing five-player autosave without a mode field", () => {
    const storage = createStorage()
    const five = enterScore(createDefaultScoreboardState("5p"), "Saved", 2) as FivePlayerSyncState
    const { mode, pickerUi, ...saved } = five
    void mode
    void pickerUi
    storage.setItem("dbd-5p-state-v2", JSON.stringify({ ...saved, updatedAt: NOW }))

    const restored = prepareScoreboardModeSwitch(storage, createDefaultScoreboardState("4v4"), "5p", NOW)
    expectScores(restored, "Saved", 2)
  })

  it("keeps intentional score resets and an empty roster instead of reviving an older match", () => {
    const storage = createStorage()
    const reset = createDefaultScoreboardState("5p") as FivePlayerSyncState
    reset.players = []
    const other = prepareScoreboardModeSwitch(storage, reset, "4v4", NOW)

    const restored = prepareScoreboardModeSwitch(storage, other, "5p", NOW + 1)
    expect(restored.mode === "5p" ? restored.players : null).toEqual([])
  })

  it("closes transient picker and ace setup UI while retaining scores and ace history", () => {
    const storage = createStorage()
    const four = enterScore(createDefaultScoreboardState("4v4"), "Ace", 3.5) as FourVFourSyncState
    four.pickerUi = { ...four.pickerUi, selectedKillerId: "nurse", selectionSeq: 2 }
    four.ace.setupStep = "method_select"
    four.ace.roundLog = [{ thomasPlayerName: "Ace", adaPlayerName: "Other", outcome: "tie", thomasKills: 4, adaKills: 4 }]
    const other = prepareScoreboardModeSwitch(storage, four, "5p", NOW)

    const restored = prepareScoreboardModeSwitch(storage, other, "4v4", NOW + 1) as FourVFourSyncState
    expectScores(restored, "Ace", 3.5)
    expect(restored.pickerUi.selectedKillerId).toBeNull()
    expect(restored.ace.setupStep).toBeNull()
    expect(restored.ace.roundLog).toEqual(four.ace.roundLog)
  })

  it("restores a finished tie with the same ace proceed state the host computes", () => {
    const storage = createStorage()
    const tied = createDefaultScoreboardState("4v4") as FourVFourSyncState
    tied.thomas = tied.thomas.map((player) => ({ ...player, played: true }))
    tied.ada = tied.ada.map((player) => ({ ...player, played: true }))
    tied.ace.setupStep = "prompt"
    tied.ace.showProceedButton = false
    const other = prepareScoreboardModeSwitch(storage, tied, "5p", NOW)

    const restored = prepareScoreboardModeSwitch(storage, other, "4v4", NOW + 1) as FourVFourSyncState
    expect(restored.ace.showProceedButton).toBe(true)
    expect(restored.ace.setupStep).toBeNull()
  })

  it.each([
    null,
    "{broken json",
    JSON.stringify({ updatedAt: NOW, players: "invalid" }),
    JSON.stringify({ mode: "4v4", updatedAt: NOW }),
    JSON.stringify({ updatedAt: NOW - 3 * 60 * 60 * 1000, players: [] }),
  ])("uses a fresh scoreboard when the target save is missing, invalid, or expired: %s", (raw) => {
    const storage = createStorage()
    if (raw !== null) storage.setItem("dbd-5p-state-v2", raw)
    const restored = prepareScoreboardModeSwitch(storage, createDefaultScoreboardState("4v4"), "5p", NOW)
    expect(restored).toEqual(createDefaultScoreboardState("5p"))
  })
})

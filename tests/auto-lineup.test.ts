import { describe, it, expect } from "vitest"
import { autoLineupRosterOnScore, autoLineupRosterOnCancel } from "@/lib/scoreboard-order-hint"

type TestPlayer = {
  id: string
  name: string
  kills: number
  played: boolean
}

describe("autoLineupRosterOnScore", () => {
  const createRoster = (): TestPlayer[] => [
    { id: "A", name: "Player A", kills: 0, played: false },
    { id: "B", name: "Player B", kills: 0, played: false },
    { id: "C", name: "Player C", kills: 0, played: false },
    { id: "D", name: "Player D", kills: 0, played: false },
  ]

  it("leaves order unchanged when scoring the first player in order (index 0)", () => {
    const roster = createRoster()
    const result = autoLineupRosterOnScore(roster, "A", { kills: 3, played: true })

    expect(result.map((p) => p.id)).toEqual(["A", "B", "C", "D"])
    expect(result[0]).toMatchObject({ id: "A", kills: 3, played: true })
    expect(result[1]).toMatchObject({ id: "B", played: false })
  })

  it("swaps with the 1st unplayed slot when scoring the 3rd player (C) when no one has played (A,B,C,D -> C,B,A,D)", () => {
    const roster = createRoster()
    const result = autoLineupRosterOnScore(roster, "C", { kills: 3, played: true })

    // C should move to slot 0, A moves to slot 2
    expect(result.map((p) => p.id)).toEqual(["C", "B", "A", "D"])
    expect(result[0]).toMatchObject({ id: "C", name: "Player C", kills: 3, played: true })
    expect(result[1]).toMatchObject({ id: "B", name: "Player B", kills: 0, played: false })
    expect(result[2]).toMatchObject({ id: "A", name: "Player A", kills: 0, played: false })
    expect(result[3]).toMatchObject({ id: "D", name: "Player D", kills: 0, played: false })
  })

  it("swaps with the next unplayed slot when some players are already played", () => {
    // Current state: C(played), B(unplayed), A(unplayed), D(unplayed)
    const roster: TestPlayer[] = [
      { id: "C", name: "Player C", kills: 3, played: true },
      { id: "B", name: "Player B", kills: 0, played: false },
      { id: "A", name: "Player A", kills: 0, played: false },
      { id: "D", name: "Player D", kills: 0, played: false },
    ]

    // Enter score for D (slot 3). First unplayed is B (slot 1).
    const result = autoLineupRosterOnScore(roster, "D", { kills: 2, played: true })

    // D should move to slot 1, B moves to slot 3
    expect(result.map((p) => p.id)).toEqual(["C", "D", "A", "B"])
    expect(result[0]).toMatchObject({ id: "C", kills: 3, played: true })
    expect(result[1]).toMatchObject({ id: "D", kills: 2, played: true })
    expect(result[2]).toMatchObject({ id: "A", kills: 0, played: false })
    expect(result[3]).toMatchObject({ id: "B", kills: 0, played: false })
  })

  it("does not reorder when scoring the immediately next unplayed player", () => {
    const roster: TestPlayer[] = [
      { id: "C", name: "Player C", kills: 3, played: true },
      { id: "D", name: "Player D", kills: 2, played: true },
      { id: "A", name: "Player A", kills: 0, played: false },
      { id: "B", name: "Player B", kills: 0, played: false },
    ]

    // Enter score for A (slot 2). First unplayed is A (slot 2).
    const result = autoLineupRosterOnScore(roster, "A", { kills: 4, played: true })

    expect(result.map((p) => p.id)).toEqual(["C", "D", "A", "B"])
    expect(result[2]).toMatchObject({ id: "A", kills: 4, played: true })
  })

  it("works with zero-kill score (played: true, kills: 0)", () => {
    const roster = createRoster()
    // Scoring zero kill on player D (slot 3)
    const result = autoLineupRosterOnScore(roster, "D", { kills: 0, played: true })

    expect(result.map((p) => p.id)).toEqual(["D", "B", "C", "A"])
    expect(result[0]).toMatchObject({ id: "D", kills: 0, played: true })
    expect(result[3]).toMatchObject({ id: "A", kills: 0, played: false })
  })

  it("does NOT change position when updating score of an already played player", () => {
    const roster: TestPlayer[] = [
      { id: "C", name: "Player C", kills: 3, played: true },
      { id: "D", name: "Player D", kills: 2, played: true },
      { id: "A", name: "Player A", kills: 0, played: false },
      { id: "B", name: "Player B", kills: 0, played: false },
    ]

    // Updating C's score from 3 to 4
    const result = autoLineupRosterOnScore(roster, "C", { kills: 4, played: true })

    expect(result.map((p) => p.id)).toEqual(["C", "D", "A", "B"])
    expect(result[0]).toMatchObject({ id: "C", kills: 4, played: true })
  })

  it("handles non-existent player ID safely", () => {
    const roster = createRoster()
    const result = autoLineupRosterOnScore(roster, "NON_EXISTENT", { kills: 2, played: true })
    expect(result).toEqual(roster)
  })

  it("handles empty roster safely", () => {
    const emptyRoster: TestPlayer[] = []
    const result = autoLineupRosterOnScore(emptyRoster, "A", { kills: 2, played: true })
    expect(result).toEqual([])
  })
})

describe("autoLineupRosterOnCancel", () => {
  it("maintains roster order when the only scored player is cancelled (C,B,A,D -> C,B,A,D with C unplayed)", () => {
    const roster: TestPlayer[] = [
      { id: "C", name: "Player C", kills: 3, played: true },
      { id: "B", name: "Player B", kills: 0, played: false },
      { id: "A", name: "Player A", kills: 0, played: false },
      { id: "D", name: "Player D", kills: 0, played: false },
    ]

    const result = autoLineupRosterOnCancel(roster, "C")
    expect(result.map((p) => p.id)).toEqual(["C", "B", "A", "D"])
    expect(result[0]).toMatchObject({ id: "C", kills: 0, played: false })
  })

  it("pulls up remaining played player (B) to slot 0 when top player (C) is cancelled (C,B,A,D -> B,C,A,D)", () => {
    // Both C and B were played: [C(played), B(played), A(unplayed), D(unplayed)]
    const roster: TestPlayer[] = [
      { id: "C", name: "Player C", kills: 3, played: true },
      { id: "B", name: "Player B", kills: 2, played: true },
      { id: "A", name: "Player A", kills: 0, played: false },
      { id: "D", name: "Player D", kills: 0, played: false },
    ]

    const result = autoLineupRosterOnCancel(roster, "C")
    // B should be pulled up to slot 0, C moved to slot 1
    expect(result.map((p) => p.id)).toEqual(["B", "C", "A", "D"])
    expect(result[0]).toMatchObject({ id: "B", kills: 2, played: true })
    expect(result[1]).toMatchObject({ id: "C", kills: 0, played: false })
    expect(result[2]).toMatchObject({ id: "A", kills: 0, played: false })
    expect(result[3]).toMatchObject({ id: "D", kills: 0, played: false })
  })

  it("packs multiple remaining played players to the top", () => {
    // [P1(true), P2(true), P3(true), P4(true)] -> cancel P2
    const roster: TestPlayer[] = [
      { id: "P1", name: "1", kills: 2, played: true },
      { id: "P2", name: "2", kills: 3, played: true },
      { id: "P3", name: "3", kills: 1, played: true },
      { id: "P4", name: "4", kills: 4, played: true },
    ]

    const result = autoLineupRosterOnCancel(roster, "P2")
    expect(result.map((p) => p.id)).toEqual(["P1", "P3", "P4", "P2"])
    expect(result[0]).toMatchObject({ id: "P1", played: true })
    expect(result[1]).toMatchObject({ id: "P3", played: true })
    expect(result[2]).toMatchObject({ id: "P4", played: true })
    expect(result[3]).toMatchObject({ id: "P2", kills: 0, played: false })
  })

  it("handles non-existent player ID safely", () => {
    const roster: TestPlayer[] = [
      { id: "A", name: "A", kills: 1, played: true },
    ]
    const result = autoLineupRosterOnCancel(roster, "NON_EXISTENT")
    expect(result).toEqual(roster)
  })
})


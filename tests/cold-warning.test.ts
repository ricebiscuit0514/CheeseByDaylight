import { describe, expect, it } from "vitest"
import {
  computeCold,
  toValid4v4Step,
  type ColdState,
} from "@/lib/cold-warning"
import type { Player } from "@/components/player-row"

function makePlayers(
  prefix: string,
  scores: Array<{ kills: number; played: boolean }>,
): Player[] {
  return scores.map((s, idx) => ({
    id: `${prefix}-${idx + 1}`,
    name: `${prefix.toUpperCase()} ${idx + 1}`,
    kills: s.kills,
    played: s.played,
  }))
}

describe("toValid4v4Step", () => {
  it("rounds raw needed kills up to valid 4v4 steps", () => {
    expect(toValid4v4Step(-1)).toBe(0)
    expect(toValid4v4Step(0)).toBe(0)
    expect(toValid4v4Step(0.5)).toBe(1)
    expect(toValid4v4Step(1)).toBe(1)
    expect(toValid4v4Step(1.2)).toBe(2)
    expect(toValid4v4Step(2)).toBe(2)
    expect(toValid4v4Step(2.5)).toBe(3)
    expect(toValid4v4Step(3)).toBe(3)
    expect(toValid4v4Step(3.2)).toBe(3.5)
    expect(toValid4v4Step(3.5)).toBe(3.5)
    expect(toValid4v4Step(3.8)).toBe(4)
    expect(toValid4v4Step(4)).toBe(4)
  })
})

describe("computeCold secondary conditions", () => {
  it("Scenario 1: 7th match (1 vs 1 remaining, gap = 4) -> 올킬 후 전부 생존 (0킬 허용)", () => {
    // Thomas (opp): 3 played, 12 kills (4+4+4). 1 unplayed.
    // Ada (my): 3 played, 8 kills (2+3+3). 1 unplayed (turn on Ada 4).
    const thomas = makePlayers("thomas", [
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 0, played: false },
    ])
    const ada = makePlayers("ada", [
      { kills: 2, played: true },
      { kills: 3, played: true },
      { kills: 3, played: true },
      { kills: 0, played: false },
    ])

    const result = computeCold(thomas, ada, "ada", "토마스", "에이다")
    expect(result.status).toBe("warning")
    if (result.status === "warning") {
      expect(result.name).toBe("에이다")
      expect(result.need).toBe(4)
      expect(result.secondaryCondition).toEqual({ type: "survive_all" })
      expect(result.nextSurviveRequired).toBe(true)
    }
  })

  it("Scenario 2: When need < MAX_KILLS (need = 3), no secondary condition is attached (simple 3-kill requirement)", () => {
    const thomas = makePlayers("thomas", [
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 3, played: true },
      { kills: 0, played: false },
    ])
    const ada = makePlayers("ada", [
      { kills: 3, played: true },
      { kills: 3, played: true },
      { kills: 2, played: true },
      { kills: 0, played: false },
    ])

    const result = computeCold(thomas, ada, "ada", "토마스", "에이다")
    expect(result.status).toBe("warning")
    if (result.status === "warning") {
      expect(result.name).toBe("에이다")
      expect(result.need).toBe(3)
      expect(result.secondaryCondition).toBeUndefined()
    }
  })

  it("Scenario 3: 6th match (2 vs 1 remaining, perfect comeback) -> 올킬 후 전부 생존 및 다음 주자 올킬", () => {
    // Thomas (opp): 3 played, 12 kills (4+4+4). 1 unplayed.
    // Ada (my): 2 played, 4 kills (2+2). 2 unplayed (turn on Ada 3).
    const thomas = makePlayers("thomas", [
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 0, played: false },
    ])
    const ada = makePlayers("ada", [
      { kills: 2, played: true },
      { kills: 2, played: true },
      { kills: 0, played: false },
      { kills: 0, played: false },
    ])

    const result = computeCold(thomas, ada, "ada", "토마스", "에이다")
    expect(result.status).toBe("warning")
    if (result.status === "warning") {
      expect(result.name).toBe("에이다")
      expect(result.need).toBe(4)
      expect(result.secondaryCondition).toEqual({
        type: "survive_and_next_kill",
        nextNeed: 4,
      })
      expect(result.nextSurviveRequired).toBe(true)
    }
  })

  it("Scenario 4: Opponent must survive notice with follow-up killer need (7th match 1 vs 1)", () => {
    const thomas = makePlayers("thomas", [
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 0, played: false },
    ])
    const ada = makePlayers("ada", [
      { kills: 2, played: true },
      { kills: 3, played: true },
      { kills: 3, played: true },
      { kills: 0, played: false },
    ])

    const result = computeCold(thomas, ada, "thomas", "토마스", "에이다")
    expect(result.status).toBe("warning")
    if (result.status === "warning") {
      expect(result.opponentMustSurviveName).toBe("에이다")
      expect(result.opponentMustSurviveNextNeed).toBe(4)
    }
  })

  it("Scenario 5: Early cold game win notice in 5th match (8:0, 2 vs 2) -> Thomas 1+ kill to clinch", () => {
    const thomas = makePlayers("thomas", [
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 0, played: false },
      { kills: 0, played: false },
    ])
    const ada = makePlayers("ada", [
      { kills: 0, played: true },
      { kills: 0, played: true },
      { kills: 0, played: false },
      { kills: 0, played: false },
    ])

    const result = computeCold(thomas, ada, "thomas", "토마스", "에이다")
    expect(result.status).toBe("warning")
    if (result.status === "warning") {
      expect(result.opponentMustSurviveName).toBeUndefined()
      expect(result.name).toBe("토마스")
      expect(result.isEarlyWinNotice).toBe(true)
      expect(result.need).toBe(1) // 8 + 1 = 9 > 8 (Ada max)
    }
  })

  it("Scenario 6: Early cold game win notice when team can clinch victory this match (8:1)", () => {
    const thomas = makePlayers("thomas", [
      { kills: 4, played: true },
      { kills: 4, played: true },
      { kills: 0, played: false },
      { kills: 0, played: false },
    ])
    const ada = makePlayers("ada", [
      { kills: 1, played: true },
      { kills: 0, played: true },
      { kills: 0, played: false },
      { kills: 0, played: false },
    ])

    const result = computeCold(thomas, ada, "thomas", "토마스", "에이다")
    expect(result.status).toBe("warning")
    if (result.status === "warning") {
      expect(result.name).toBe("토마스")
      expect(result.isEarlyWinNotice).toBe(true)
      expect(result.need).toBe(2) // 8 + 2 = 10 > 9
    }
  })
})

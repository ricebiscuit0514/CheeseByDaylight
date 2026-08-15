import { describe, expect, it } from "vitest"
import {
  buildAceMatchNotice,
  minAceKillsToTie,
  minAceKillsToWin,
} from "@/lib/ace-match-warning"

describe("ace match warning", () => {
  it("finds the next valid kill step to win", () => {
    expect(minAceKillsToWin(0)).toBe(1)
    expect(minAceKillsToWin(2)).toBe(3)
    expect(minAceKillsToWin(3)).toBe(3.5)
    expect(minAceKillsToWin(3.5)).toBe(4)
    expect(minAceKillsToWin(4)).toBeNull()
  })

  it("finds the next valid kill step to tie", () => {
    expect(minAceKillsToTie(3)).toBe(3)
    expect(minAceKillsToTie(3.5)).toBe(3.5)
    expect(minAceKillsToTie(4)).toBe(4)
  })

  it("shows 3.5 kills to win after a 3:0 ace score", () => {
    expect(buildAceMatchNotice(3)).toEqual({
      killText: "3.5킬",
      suffix: " 이상 하면 우승입니다",
    })
  })

  it("shows all-kill to win after a 3.5:0 ace score", () => {
    expect(buildAceMatchNotice(3.5)).toEqual({
      killText: "올킬",
      suffix: "을 하면 우승입니다",
    })
  })

  it("shows tie-only notice when the opponent already has 4 kills", () => {
    expect(buildAceMatchNotice(4)).toEqual({
      killText: "올킬",
      suffix: "을 하면 무승부입니다",
    })
  })
})

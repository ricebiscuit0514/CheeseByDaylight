import { describe, it, expect } from "vitest"
import {
  isPlayerEnteredOutOfOrder,
  getFirstOutOfOrderPlayerId,
  DRAG_HINT_SEEN_4V4_KEY,
} from "@/lib/scoreboard-order-hint"

describe("scoreboard-order-hint", () => {
  it("exports correct storage key", () => {
    expect(DRAG_HINT_SEEN_4V4_KEY).toBe("dbd-drag-hint-seen-4v4")
  })

  describe("isPlayerEnteredOutOfOrder", () => {
    it("returns false for index 0 even if played", () => {
      const roster = [
        { id: "p1", played: true },
        { id: "p2", played: false },
      ]
      expect(isPlayerEnteredOutOfOrder(roster, 0)).toBe(false)
    })

    it("returns false when player is not played", () => {
      const roster = [
        { id: "p1", played: false },
        { id: "p2", played: false },
      ]
      expect(isPlayerEnteredOutOfOrder(roster, 1)).toBe(false)
    })

    it("returns false when all preceding players are played (sequential entry)", () => {
      const roster = [
        { id: "p1", played: true },
        { id: "p2", played: true },
        { id: "p3", played: true },
      ]
      expect(isPlayerEnteredOutOfOrder(roster, 0)).toBe(false)
      expect(isPlayerEnteredOutOfOrder(roster, 1)).toBe(false)
      expect(isPlayerEnteredOutOfOrder(roster, 2)).toBe(false)
    })

    it("returns true when player is played but preceding player is unplayed (1 skipped)", () => {
      const roster = [
        { id: "p1", played: false },
        { id: "p2", played: true },
        { id: "p3", played: false },
      ]
      expect(isPlayerEnteredOutOfOrder(roster, 0)).toBe(false)
      expect(isPlayerEnteredOutOfOrder(roster, 1)).toBe(true)
      expect(isPlayerEnteredOutOfOrder(roster, 2)).toBe(false)
    })

    it("returns true for multiple skipped rows", () => {
      const roster = [
        { id: "p1", played: false },
        { id: "p2", played: false },
        { id: "p3", played: true },
        { id: "p4", played: true },
      ]
      expect(isPlayerEnteredOutOfOrder(roster, 0)).toBe(false)
      expect(isPlayerEnteredOutOfOrder(roster, 1)).toBe(false)
      expect(isPlayerEnteredOutOfOrder(roster, 2)).toBe(true)
      expect(isPlayerEnteredOutOfOrder(roster, 3)).toBe(true)
    })

    it("returns true when earlier middle slot was skipped", () => {
      const roster = [
        { id: "p1", played: true },
        { id: "p2", played: false },
        { id: "p3", played: true },
      ]
      expect(isPlayerEnteredOutOfOrder(roster, 0)).toBe(false)
      expect(isPlayerEnteredOutOfOrder(roster, 1)).toBe(false)
      expect(isPlayerEnteredOutOfOrder(roster, 2)).toBe(true)
    })

    it("handles out of bound indices safely", () => {
      const roster = [{ id: "p1", played: true }]
      expect(isPlayerEnteredOutOfOrder(roster, -1)).toBe(false)
      expect(isPlayerEnteredOutOfOrder(roster, 5)).toBe(false)
    })
  })

  describe("getFirstOutOfOrderPlayerId", () => {
    it("returns null when all players entered sequentially", () => {
      const roster = [
        { id: "p1", played: true },
        { id: "p2", played: true },
        { id: "p3", played: false },
      ]
      expect(getFirstOutOfOrderPlayerId(roster)).toBeNull()
    })

    it("returns first out-of-order player id", () => {
      const roster = [
        { id: "p1", played: false },
        { id: "p2", played: true },
        { id: "p3", played: true },
      ]
      expect(getFirstOutOfOrderPlayerId(roster)).toBe("p2")
    })
  })
})

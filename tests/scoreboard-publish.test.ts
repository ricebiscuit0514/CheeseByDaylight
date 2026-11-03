import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  createDefaultScoreboardState,
  type ScoreboardGameMode,
  type ScoreboardSyncState,
} from "../lib/firebase/scoreboard-room"
import { scheduleScoreboardPublish } from "../lib/scoreboard-publish"

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal("window", globalThis)
})

afterEach(() => {
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

function createPublisher(gameMode: ScoreboardGameMode = "4v4") {
  const initial = createDefaultScoreboardState(gameMode)
  const previousState = { current: initial as ScoreboardSyncState | null }
  const lastPublished = { current: JSON.stringify(initial) }
  const shouldPublish = vi.fn(() => true)
  const publish = vi.fn(async (state: ScoreboardSyncState) => {
    lastPublished.current = JSON.stringify(state)
  })
  let cleanup: (() => void) | undefined

  return {
    initial,
    previousState,
    lastPublished,
    shouldPublish,
    publish,
    update(state: ScoreboardSyncState) {
      // React cleans up the previous effect before running the next one.
      cleanup?.()
      cleanup = scheduleScoreboardPublish({
        state, previousState, lastPublished, shouldPublish, publish,
      })
    },
    dispose() { cleanup?.() },
  }
}

describe("scoreboard state delivery", () => {
  it.each(["4v4", "5p"] as const)(
    "sends a picker selection immediately and only once in %s",
    async (mode) => {
      const sender = createPublisher(mode)
      const next = {
        ...sender.initial,
        pickerUi: { ...sender.initial.pickerUi, selectedKillerId: "nurse", selectionSeq: 1 },
      }

      sender.update(next)
      expect(sender.publish).toHaveBeenCalledExactlyOnceWith(next, JSON.stringify(next))
      await vi.advanceTimersByTimeAsync(500)
      expect(sender.publish).toHaveBeenCalledTimes(1)
    },
  )

  it("does not duplicate an immediate send while waiting for a slow response", async () => {
    const sender = createPublisher()
    let acknowledge!: () => void
    sender.publish.mockImplementationOnce(() => new Promise<void>((resolve) => {
      acknowledge = resolve
    }))

    sender.update({
      ...sender.initial,
      pickerUi: { ...sender.initial.pickerUi, selectionSeq: 1 },
    })
    await vi.advanceTimersByTimeAsync(500)
    expect(sender.publish).toHaveBeenCalledTimes(1)
    acknowledge()
  })

  it("sends a first-attacker change immediately without a second scheduled send", async () => {
    const sender = createPublisher()
    const initial = sender.initial
    if (initial.mode !== "4v4") throw new Error("Expected 4v4 state")
    const next = { ...initial, firstAttackerId: "thomas-1" }

    sender.update(next)
    expect(sender.publish).toHaveBeenCalledExactlyOnceWith(next, JSON.stringify(next))
    await vi.advanceTimersByTimeAsync(500)
    expect(sender.publish).toHaveBeenCalledTimes(1)
  })

  it("sends simultaneous first-attacker and picker changes as one update", async () => {
    const sender = createPublisher()
    const initial = sender.initial
    if (initial.mode !== "4v4") throw new Error("Expected 4v4 state")
    sender.update({
      ...initial,
      firstAttackerId: "thomas-1",
      pickerUi: { ...initial.pickerUi, selectionSeq: 1, feedbackToken: 123 },
    })

    expect(sender.publish).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(sender.publish).toHaveBeenCalledTimes(1)
  })

  it("preserves immediate picker feedback when the selection sequence stays the same", () => {
    const sender = createPublisher()
    sender.update({
      ...sender.initial,
      pickerUi: { ...sender.initial.pickerUi, feedbackToken: 123 },
    })

    expect(sender.publish).toHaveBeenCalledTimes(1)
  })

  it("keeps ordinary edits debounced and sends only the latest state", async () => {
    const sender = createPublisher()
    sender.update({ ...sender.initial, killerBans: ["nurse"] })
    await vi.advanceTimersByTimeAsync(60)
    const latest = { ...sender.initial, killerBans: ["nurse", "artist"] }
    sender.update(latest)

    await vi.advanceTimersByTimeAsync(119)
    expect(sender.publish).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(sender.publish).toHaveBeenCalledExactlyOnceWith(latest, JSON.stringify(latest))
  })

  it("replaces a pending ordinary edit with an immediate update containing that edit", async () => {
    const sender = createPublisher()
    const edit = { ...sender.initial, killerBans: ["nurse"] }
    sender.update(edit)
    await vi.advanceTimersByTimeAsync(60)
    const latest = { ...edit, pickerUi: { ...edit.pickerUi, selectionSeq: 1 } }
    sender.update(latest)

    expect(sender.publish).toHaveBeenCalledExactlyOnceWith(latest, JSON.stringify(latest))
    await vi.advanceTimersByTimeAsync(500)
    expect(sender.publish).toHaveBeenCalledTimes(1)
  })

  it("does not resend the initial state already published during connection", async () => {
    const sender = createPublisher()
    sender.previousState.current = null
    sender.update(sender.initial)

    await vi.advanceTimersByTimeAsync(500)
    expect(sender.publish).not.toHaveBeenCalled()
  })

  it("respects the host restoration guard", async () => {
    const sender = createPublisher()
    sender.shouldPublish.mockReturnValue(false)
    sender.update({
      ...sender.initial,
      pickerUi: { ...sender.initial.pickerUi, selectionSeq: 1 },
    })

    await vi.advanceTimersByTimeAsync(500)
    expect(sender.publish).not.toHaveBeenCalled()
  })

  it("cancels a pending send when sharing stops or the effect unmounts", async () => {
    const sender = createPublisher()
    sender.update({ ...sender.initial, killerBans: ["nurse"] })
    sender.dispose()

    await vi.advanceTimersByTimeAsync(500)
    expect(sender.publish).not.toHaveBeenCalled()
  })
})

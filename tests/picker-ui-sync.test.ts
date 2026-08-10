import { describe, expect, it } from "vitest"
import {
  clearPickerSelection,
  createInitialPickerUi,
  nextPickerFeedback,
  nextPickerSelection,
  normalizePickerUi,
  pickerUiFromWire,
  pickerUiToWire,
} from "../lib/picker-ui-sync"

describe("picker ui sync helpers", () => {
  it("tracks selection and feedback sequence bumps", () => {
    let state = createInitialPickerUi()

    state = nextPickerSelection(state, "nurse")
    expect(state.selectedKillerId).toBe("nurse")
    expect(state.selectionSeq).toBe(1)

    state = nextPickerFeedback(state, "nurse", "pick")
    expect(state.selectedKillerId).toBeNull()
    expect(state.selectionSeq).toBe(2)
    expect(state.feedbackKillerId).toBe("nurse")
    expect(state.feedbackKind).toBe("pick")
    expect(state.feedbackToken).toBeGreaterThan(0)
  })

  it("clears selection only when needed", () => {
    const initial = createInitialPickerUi()
    expect(clearPickerSelection(initial)).toBe(initial)

    const selected = nextPickerSelection(initial, "ghost-face")
    const cleared = clearPickerSelection(selected)
    expect(cleared.selectedKillerId).toBeNull()
    expect(cleared.selectionSeq).toBe(2)
  })

  it("round-trips compact wire state", () => {
    const state = nextPickerFeedback(
      nextPickerSelection(createInitialPickerUi(), "artist"),
      "artist",
      "ban",
      1234,
    )

    const wire = pickerUiToWire(state)
    expect(wire).toEqual({
      selSeq: 2,
      fb: { k: "artist", kind: "ban", t: 1234 },
    })

    const restored = pickerUiFromWire(wire)
    expect(restored.selectedKillerId).toBeNull()
    expect(restored.selectionSeq).toBe(2)
    expect(restored.feedbackKillerId).toBe("artist")
    expect(restored.feedbackKind).toBe("ban")
    expect(restored.feedbackToken).toBe(1234)
  })

  it("normalizes invalid wire values", () => {
    expect(
      normalizePickerUi({
        selectedKillerId: "not-a-killer",
        selectionSeq: -3,
        feedbackKind: "oops",
        feedbackToken: -1,
      }),
    ).toEqual(createInitialPickerUi())
  })
})

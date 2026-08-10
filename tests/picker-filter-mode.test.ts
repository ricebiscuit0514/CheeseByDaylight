import { describe, expect, it } from "vitest"
import {
  getPickerFilterStorageKey,
  normalizePickerFilterMode,
} from "@/lib/picker-filter-mode"

describe("picker filter mode storage", () => {
  it("uses separate storage keys for host and viewer", () => {
    expect(getPickerFilterStorageKey("host")).toBe("fearless-picker-filter-host")
    expect(getPickerFilterStorageKey("viewer")).toBe(
      "fearless-picker-filter-viewer",
    )
  })

  it("normalizes invalid values to hard", () => {
    expect(normalizePickerFilterMode(null)).toBe("hard")
    expect(normalizePickerFilterMode("invalid")).toBe("hard")
  })

  it("coerces personal to hard in solo mode", () => {
    expect(normalizePickerFilterMode("personal", true)).toBe("hard")
    expect(normalizePickerFilterMode("personal", false)).toBe("personal")
  })
})

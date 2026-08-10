import { describe, expect, it } from "vitest"
import {
  clampPickerZoomLevel,
  getMaxPickerZoomLevel,
  getPickerBaseColumns,
  getPickerColumnCount,
  getPickerGridGap,
  getPickerMinColumns,
  getPickerUiScale,
  getPickerZoomStorageKey,
  measurePickerLayout,
} from "@/lib/picker-zoom"

describe("picker zoom", () => {
  it("returns base columns by breakpoint", () => {
    expect(getPickerBaseColumns(360)).toBe(2)
    expect(getPickerBaseColumns(520)).toBe(3)
    expect(getPickerBaseColumns(768)).toBe(4)
    expect(getPickerBaseColumns(960)).toBe(6)
    expect(getPickerBaseColumns(1280)).toBe(7)
  })

  it("returns min columns by breakpoint", () => {
    expect(getPickerMinColumns(360)).toBe(2)
    expect(getPickerMinColumns(768)).toBe(2)
    expect(getPickerMinColumns(960)).toBe(3)
    expect(getPickerMinColumns(1280)).toBe(4)
  })

  it("reduces columns as zoom level increases", () => {
    expect(getPickerColumnCount(1280, 0)).toBe(7)
    expect(getPickerColumnCount(1280, 1)).toBe(6)
    expect(getPickerColumnCount(1280, 2)).toBe(5)
    expect(getPickerColumnCount(1280, 3)).toBe(4)
    expect(getPickerColumnCount(1280, 99)).toBe(4)
  })

  it("clamps zoom level to max", () => {
    expect(getMaxPickerZoomLevel(7, 4)).toBe(3)
    expect(clampPickerZoomLevel(5, 3)).toBe(3)
    expect(clampPickerZoomLevel(-1, 3)).toBe(0)
  })

  it("widens grid gap and ui scale as zoom increases", () => {
    expect(getPickerGridGap(0, 3)).toEqual({
      rowGap: "0.80rem",
      columnGap: "0.65rem",
    })
    expect(getPickerGridGap(3, 3)).toEqual({
      rowGap: "1.65rem",
      columnGap: "1.65rem",
    })
    expect(getPickerUiScale(0, 3)).toBe(1)
    expect(getPickerUiScale(3, 3)).toBe(1.38)
  })

  it("uses separate storage keys for host and viewer", () => {
    expect(getPickerZoomStorageKey("host")).toBe("fearless-picker-zoom-host")
    expect(getPickerZoomStorageKey("viewer")).toBe("fearless-picker-zoom-viewer")
  })

  it("keeps column count, gaps, and ui scale in sync", () => {
    const layout = measurePickerLayout(1280, "host", 2)
    expect(layout).toEqual({
      viewportWidth: 1280,
      zoomLevel: 2,
      maxZoomLevel: 3,
      columnCount: 5,
      gridGap: getPickerGridGap(2, 3),
      pickerUiScale: getPickerUiScale(2, 3),
    })
  })
})

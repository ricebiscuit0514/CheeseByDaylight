export const PICKER_ZOOM_STORAGE_KEY = "fearless-picker-zoom"

export type PickerZoomAudience = "host" | "viewer"

export const PICKER_ZOOM_STORAGE_KEYS = {
  host: "fearless-picker-zoom-host",
  viewer: "fearless-picker-zoom-viewer",
} as const

export function getPickerZoomStorageKey(audience: PickerZoomAudience): string {
  return PICKER_ZOOM_STORAGE_KEYS[audience]
}

export function getPickerZoomAudience(readOnly: boolean): PickerZoomAudience {
  return readOnly ? "viewer" : "host"
}

/** Default column count for the killer picker grid at a viewport width. */
export function getPickerBaseColumns(viewportWidth: number): number {
  if (viewportWidth >= 1024) return 7
  if (viewportWidth >= 900) return 6
  if (viewportWidth >= 640) return 4
  if (viewportWidth >= 480) return 3
  return 2
}

/** Minimum column count (maximum zoom-in) for a viewport width. */
export function getPickerMinColumns(viewportWidth: number): number {
  if (viewportWidth >= 1024) return 4
  if (viewportWidth >= 900) return 3
  if (viewportWidth >= 640) return 2
  return 2
}

export function getMaxPickerZoomLevel(
  baseColumns: number,
  minColumns: number,
): number {
  return Math.max(0, baseColumns - minColumns)
}

export function getPickerColumnCount(
  viewportWidth: number,
  zoomLevel: number,
): number {
  const baseColumns = getPickerBaseColumns(viewportWidth)
  const minColumns = getPickerMinColumns(viewportWidth)
  const maxZoom = getMaxPickerZoomLevel(baseColumns, minColumns)
  const clampedZoom = clampPickerZoomLevel(zoomLevel, maxZoom)
  return Math.max(minColumns, baseColumns - clampedZoom)
}

export function clampPickerZoomLevel(
  zoomLevel: number,
  maxZoom: number,
): number {
  if (!Number.isFinite(zoomLevel) || zoomLevel < 0) return 0
  return Math.min(Math.floor(zoomLevel), maxZoom)
}

export function readStoredPickerZoomLevel(
  audience: PickerZoomAudience = "host",
): number {
  if (typeof window === "undefined") return 0
  try {
    const key = getPickerZoomStorageKey(audience)
    let raw = window.localStorage.getItem(key)
    if (raw === null && audience === "host") {
      raw = window.localStorage.getItem(PICKER_ZOOM_STORAGE_KEY)
    }
    if (raw === null) return 0
    const parsed = Number.parseInt(raw, 10)
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
  } catch {
    return 0
  }
}

export function writeStoredPickerZoomLevel(
  audience: PickerZoomAudience,
  zoomLevel: number,
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      getPickerZoomStorageKey(audience),
      String(zoomLevel),
    )
  } catch {
    // ignore quota / privacy mode
  }
}

function zoomIntensity(zoomLevel: number, maxZoom: number): number {
  if (maxZoom <= 0) return 0
  return clampPickerZoomLevel(zoomLevel, maxZoom) / maxZoom
}

/** Wider gaps at higher zoom so portrait strokes do not overlap. */
export function getPickerGridGap(
  zoomLevel: number,
  maxZoom: number,
): { rowGap: string; columnGap: string } {
  const t = zoomIntensity(zoomLevel, maxZoom)
  return {
    rowGap: `${(0.8 + t * 0.85).toFixed(2)}rem`,
    columnGap: `${(0.65 + t * 1).toFixed(2)}rem`,
  }
}

/** Scales overlay labels with zoom level. */
export function getPickerUiScale(zoomLevel: number, maxZoom: number): number {
  const t = zoomIntensity(zoomLevel, maxZoom)
  return Number((1 + t * 0.38).toFixed(3))
}

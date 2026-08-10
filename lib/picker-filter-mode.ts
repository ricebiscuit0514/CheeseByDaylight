import type { FearlessFilterMode } from "./fearless"
import type { PickerZoomAudience } from "./picker-zoom"

export const PICKER_FILTER_STORAGE_KEYS = {
  host: "fearless-picker-filter-host",
  viewer: "fearless-picker-filter-viewer",
} as const

export function getPickerFilterStorageKey(
  audience: PickerZoomAudience,
): string {
  return PICKER_FILTER_STORAGE_KEYS[audience]
}

export function normalizePickerFilterMode(
  mode: string | null | undefined,
  soloMode = false,
): FearlessFilterMode {
  if (mode === "hard" || mode === "soft") return mode
  if (mode === "personal") return soloMode ? "hard" : "personal"
  return "hard"
}

export function readStoredPickerFilterMode(
  audience: PickerZoomAudience,
  soloMode = false,
): FearlessFilterMode {
  if (typeof window === "undefined") return "hard"
  try {
    const raw = window.localStorage.getItem(getPickerFilterStorageKey(audience))
    return normalizePickerFilterMode(raw, soloMode)
  } catch {
    return "hard"
  }
}

export function writeStoredPickerFilterMode(
  audience: PickerZoomAudience,
  mode: FearlessFilterMode,
  soloMode = false,
): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(
      getPickerFilterStorageKey(audience),
      normalizePickerFilterMode(mode, soloMode),
    )
  } catch {
    // ignore quota / privacy mode
  }
}

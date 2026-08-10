import { isKillerId } from "@/lib/killer-catalog"

export type PickerFeedbackKind = "pick" | "ban" | "unban"

export type PickerUiSyncState = {
  selectedKillerId: string | null
  selectionSeq: number
  feedbackKillerId: string | null
  feedbackKind: PickerFeedbackKind | null
  feedbackToken: number
}

export const INITIAL_PICKER_UI: PickerUiSyncState = {
  selectedKillerId: null,
  selectionSeq: 0,
  feedbackKillerId: null,
  feedbackKind: null,
  feedbackToken: 0,
}

export function createInitialPickerUi(): PickerUiSyncState {
  return { ...INITIAL_PICKER_UI }
}

export function nextPickerSelection(
  prev: PickerUiSyncState,
  killerId: string | null,
): PickerUiSyncState {
  return {
    ...prev,
    selectedKillerId: killerId,
    selectionSeq: prev.selectionSeq + 1,
  }
}

export function nextPickerFeedback(
  prev: PickerUiSyncState,
  killerId: string,
  kind: PickerFeedbackKind,
  token = Date.now(),
): PickerUiSyncState {
  return {
    ...prev,
    selectedKillerId: null,
    selectionSeq: prev.selectionSeq + 1,
    feedbackKillerId: killerId,
    feedbackKind: kind,
    feedbackToken: token,
  }
}

export function clearPickerSelection(
  prev: PickerUiSyncState,
): PickerUiSyncState {
  if (!prev.selectedKillerId) return prev
  return nextPickerSelection(prev, null)
}

export function normalizePickerUi(value: unknown): PickerUiSyncState {
  if (!value || typeof value !== "object") return createInitialPickerUi()

  const raw = value as Partial<PickerUiSyncState>
  const selectedKillerId =
    typeof raw.selectedKillerId === "string" && isKillerId(raw.selectedKillerId)
      ? raw.selectedKillerId
      : null
  const selectionSeq =
    typeof raw.selectionSeq === "number" &&
    Number.isFinite(raw.selectionSeq) &&
    raw.selectionSeq >= 0
      ? Math.min(Math.floor(raw.selectionSeq), 999_999)
      : 0
  const feedbackKillerId =
    typeof raw.feedbackKillerId === "string" && isKillerId(raw.feedbackKillerId)
      ? raw.feedbackKillerId
      : null
  const feedbackKind =
    raw.feedbackKind === "pick" ||
    raw.feedbackKind === "ban" ||
    raw.feedbackKind === "unban"
      ? raw.feedbackKind
      : null
  const feedbackToken =
    typeof raw.feedbackToken === "number" &&
    Number.isFinite(raw.feedbackToken) &&
    raw.feedbackToken >= 0
      ? raw.feedbackToken
      : 0

  return {
    selectedKillerId,
    selectionSeq,
    feedbackKillerId,
    feedbackKind,
    feedbackToken,
  }
}

export type WirePickerUi = {
  sel?: string
  selSeq?: number
  fb?: {
    k: string
    kind: PickerFeedbackKind
    t: number
  }
}

export function pickerUiToWire(state: PickerUiSyncState): WirePickerUi | undefined {
  const normalized = normalizePickerUi(state)
  if (
    normalized.selectionSeq === 0 &&
    normalized.feedbackToken === 0 &&
    !normalized.selectedKillerId
  ) {
    return undefined
  }

  const wire: WirePickerUi = {}
  if (normalized.selectedKillerId) wire.sel = normalized.selectedKillerId
  if (normalized.selectionSeq > 0) wire.selSeq = normalized.selectionSeq
  if (
    normalized.feedbackKillerId &&
    normalized.feedbackKind &&
    normalized.feedbackToken > 0
  ) {
    wire.fb = {
      k: normalized.feedbackKillerId,
      kind: normalized.feedbackKind,
      t: normalized.feedbackToken,
    }
  }
  return wire
}

export function pickerUiFromWire(value: unknown): PickerUiSyncState {
  if (!value || typeof value !== "object") return createInitialPickerUi()

  const wire = value as WirePickerUi
  return normalizePickerUi({
    selectedKillerId: wire.sel ?? null,
    selectionSeq: wire.selSeq ?? 0,
    feedbackKillerId: wire.fb?.k ?? null,
    feedbackKind: wire.fb?.kind ?? null,
    feedbackToken: wire.fb?.t ?? 0,
  })
}

export function hasPickerUiActivity(state: PickerUiSyncState) {
  return state.selectionSeq > 0 || state.feedbackToken > 0
}

import {
  CLOSED_ACE_SETUP,
  createDefaultScoreboardState,
  fromWireState,
  toWireState,
  type ScoreboardGameMode,
  type ScoreboardSyncState,
} from "@/lib/firebase/scoreboard-room"
import { computeCold } from "@/lib/cold-warning"
import { createInitialPickerUi } from "@/lib/picker-ui-sync"

const MODE_STORAGE_KEYS: Record<ScoreboardGameMode, string> = {
  "4v4": "dbd-scoreboard-v1",
  "5p": "dbd-5p-state-v2",
}
const STATE_TTL_MS = 3 * 60 * 60 * 1000

export function prepareScoreboardModeSwitch(
  storage: Pick<Storage, "getItem" | "setItem">,
  currentState: ScoreboardSyncState,
  targetMode: ScoreboardGameMode,
  now = Date.now(),
): ScoreboardSyncState {
  // Capture the latest edit even when its regular autosave has not run yet.
  storage.setItem(
    MODE_STORAGE_KEYS[currentState.mode],
    JSON.stringify({ ...currentState, updatedAt: now }),
  )

  const initial = createDefaultScoreboardState(targetMode)
  try {
    const raw = storage.getItem(MODE_STORAGE_KEYS[targetMode])
    if (!raw) return initial
    const saved: Record<string, unknown> = JSON.parse(raw)
    if (
      !saved || typeof saved !== "object" || Array.isArray(saved) ||
      typeof saved.updatedAt !== "number" || !Number.isFinite(saved.updatedAt) ||
      now - saved.updatedAt >= STATE_TTL_MS ||
      (saved.mode !== undefined && saved.mode !== targetMode)
    ) {
      return initial
    }

    const candidate = {
      ...initial,
      ...saved,
      mode: targetMode,
      pickerUi: createInitialPickerUi(),
    } as ScoreboardSyncState
    if (candidate.mode === "4v4" && initial.mode === "4v4") {
      candidate.ace = { ...initial.ace, ...candidate.ace, ...CLOSED_ACE_SETUP }
    }

    // Use the same normalized state that viewers will receive from Firebase.
    const restored = fromWireState(toWireState(candidate))
    if (!restored || restored.mode !== targetMode) return initial
    if (restored.mode === "4v4") {
      if (![...restored.thomas, ...restored.ada].some((player) => player.id === restored.firstAttackerId)) {
        restored.firstAttackerId = null
      }
      const cold = computeCold(restored.thomas, restored.ada, null, restored.thomasName, restored.adaName)
      restored.ace.showProceedButton =
        !restored.ace.isActive && !restored.ace.hasCompleted && !restored.ace.showRematchPrompt &&
        cold.status === "gameover" && cold.winnerName === "tie"
    }
    return restored
  } catch {
    return initial
  }
}

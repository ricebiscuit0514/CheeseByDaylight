import type { ScoreboardSyncState } from "@/lib/firebase/scoreboard-room"

type ScoreboardPublishOptions = {
  state: ScoreboardSyncState
  previousState: { current: ScoreboardSyncState | null }
  lastPublished: { current: string }
  shouldPublish: (snapshot: string) => boolean
  publish: (state: ScoreboardSyncState, snapshot: string) => Promise<void>
}

export function scheduleScoreboardPublish({
  state,
  previousState,
  lastPublished,
  shouldPublish,
  publish,
}: ScoreboardPublishOptions): (() => void) | undefined {
  const previous = previousState.current
  previousState.current = state

  const firstAttackerChanged =
    state.mode === "4v4" &&
    previous?.mode === "4v4" &&
    state.firstAttackerId !== previous.firstAttackerId
  const pickerChanged =
    !previous ||
    previous.mode !== state.mode ||
    state.pickerUi.selectionSeq !== previous.pickerUi.selectionSeq ||
    state.pickerUi.feedbackToken !== previous.pickerUi.feedbackToken

  const snapshot = JSON.stringify(state)
  // A restored snapshot must release the hydration guard even if already sent.
  if (!shouldPublish(snapshot) || snapshot === lastPublished.current) return

  const send = () => {
    if (!shouldPublish(snapshot) || snapshot === lastPublished.current) return
    void publish(state, snapshot)
  }

  // Immediate UI changes and debounced edits share one delivery path.
  if (firstAttackerChanged || pickerChanged) {
    send()
    return
  }

  const timeout = window.setTimeout(send, 120)
  return () => window.clearTimeout(timeout)
}

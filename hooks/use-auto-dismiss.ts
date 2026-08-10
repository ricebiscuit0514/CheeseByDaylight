"use client"

import { useCallback, useEffect, useMemo, useRef } from "react"

/** Idle time before utility popovers auto-close when not interacted with. */
export const UTILITY_POPOVER_IDLE_MS = 45_000

/** Idle time before reset menu / confirm stack auto-closes. */
export const RESET_MENU_IDLE_MS = 10_000

type AutoDismissBindings = {
  onPointerDown: () => void
  onKeyDown: () => void
}

export function useAutoDismiss(
  active: boolean,
  onDismiss: () => void,
  timeoutMs: number = UTILITY_POPOVER_IDLE_MS,
): AutoDismissBindings {
  const onDismissRef = useRef(onDismiss)
  const timeoutRef = useRef<number | null>(null)

  onDismissRef.current = onDismiss

  const resetTimer = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current)
    }
    timeoutRef.current = window.setTimeout(() => {
      onDismissRef.current()
    }, timeoutMs)
  }, [timeoutMs])

  useEffect(() => {
    if (!active) {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
      return
    }

    resetTimer()
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current)
        timeoutRef.current = null
      }
    }
  }, [active, resetTimer])

  return useMemo(
    () => ({
      onPointerDown: resetTimer,
      onKeyDown: resetTimer,
    }),
    [resetTimer],
  )
}

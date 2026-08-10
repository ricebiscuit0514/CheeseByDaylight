"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * Closes a popover when the user interacts elsewhere, without blocking that interaction.
 * Uses capture-phase pointerdown so dismiss runs before the underlying control receives the event.
 */
export function useDismissOnOutsideInteraction(
  active: boolean,
  onDismiss: () => void,
  containerRef: RefObject<HTMLElement | null>,
  ignoreRefs: RefObject<HTMLElement | null>[] = [],
) {
  const onDismissRef = useRef(onDismiss)
  const ignoreRefsRef = useRef(ignoreRefs)

  onDismissRef.current = onDismiss
  ignoreRefsRef.current = ignoreRefs

  useEffect(() => {
    if (!active) return

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Node)) return

      if (containerRef.current?.contains(target)) return

      for (const ignoreRef of ignoreRefsRef.current) {
        if (ignoreRef.current?.contains(target)) return
      }

      onDismissRef.current()
    }

    document.addEventListener("pointerdown", handlePointerDown, true)
    return () => document.removeEventListener("pointerdown", handlePointerDown, true)
  }, [active, containerRef])
}

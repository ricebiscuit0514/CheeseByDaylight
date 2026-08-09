"use client"

import { useCallback, useEffect, useState } from "react"

export const UTILITY_UI_HIDDEN_KEY = "dbd-utility-ui-hidden"

export function useUtilityUiHidden() {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(UTILITY_UI_HIDDEN_KEY) === "1")
    } catch {
      // ignore
    }
  }, [])

  const toggle = useCallback(() => {
    setHidden((prev) => {
      const next = !prev
      try {
        localStorage.setItem(UTILITY_UI_HIDDEN_KEY, next ? "1" : "0")
      } catch {
        // ignore
      }
      return next
    })
  }, [])

  return { hidden, toggle }
}

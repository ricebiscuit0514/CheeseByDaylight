"use client"

import { useEffect, useState } from "react"

const MIN_ZOOM = 0.25
const MAX_ZOOM = 4
const FIREFOX_ZOOM_STEP = 1.1
const OUTER_RESIZE_THRESHOLD = 12
const WHEEL_SYNC_DEBOUNCE_MS = 120

let baselineRatio: number | null = null
let baselineInnerWidth: number | null = null
let lastOuterWidth = 0
let firefoxTrackedZoom = 1
let cachedZoom = 1
let listening = false
let wheelSyncTimer: number | undefined
const listeners = new Set<(zoom: number) => void>()

function isFirefox() {
  return (
    typeof navigator !== "undefined" &&
    /firefox/i.test(navigator.userAgent)
  )
}

function clampZoom(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 1
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM)
}

function measureChromeLikeZoom() {
  const inner = window.innerWidth
  if (inner <= 0) return 1

  const ratio = window.outerWidth / inner
  if (!Number.isFinite(ratio) || ratio <= 0) return 1

  if (baselineRatio === null) {
    baselineRatio = ratio
  }

  return clampZoom(ratio / baselineRatio)
}

function resetFirefoxBaseline(inner = window.innerWidth, outer = window.outerWidth) {
  baselineInnerWidth = inner > 0 ? inner : null
  lastOuterWidth = outer
  firefoxTrackedZoom = 1
}

function reconcileFirefoxZoom() {
  const outer = window.outerWidth
  const inner = window.innerWidth
  if (inner <= 0) return clampZoom(firefoxTrackedZoom)

  if (baselineInnerWidth === null) {
    resetFirefoxBaseline(inner, outer)
    return 1
  }

  if (Math.abs(outer - lastOuterWidth) > OUTER_RESIZE_THRESHOLD) {
    resetFirefoxBaseline(inner, outer)
    return 1
  }

  lastOuterWidth = outer
  firefoxTrackedZoom = clampZoom(baselineInnerWidth / inner)
  return firefoxTrackedZoom
}

function measureBrowserZoom(reconcileFirefox = true) {
  if (typeof window === "undefined") return 1

  const visualScale = window.visualViewport?.scale
  if (visualScale && Math.abs(visualScale - 1) > 0.01) {
    return clampZoom(visualScale)
  }

  if (isFirefox()) {
    return reconcileFirefox
      ? reconcileFirefoxZoom()
      : clampZoom(firefoxTrackedZoom)
  }

  return measureChromeLikeZoom()
}

function applyFirefoxZoomStep(direction: "in" | "out" | "reset") {
  if (direction === "reset") {
    resetFirefoxBaseline()
    return
  }

  firefoxTrackedZoom = clampZoom(
    direction === "in"
      ? firefoxTrackedZoom * FIREFOX_ZOOM_STEP
      : firefoxTrackedZoom / FIREFOX_ZOOM_STEP,
  )
}

function publishZoom(reconcileFirefox = true) {
  cachedZoom = measureBrowserZoom(reconcileFirefox)
  listeners.forEach((listener) => listener(cachedZoom))
}

function scheduleFirefoxWheelSync() {
  if (wheelSyncTimer !== undefined) {
    window.clearTimeout(wheelSyncTimer)
  }
  wheelSyncTimer = window.setTimeout(() => {
    wheelSyncTimer = undefined
    publishZoom(true)
  }, WHEEL_SYNC_DEBOUNCE_MS)
}

function handleWheel(event: WheelEvent) {
  if (!event.ctrlKey) return

  if (isFirefox()) {
    const ticks = Math.min(
      6,
      Math.max(1, Math.round(Math.abs(event.deltaY) / 40)),
    )
    for (let i = 0; i < ticks; i += 1) {
      applyFirefoxZoomStep(event.deltaY < 0 ? "in" : "out")
    }
    publishZoom(false)
    scheduleFirefoxWheelSync()
    return
  }

  window.requestAnimationFrame(() => publishZoom(true))
}

function handleKeyDown(event: KeyboardEvent) {
  if (!event.ctrlKey || event.altKey) return

  if (isFirefox()) {
    if (event.key === "=" || event.key === "+" || event.code === "Equal") {
      applyFirefoxZoomStep("in")
    } else if (event.key === "-" || event.key === "_" || event.code === "Minus") {
      applyFirefoxZoomStep("out")
    } else if (event.key === "0" || event.code === "Digit0") {
      applyFirefoxZoomStep("reset")
      baselineRatio = null
    } else {
      return
    }

    publishZoom(false)
    scheduleFirefoxWheelSync()
    return
  }

  if (event.key === "0" || event.code === "Digit0") {
    baselineRatio = null
    publishZoom(true)
  }
}

function ensureListening() {
  if (listening || typeof window === "undefined") return
  listening = true
  publishZoom(true)

  window.addEventListener("resize", () => publishZoom(true))
  window.visualViewport?.addEventListener("resize", () => publishZoom(true))
  window.addEventListener("wheel", handleWheel, { passive: true })
  window.addEventListener("keydown", handleKeyDown)
}

export function useBrowserZoom() {
  const [zoom, setZoom] = useState(cachedZoom)

  useEffect(() => {
    ensureListening()
    listeners.add(setZoom)
    setZoom(cachedZoom)

    return () => {
      listeners.delete(setZoom)
    }
  }, [])

  return zoom
}

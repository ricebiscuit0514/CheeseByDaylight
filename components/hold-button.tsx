"use client"

import { useEffect, useRef } from "react"
import { cn } from "@/lib/utils"

interface HoldButtonProps {
  onConfirm: () => void
  holdDurationMs?: number
  disabled?: boolean
  className?: string
  style?: React.CSSProperties
  children: React.ReactNode
}

export function HoldButton({
  onConfirm,
  holdDurationMs = 800,
  disabled = false,
  className,
  style,
  children,
}: HoldButtonProps) {
  const holdingRef = useRef(false)
  const startTimeRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)
  const fillRef = useRef<HTMLSpanElement>(null)
  const onConfirmRef = useRef(onConfirm)

  useEffect(() => {
    onConfirmRef.current = onConfirm
  }, [onConfirm])

  const setFillProgress = (progress: number) => {
    const fill = fillRef.current
    if (!fill) return
    fill.style.transform = `scaleX(${Math.max(0, Math.min(1, progress))})`
    fill.style.opacity = progress > 0 ? "1" : "0"
  }

  const stopHold = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    holdingRef.current = false
    setFillProgress(0)
  }

  const startHold = () => {
    if (disabled || holdingRef.current) return
    holdingRef.current = true
    startTimeRef.current = Date.now()
    setFillProgress(0)

    const updateProgress = () => {
      if (!holdingRef.current) return

      const elapsed = Date.now() - startTimeRef.current
      const progress = elapsed / holdDurationMs
      setFillProgress(progress)

      if (elapsed >= holdDurationMs) {
        stopHold()
        onConfirmRef.current()
      } else {
        animFrameRef.current = requestAnimationFrame(updateProgress)
      }
    }

    animFrameRef.current = requestAnimationFrame(updateProgress)
  }

  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [])

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseDown={startHold}
      onMouseUp={stopHold}
      onMouseLeave={stopHold}
      onTouchStart={startHold}
      onTouchEnd={stopHold}
      onTouchCancel={stopHold}
      className={cn(
        "relative overflow-hidden select-none active:scale-[0.98] transition-transform duration-100 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40",
        className,
      )}
      style={style}
    >
      <span
        ref={fillRef}
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 bottom-0 w-full origin-left bg-dbd-yellow/30 opacity-0"
        style={{ transform: "scaleX(0)" }}
      />
      <span className="relative z-10">{children}</span>
    </button>
  )
}

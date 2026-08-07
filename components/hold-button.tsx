"use client"

import { useEffect, useRef, useState } from "react"
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
  const [holding, setHolding] = useState(false)
  const [progress, setProgress] = useState(0) // 0 ~ 100
  const timerRef = useRef<number | null>(null)
  const startTimeRef = useRef<number>(0)
  const animFrameRef = useRef<number | null>(null)

  const startHold = () => {
    if (disabled || holding) return
    setHolding(true)
    setProgress(0)
    startTimeRef.current = Date.now()

    const updateProgress = () => {
      const elapsed = Date.now() - startTimeRef.current
      const pct = Math.min(100, (elapsed / holdDurationMs) * 100)
      setProgress(pct)

      if (elapsed >= holdDurationMs) {
        setHolding(false)
        setProgress(0)
        onConfirm()
      } else {
        animFrameRef.current = requestAnimationFrame(updateProgress)
      }
    }

    animFrameRef.current = requestAnimationFrame(updateProgress)
  }

  const stopHold = () => {
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    setHolding(false)
    setProgress(0)
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
        className
      )}
      style={style}
    >
      {/* Progress Fill Overlay */}
      {holding && (
        <span
          className="absolute inset-0 bg-dbd-yellow/30 pointer-events-none transition-all duration-75 ease-linear"
          style={{ width: `${progress}%` }}
        />
      )}
      <span className="relative z-10">{children}</span>
    </button>
  )
}

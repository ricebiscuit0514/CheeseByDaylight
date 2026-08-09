"use client"

import type { CSSProperties, ReactNode } from "react"
import { useBrowserZoom } from "@/hooks/use-browser-zoom"
import { cn } from "@/lib/utils"

type ZoomCompensatedProps = {
  children: ReactNode
  className?: string
  origin?: CSSProperties["transformOrigin"]
}

export function ZoomCompensated({
  children,
  className,
  origin = "bottom left",
}: ZoomCompensatedProps) {
  const browserZoom = useBrowserZoom()
  const needsCompensation = Math.abs(browserZoom - 1) > 0.01

  return (
    <div
      className={cn(className)}
      style={
        needsCompensation
          ? {
              transform: `scale(${1 / browserZoom})`,
              transformOrigin: origin,
            }
          : undefined
      }
    >
      {children}
    </div>
  )
}

"use client"

import { ZoomCompensated } from "@/components/zoom-compensated"
import type { ScoreboardRoomRole } from "@/hooks/use-scoreboard-room"
import { cn } from "@/lib/utils"

type SyncStatusCompactLabelProps = {
  role: ScoreboardRoomRole
}

export function SyncStatusCompactLabel({ role }: SyncStatusCompactLabelProps) {
  if (role === "local") return null

  const label = role === "host" ? "점수판 공유 중" : "점수판 관전 중"

  return (
    <ZoomCompensated
      origin="bottom right"
      className="fixed bottom-5 right-4 z-50 md:bottom-6 md:right-8"
    >
      <p
        className={cn(
          "text-[11px] font-bold",
          role === "host" ? "text-emerald-400" : "text-red-400",
        )}
        style={{ fontFamily: "var(--font-godo)" }}
      >
        {label}
      </p>
    </ZoomCompensated>
  )
}

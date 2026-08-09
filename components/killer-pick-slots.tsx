"use client"

import {
  formatFearlessPickSlotLabel,
  getFearlessRowSlots,
  type Team,
} from "@/lib/fearless"
import { KILLER_BY_ID } from "@/lib/killer-catalog"
import { cn } from "@/lib/utils"

export type KillerPickSlotsProps = {
  playerName: string
  team: Team
  killerPicks: readonly string[]
  disabled?: boolean
  onOpen: (slotIndex: number | null) => void
}

function safePlayerName(playerName: string) {
  return playerName.trim() || "이름 미입력"
}

function EmptySlotFrame() {
  return <span className="fearless-empty-frame" aria-hidden="true" />
}

export function KillerPickSlots({
  playerName,
  team,
  killerPicks,
  disabled = false,
  onOpen,
}: KillerPickSlotsProps) {
  const displayName = safePlayerName(playerName)
  const slots = getFearlessRowSlots(killerPicks)

  return (
    <div
      className={cn(
        "fearless-killer-slots",
        `fearless-killer-slots-${team}`,
      )}
      aria-label={`${displayName} 살인마 픽`}
    >
      {slots.map((slot) => {
        if (slot.kind === "empty") {
          const label = `${displayName} 새 살인마 픽 추가`
          return (
            <button
              key={`slot-empty-${slot.slotIndex}`}
              type="button"
              className="fearless-killer-slot is-empty"
              disabled={disabled}
              aria-label={label}
              onClick={() => onOpen(slot.slotIndex)}
            >
              <EmptySlotFrame />
            </button>
          )
        }

        const killer = KILLER_BY_ID[slot.killerId]
        const killerName =
          killer?.koreanName || killer?.englishName || slot.killerId
        const openLabel = `${displayName} ${formatFearlessPickSlotLabel(slot.slotIndex)}, ${killerName} 열기`

        return (
          <button
            key={`slot-${slot.slotIndex}`}
            type="button"
            className="fearless-killer-slot is-filled fearless-slot-tooltip-wrap"
            disabled={disabled}
            aria-label={openLabel}
            onClick={() => onOpen(slot.slotIndex)}
          >
            <span className="fearless-killer-slot-face" aria-hidden="true">
              {killer ? (
                <img
                  src={killer.smallPortrait}
                  alt=""
                  draggable={false}
                  loading="lazy"
                />
              ) : (
                <span className="fearless-missing-killer">?</span>
              )}
            </span>
            <span className="fearless-slot-tooltip" role="tooltip">
              {killerName}
            </span>
          </button>
        )
      })}
    </div>
  )
}

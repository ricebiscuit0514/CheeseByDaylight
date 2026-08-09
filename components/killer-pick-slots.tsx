"use client"

import { getFearlessRowSlots, type Team } from "@/lib/fearless"
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
              key={`slot-${killerPicks.length}`}
              type="button"
              className="fearless-killer-slot is-empty"
              disabled={disabled}
              title={label}
              aria-label={label}
              onClick={() => onOpen(null)}
            >
              <span className="fearless-empty-frame" aria-hidden="true" />
            </button>
          )
        }

        const killer = KILLER_BY_ID[slot.killerId]
        const killerName =
          killer?.koreanName || killer?.englishName || slot.killerId
        const label = `${displayName} ${slot.slotIndex + 1}번째 픽, ${killerName} 열기`

        return (
          <button
            key={`slot-${slot.slotIndex}`}
            type="button"
            className="fearless-killer-slot is-filled"
            disabled={disabled}
            title={label}
            aria-label={label}
            onClick={() => onOpen(slot.slotIndex)}
          >
            {killer ? (
              <img
                src={killer.smallPortrait}
                alt=""
                draggable={false}
                loading="lazy"
              />
            ) : (
              <span className="fearless-missing-killer" aria-hidden="true">
                ?
              </span>
            )}
            <span className="fearless-slot-index" aria-hidden="true">
              {slot.slotIndex + 1}
            </span>
          </button>
        )
      })}
    </div>
  )
}

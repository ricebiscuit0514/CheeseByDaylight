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
  maxSlots?: number
  disabled?: boolean
  /** Spectator/read-only mode adjusts slot affordances and tooltips. */
  readOnly?: boolean
  /** Team-neutral styling for modes without team colors (e.g. 1v4). */
  monochrome?: boolean
  extendOutward?: boolean
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
  maxSlots = 4,
  disabled = false,
  readOnly = false,
  monochrome = false,
  extendOutward = false,
  onOpen,
}: KillerPickSlotsProps) {
  const displayName = safePlayerName(playerName)
  const emptySlotTooltip = readOnly ? "살인마 목록 열기" : "살인마 선택하기"
  const slots = getFearlessRowSlots(killerPicks, maxSlots)
  const singleSlot = maxSlots === 1

  return (
    <div
      className={cn(
        "fearless-killer-slots",
        monochrome ? "fearless-killer-slots-neutral" : `fearless-killer-slots-${team}`,
        singleSlot && "is-single-slot",
        extendOutward && maxSlots > 4 && "is-five-slot-outside",
      )}
      aria-label={`${displayName} 살인마 픽`}
    >
      {slots.map((slot) => {
        if (slot.kind === "empty") {
          const label = readOnly
            ? `${displayName} 살인마 목록 열기`
            : `${displayName} 새 살인마 픽 추가`
          return (
            <button
              key={`slot-empty-${slot.slotIndex}`}
              type="button"
              className={cn(
                "fearless-killer-slot is-empty fearless-slot-tooltip-wrap",
                !slot.visible && "is-slot-hidden",
              )}
              disabled={disabled || !slot.actionable}
              aria-hidden={!slot.visible}
              tabIndex={slot.visible ? 0 : -1}
              aria-label={label}
              onClick={() => onOpen(slot.slotIndex)}
            >
              <EmptySlotFrame />
              {slot.visible && slot.actionable && (
                <span className="fearless-slot-tooltip" role="tooltip">
                  {emptySlotTooltip}
                </span>
              )}
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

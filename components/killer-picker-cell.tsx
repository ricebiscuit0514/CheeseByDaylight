"use client"

import { memo, useCallback, useState } from "react"
import type { PickEntry } from "@/lib/fearless"
import type { KillerDefinition } from "@/lib/killer-catalog"
import { cn } from "@/lib/utils"

export type KillerPickerCellProps = {
  killer: KillerDefinition
  visiblePicks: readonly PickEntry[]
  pickKey: string
  isBanned: boolean
  isSelected: boolean
  onSelect: (killerId: string) => void
}

function safeName(value: string) {
  return value.trim() || "이름 미입력"
}

function KillerPickerCellComponent({
  killer,
  visiblePicks,
  isBanned,
  isSelected,
  onSelect,
}: KillerPickerCellProps) {
  const isPicked = visiblePicks.length > 0
  const [popTick, setPopTick] = useState(0)
  const killerName =
    killer.koreanName || killer.englishName || killer.id

  const handleClick = useCallback(() => {
    onSelect(killer.id)
    setPopTick((tick) => tick + 1)
  }, [killer.id, onSelect])

  return (
    <button
      type="button"
      className={cn(
        "fearless-picker-cell",
        isPicked && "is-picked",
        isBanned && "is-banned",
        isSelected && "is-selected",
      )}
      aria-pressed={isSelected}
      aria-label={killerName}
      onClick={handleClick}
    >
      <span className="fearless-picker-cell-sizer">
        <span
          key={popTick}
          className="fearless-picker-cell-frame fearless-picker-cell-frame-pop"
        >
          <span className="fearless-picker-portrait">
            <img
              src={killer.bigPortrait}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          </span>
          <span className="fearless-picker-label-row">
            <span className="fearless-picker-killer-name">{killerName}</span>
            {(isPicked || isBanned) && (
              <span className="fearless-picker-status-marks">
                {isPicked && (
                  <span className="fearless-pick-mark" aria-hidden="true">
                    PICK
                  </span>
                )}
                {isBanned && (
                  <span className="fearless-ban-mark" aria-hidden="true">
                    BAN
                  </span>
                )}
              </span>
            )}
          </span>
          {isPicked && (
            <span className="fearless-pick-stack" aria-hidden="true">
              {visiblePicks.map((pick, index) => (
                <span
                  key={`${pick.playerId}-${pick.slotIndex}-${index}`}
                  className={`fearless-pick-name fearless-pick-name-${pick.team}`}
                >
                  {safeName(pick.playerName)}
                </span>
              ))}
            </span>
          )}
        </span>
      </span>
    </button>
  )
}

export const KillerPickerCell = memo(
  KillerPickerCellComponent,
  (previous, next) =>
    previous.killer.id === next.killer.id &&
    previous.isBanned === next.isBanned &&
    previous.isSelected === next.isSelected &&
    previous.pickKey === next.pickKey &&
    previous.onSelect === next.onSelect,
)

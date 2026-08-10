"use client"

import { memo, useCallback, useRef } from "react"
import { useCheeseBurst } from "@/components/cheese-burst"
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
  const frameRef = useRef<HTMLSpanElement>(null)
  const { burst: burstCheese, layer: cheeseBurstLayer } = useCheeseBurst()
  const killerName =
    killer.koreanName || killer.englishName || killer.id

  const handleClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      if (killer.id === "skull-merchant") {
        burstCheese(event.clientX, event.clientY)
      }

      const willDeselect = isSelected
      onSelect(killer.id)
      if (willDeselect) return

      const frame = frameRef.current
      if (!frame) return
      frame.classList.remove("fearless-picker-cell-frame-pop")
      void frame.offsetWidth
      frame.classList.add("fearless-picker-cell-frame-pop")
    },
    [burstCheese, isSelected, killer.id, onSelect],
  )

  const handlePopEnd = useCallback((event: React.AnimationEvent<HTMLSpanElement>) => {
    if (
      event.animationName === "fearless-cell-pop" ||
      event.animationName === "fearless-cell-pop-hover"
    ) {
      event.currentTarget.classList.remove("fearless-picker-cell-frame-pop")
    }
  }, [])

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
      {cheeseBurstLayer}
      <span className="fearless-picker-cell-sizer">
        <span
          ref={frameRef}
          className="fearless-picker-cell-frame"
          onAnimationEnd={handlePopEnd}
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
          <span className="fearless-picker-label-block">
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
            <span className="fearless-picker-label-row">
              <span className="fearless-picker-killer-name">{killerName}</span>
              {isBanned && (
                <span className="fearless-picker-status-marks">
                  <span className="fearless-ban-mark" aria-hidden="true">
                    BAN
                  </span>
                </span>
              )}
            </span>
          </span>
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

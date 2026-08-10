"use client"

import { memo, useCallback, useEffect, useRef, useState } from "react"
import { useCheeseBurst } from "@/components/cheese-burst"
import type { PickEntry } from "@/lib/fearless"
import type { KillerDefinition } from "@/lib/killer-catalog"
import { cn } from "@/lib/utils"

export type KillerPickerCellFeedback = {
  kind: "pick" | "ban" | "unban"
  token: number
}

export type KillerPickerCellProps = {
  killer: KillerDefinition
  visiblePicks: readonly PickEntry[]
  pickKey: string
  isBanned: boolean
  isSelected: boolean
  feedback?: KillerPickerCellFeedback | null
  selectionPopToken?: number
  monochrome?: boolean
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
  feedback,
  selectionPopToken,
  monochrome = false,
  onSelect,
}: KillerPickerCellProps) {
  const isPicked = visiblePicks.length > 0
  const frameRef = useRef<HTMLSpanElement>(null)
  const [activeFlash, setActiveFlash] = useState<
    KillerPickerCellFeedback["kind"] | null
  >(null)
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
      event.animationName === "fearless-cell-pop-hover" ||
      event.animationName === "fearless-cell-pop-selected"
    ) {
      event.currentTarget.classList.remove("fearless-picker-cell-frame-pop")
    }
  }, [])

  useEffect(() => {
    if (!feedback) return

    setActiveFlash(feedback.kind)
  }, [feedback?.kind, feedback?.token])

  useEffect(() => {
    if (!selectionPopToken) return

    const frame = frameRef.current
    if (!frame) return
    frame.classList.remove("fearless-picker-cell-frame-pop")
    void frame.offsetWidth
    frame.classList.add("fearless-picker-cell-frame-pop")
  }, [selectionPopToken])

  const handleFeedbackFlashEnd = useCallback(
    (event: React.AnimationEvent<HTMLSpanElement>) => {
      if (!event.animationName.startsWith("fearless-glow-")) return
      setActiveFlash(null)
    },
    [],
  )

  return (
    <button
      type="button"
      data-killer-id={killer.id}
      className={cn(
        "fearless-picker-cell",
        isPicked && "is-picked",
        isBanned && "is-banned",
        isSelected && "is-selected",
      )}
      aria-pressed={isSelected}
      aria-label={isBanned ? `${killerName}, 밴` : killerName}
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
              className="fearless-picker-portrait-shadow"
              src={killer.bigPortrait}
              alt=""
              aria-hidden="true"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
            <img
              className="fearless-picker-portrait-face"
              src={killer.bigPortrait}
              alt=""
              draggable={false}
              loading="lazy"
              decoding="async"
            />
            <img
              className={cn(
                "fearless-picker-portrait-glow",
                activeFlash && `is-${activeFlash}`,
              )}
              src={killer.bigPortrait}
              alt=""
              aria-hidden="true"
              draggable={false}
              decoding="async"
              onAnimationEnd={handleFeedbackFlashEnd}
            />
          </span>
          <span className="fearless-picker-label-block">
            {isPicked && (
              <span className="fearless-pick-stack" aria-hidden="true">
                {visiblePicks.map((pick, index) => (
                  <span
                    key={`${pick.playerId}-${pick.slotIndex}-${index}`}
                    className={cn(
                      "fearless-pick-name",
                      monochrome
                        ? "fearless-pick-name-neutral"
                        : `fearless-pick-name-${pick.team}`,
                    )}
                  >
                    {safeName(pick.playerName)}
                  </span>
                ))}
              </span>
            )}
            <span className="fearless-picker-label-row">
              <span className="fearless-picker-killer-name">{killerName}</span>
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
    previous.feedback?.token === next.feedback?.token &&
    previous.selectionPopToken === next.selectionPopToken &&
    previous.pickKey === next.pickKey &&
    previous.onSelect === next.onSelect,
)

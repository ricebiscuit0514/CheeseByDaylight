"use client"

import { useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Search, X } from "lucide-react"
import {
  filterVisiblePicks,
  getPickerCellState,
  playerOwnsKillerPick,
  searchKillers,
  type FearlessFilterMode,
  type PickEntry,
  type Team,
} from "@/lib/fearless"
import { KILLER_BY_ID, KILLERS } from "@/lib/killer-catalog"
import { cn } from "@/lib/utils"

export type KillerPickerContext = {
  team: Team
  playerId: string
  playerName: string
  slotIndex: number | null
  currentKillerId?: string
}

export type KillerPickerProps = {
  open: boolean
  context: KillerPickerContext
  allPicks: readonly PickEntry[]
  killerBans: readonly string[]
  /** Current player's ordered picks; used to block same-player duplicates. */
  playerKillerPicks: readonly string[]
  readOnly: boolean
  onPick: (killerId: string) => void
  onCancelPick: () => void
  onToggleBan: (killerId: string) => void
  onClose: () => void
}

const FILTER_OPTIONS: ReadonlyArray<{
  mode: FearlessFilterMode
  label: string
  title: string
}> = [
  { mode: "hard", label: "하드", title: "양 팀의 모든 픽 표시" },
  { mode: "soft", label: "소프트", title: "현재 팀의 픽만 표시" },
  { mode: "personal", label: "개인", title: "현재 플레이어의 픽만 표시" },
]

function safeName(value: string) {
  return value.trim() || "이름 미입력"
}

export function KillerPicker({
  open,
  context,
  allPicks,
  killerBans,
  playerKillerPicks,
  readOnly,
  onPick,
  onCancelPick,
  onToggleBan,
  onClose,
}: KillerPickerProps) {
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const [mounted, setMounted] = useState(false)
  const [filterMode, setFilterMode] =
    useState<FearlessFilterMode>("hard")
  const [query, setQuery] = useState("")
  const [selectedKillerId, setSelectedKillerId] = useState<string | null>(
    context.currentKillerId ?? null,
  )

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    setSelectedKillerId(context.currentKillerId ?? null)
  }, [
    open,
    context.team,
    context.playerId,
    context.slotIndex,
    context.currentKillerId,
  ])

  useEffect(() => {
    if (!open) return

    restoreFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    const focusFrame = window.requestAnimationFrame(() => {
      searchRef.current?.focus()
    })

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.body.style.overflow = previousOverflow
      restoreFocusRef.current?.focus()
      restoreFocusRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault()
        onClose()
        return
      }
      if (event.key !== "Tab") return

      const focusable = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), [href], [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("hidden"))
      if (focusable.length === 0) return

      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      } else if (!panelRef.current?.contains(document.activeElement)) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [open, onClose])

  const visiblePicks = useMemo(
    () =>
      filterVisiblePicks(allPicks, filterMode, {
        team: context.team,
        playerId: context.playerId,
      }),
    [allPicks, filterMode, context.team, context.playerId],
  )
  const filteredKillers = useMemo(() => searchKillers(query), [query])
  const selectedKiller = selectedKillerId
    ? KILLER_BY_ID[selectedKillerId]
    : undefined
  const displayPlayerName = safeName(context.playerName)
  const isCurrentSelection =
    context.slotIndex !== null &&
    selectedKillerId === context.currentKillerId
  const alreadyOwnedByPlayer =
    selectedKillerId !== null &&
    !isCurrentSelection &&
    playerOwnsKillerPick(
      { id: context.playerId, name: context.playerName, killerPicks: [...playerKillerPicks] },
      selectedKillerId,
      context.slotIndex,
    )
  const pickActionLabel =
    context.slotIndex === null
      ? "픽 하기"
      : isCurrentSelection
        ? "픽 취소하기"
        : "픽 변경"
  const selectedIsBanned =
    selectedKillerId !== null && killerBans.includes(selectedKillerId)

  if (!mounted || !open) return null

  return createPortal(
    <div
      className="fearless-picker-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <section
        ref={panelRef}
        className={cn(
          "fearless-picker-panel",
          `fearless-picker-panel-${context.team}`,
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <header className="fearless-picker-header">
          <div className="fearless-picker-heading">
            <p id={descriptionId}>
              {displayPlayerName}
              <span aria-hidden="true"> · </span>
              {context.slotIndex === null
                ? "새 픽"
                : `${context.slotIndex + 1}번째 픽`}
            </p>
            <h2 id={titleId}>살인마 선택</h2>
          </div>
          <button
            type="button"
            className="fearless-picker-close"
            onClick={onClose}
            aria-label="살인마 선택 창 닫기"
            title="닫기"
          >
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="fearless-picker-toolbar">
          <div
            className="fearless-filter-tabs"
            role="group"
            aria-label="피어리스 필터"
          >
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.mode}
                type="button"
                className={cn(
                  "fearless-filter-tab",
                  filterMode === option.mode && "is-active",
                )}
                aria-pressed={filterMode === option.mode}
                title={option.title}
                onClick={() => setFilterMode(option.mode)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <label className="fearless-picker-search">
            <Search aria-hidden="true" />
            <span className="sr-only">살인마 검색</span>
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="살인마 검색"
              autoComplete="off"
            />
          </label>
        </div>

        <div className="fearless-picker-grid-wrap">
          <div className="fearless-picker-grid">
            {filteredKillers.map((killer) => {
              const cellState = getPickerCellState(
                killer.id,
                visiblePicks,
                killerBans,
              )
              const isPicked = cellState.visiblePicks.length > 0
              const isSelected = selectedKillerId === killer.id
              const killerName =
                killer.koreanName || killer.englishName || killer.id
              const stateDescription = [
                cellState.isBanned ? "밴됨" : "",
                isPicked
                  ? `${cellState.visiblePicks.length}회 픽됨`
                  : "",
              ]
                .filter(Boolean)
                .join(", ")

              return (
                <button
                  key={killer.id}
                  type="button"
                  className={cn(
                    "fearless-picker-cell",
                    isPicked && "is-picked",
                    cellState.isBanned && "is-banned",
                    isSelected && "is-selected",
                  )}
                  aria-pressed={isSelected}
                  aria-label={`${killerName}${stateDescription ? `, ${stateDescription}` : ""}`}
                  title={`${killerName}${stateDescription ? ` · ${stateDescription}` : ""}`}
                  onClick={() => setSelectedKillerId(killer.id)}
                >
                  <span className="fearless-picker-portrait">
                    <img
                      src={killer.bigPortrait}
                      alt=""
                      draggable={false}
                      loading="lazy"
                    />
                  </span>
                  <span className="fearless-picker-killer-name">
                    {killerName}
                  </span>
                  {cellState.isBanned && (
                    <span className="fearless-ban-mark" aria-hidden="true">
                      밴
                    </span>
                  )}
                  {isPicked && (
                    <span
                      className="fearless-pick-stack"
                      aria-hidden="true"
                    >
                      {cellState.visiblePicks.map((pick, index) => (
                        <span
                          key={`${pick.playerId}-${pick.slotIndex}-${index}`}
                          className={`fearless-pick-name fearless-pick-name-${pick.team}`}
                        >
                          {safeName(pick.playerName)}
                        </span>
                      ))}
                    </span>
                  )}
                </button>
              )
            })}
            {filteredKillers.length === 0 && (
              <p className="fearless-picker-empty">
                검색 결과가 없습니다.
              </p>
            )}
          </div>
        </div>

        {!readOnly && selectedKillerId && (
          <footer className="fearless-picker-footer">
            <div className="fearless-picker-selection">
              <span>선택</span>
              <strong>
                {selectedKiller?.koreanName ||
                  selectedKiller?.englishName ||
                  selectedKillerId}
              </strong>
            </div>
            <div className="fearless-picker-actions">
              <button
                type="button"
                className="fearless-picker-action is-ban"
                onClick={() => onToggleBan(selectedKillerId)}
              >
                {selectedIsBanned ? "밴 취소하기" : "밴 하기"}
              </button>
              <button
                type="button"
                className="fearless-picker-action is-primary"
                disabled={alreadyOwnedByPlayer}
                title={
                  alreadyOwnedByPlayer
                    ? "이미 이 플레이어가 픽한 살인마입니다"
                    : undefined
                }
                onClick={() => {
                  if (isCurrentSelection) onCancelPick()
                  else onPick(selectedKillerId)
                }}
              >
                {alreadyOwnedByPlayer ? "이미 픽함" : pickActionLabel}
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>,
    document.body,
  )
}

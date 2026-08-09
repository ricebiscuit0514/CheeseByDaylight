"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Search, X } from "lucide-react"
import { KillerPickerCell } from "@/components/killer-picker-cell"
import {
  filterVisiblePicks,
  formatFearlessPickSlotLabel,
  getPickerCellState,
  playerOwnsKillerPick,
  searchKillers,
  type FearlessFilterMode,
  type PickEntry,
  type Team,
} from "@/lib/fearless"
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
  const pickerCellStates = useMemo(() => {
    const states = new Map<
      string,
      { visiblePicks: PickEntry[]; isBanned: boolean; pickKey: string }
    >()
    for (const killer of filteredKillers) {
      const cellState = getPickerCellState(
        killer.id,
        visiblePicks,
        killerBans,
      )
      states.set(killer.id, {
        visiblePicks: cellState.visiblePicks,
        isBanned: cellState.isBanned,
        pickKey: cellState.visiblePicks
          .map((pick) => `${pick.playerId}:${pick.slotIndex}:${pick.team}`)
          .join("|"),
      })
    }
    return states
  }, [filteredKillers, visiblePicks, killerBans])
  const handleSelectKiller = useCallback((killerId: string) => {
    setSelectedKillerId(killerId)
  }, [])
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
  const isAppendSlot =
    context.slotIndex === null ||
    context.slotIndex >= playerKillerPicks.length
  const pickActionLabel = isAppendSlot
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
      >
        <header className="fearless-picker-header">
          <div className="fearless-picker-heading">
            <h2 id={titleId} className="fearless-picker-title">
              <span className="fearless-picker-title-name">
                {displayPlayerName}
              </span>{" "}
              <span className="fearless-picker-title-pick">
                {formatFearlessPickSlotLabel(context.slotIndex)}
              </span>
            </h2>
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

          {!readOnly && (
            <div className="fearless-picker-toolbar-actions">
              {selectedKillerId ? (
                <div className="fearless-picker-actions">
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
                  <button
                    type="button"
                    className="fearless-picker-action is-ban"
                    onClick={() => onToggleBan(selectedKillerId)}
                  >
                    {selectedIsBanned ? "밴 취소하기" : "밴 하기"}
                  </button>
                </div>
              ) : null}
            </div>
          )}

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
            {query.length > 0 && (
              <button
                type="button"
                className="fearless-picker-search-clear"
                aria-label="검색어 지우기"
                onClick={() => {
                  setQuery("")
                  searchRef.current?.focus()
                }}
              >
                <X aria-hidden="true" />
              </button>
            )}
          </label>
        </div>

        <div className="fearless-picker-grid-wrap">
          <div className="fearless-picker-grid">
            {filteredKillers.map((killer) => {
              const cellState = pickerCellStates.get(killer.id)
              return (
                <KillerPickerCell
                  key={killer.id}
                  killer={killer}
                  visiblePicks={cellState?.visiblePicks ?? []}
                  pickKey={cellState?.pickKey ?? ""}
                  isBanned={cellState?.isBanned ?? false}
                  isSelected={selectedKillerId === killer.id}
                  onSelect={handleSelectKiller}
                />
              )
            })}
            {filteredKillers.length === 0 && (
              <p className="fearless-picker-empty">
                검색 결과가 없습니다.
              </p>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

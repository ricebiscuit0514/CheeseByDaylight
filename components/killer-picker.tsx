"use client"

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Search, Minus, Plus, X } from "lucide-react"
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
import type { PickerFeedbackKind, PickerUiSyncState } from "@/lib/picker-ui-sync"
import {
  clampPickerZoomLevel,
  getMaxPickerZoomLevel,
  getPickerBaseColumns,
  getPickerColumnCount,
  getPickerGridGap,
  getPickerMinColumns,
  getPickerUiScale,
  getPickerZoomAudience,
  readStoredPickerZoomLevel,
  writeStoredPickerZoomLevel,
} from "@/lib/picker-zoom"
import { cn } from "@/lib/utils"

export type KillerPickerContext = {
  /** Pick flow from player slots, or read-only catalog with ban controls. */
  mode?: "pick" | "catalog"
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
  /** Host publishes picker highlight/feedback for synced viewers. */
  onSelectionSync?: (killerId: string | null) => void
  onFeedbackSync?: (killerId: string, kind: PickerFeedbackKind) => void
  /** Viewer replays host picker effects while the catalog is open. */
  syncedPickerUi?: PickerUiSyncState | null
  /** Read-only slot/catalog title override for spectators. */
  viewerTeamCatalogTitle?: string
  /** Team-neutral styling for modes without team colors (e.g. 1v4). */
  monochrome?: boolean
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

const SOLO_FILTER_OPTIONS: ReadonlyArray<{
  mode: FearlessFilterMode
  label: string
  title: string
}> = [
  { mode: "hard", label: "하드", title: "모든 플레이어가 픽한 살인마" },
  { mode: "soft", label: "소프트", title: "해당 플레이어가 픽한 살인마" },
]

function safeName(value: string) {
  return value.trim() || "이름 미입력"
}

function decodePickerPortraits(container: HTMLElement | null) {
  if (!container) return

  const images = container.querySelectorAll<HTMLImageElement>(
    ".fearless-picker-portrait-face, .fearless-picker-portrait-shadow, .fearless-picker-portrait-glow",
  )

  for (const image of images) {
    if (!image.complete) continue
    void image.decode().catch(() => {})
  }
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
  onSelectionSync,
  onFeedbackSync,
  syncedPickerUi = null,
  viewerTeamCatalogTitle,
  monochrome = false,
}: KillerPickerProps) {
  const titleId = useId()
  const bannedColorizeFilterId = useId().replace(/:/g, "")
  const pickedToneFilterId = useId().replace(/:/g, "")
  const panelRef = useRef<HTMLElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const restoreFocusRef = useRef<HTMLElement | null>(null)
  const skipSelectionSyncRef = useRef(false)
  const lastRemoteSelectionSeqRef = useRef(0)
  const lastRemoteFeedbackTokenRef = useRef(0)
  const onSelectionSyncRef = useRef(onSelectionSync)
  const onFeedbackSyncRef = useRef(onFeedbackSync)

  useEffect(() => {
    onSelectionSyncRef.current = onSelectionSync
  }, [onSelectionSync])

  useEffect(() => {
    onFeedbackSyncRef.current = onFeedbackSync
  }, [onFeedbackSync])
  const [mounted, setMounted] = useState(false)
  const [filterMode, setFilterMode] =
    useState<FearlessFilterMode>("hard")
  const [query, setQuery] = useState("")
  const [selectedKillerId, setSelectedKillerId] = useState<string | null>(
    context.currentKillerId ?? null,
  )
  const [cellFeedback, setCellFeedback] = useState<{
    killerId: string
    kind: "pick" | "ban" | "unban"
    token: number
  } | null>(null)
  const [viewportWidth, setViewportWidth] = useState(1024)
  const [zoomLevel, setZoomLevel] = useState(0)
  const [hidePicked, setHidePicked] = useState(false)
  const [hideBanned, setHideBanned] = useState(false)
  const zoomAudience = getPickerZoomAudience(readOnly)
  const filterOptions = monochrome ? SOLO_FILTER_OPTIONS : FILTER_OPTIONS
  const isCatalog = context.mode === "catalog"
  const effectiveFilterMode: FearlessFilterMode = isCatalog ? "hard" : filterMode

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (monochrome && filterMode === "personal") {
      setFilterMode("hard")
    }
  }, [monochrome, filterMode])

  useEffect(() => {
    setViewportWidth(window.innerWidth)
    setZoomLevel(readStoredPickerZoomLevel(zoomAudience))
    const handleResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [zoomAudience])

  const baseColumns = getPickerBaseColumns(viewportWidth)
  const minColumns = getPickerMinColumns(viewportWidth)
  const maxZoomLevel = getMaxPickerZoomLevel(baseColumns, minColumns)
  const clampedZoomLevel = clampPickerZoomLevel(zoomLevel, maxZoomLevel)
  const columnCount = getPickerColumnCount(viewportWidth, clampedZoomLevel)
  const gridGap = getPickerGridGap(clampedZoomLevel, maxZoomLevel)
  const pickerUiScale = getPickerUiScale(clampedZoomLevel, maxZoomLevel)

  useEffect(() => {
    if (zoomLevel !== clampedZoomLevel) {
      setZoomLevel(clampedZoomLevel)
    }
  }, [clampedZoomLevel, zoomLevel])

  useEffect(() => {
    writeStoredPickerZoomLevel(zoomAudience, clampedZoomLevel)
  }, [clampedZoomLevel, zoomAudience])

  const handleZoomOut = useCallback(() => {
    setZoomLevel((level) => Math.max(0, level - 1))
  }, [])

  const handleZoomIn = useCallback(() => {
    setZoomLevel((level) => Math.min(maxZoomLevel, level + 1))
  }, [maxZoomLevel])

  const applySelection = useCallback(
    (killerId: string | null, options?: { sync?: boolean }) => {
      setSelectedKillerId(killerId)
      if (!readOnly && options?.sync !== false) {
        onSelectionSyncRef.current?.(killerId)
      }
    },
    [readOnly],
  )

  const handleSelectKiller = useCallback(
    (killerId: string) => {
      let nextSelection: string | null = null
      setSelectedKillerId((current) => {
        nextSelection = current === killerId ? null : killerId
        return nextSelection
      })
      if (!readOnly) {
        onSelectionSyncRef.current?.(nextSelection)
      }
    },
    [readOnly],
  )

  useEffect(() => {
    if (!open) return
    if (skipSelectionSyncRef.current) {
      skipSelectionSyncRef.current = false
      return
    }
    const next = context.currentKillerId ?? null
    setSelectedKillerId(next)
    if (!readOnly) onSelectionSyncRef.current?.(next)
  }, [
    open,
    readOnly,
    context.mode,
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
      filterVisiblePicks(allPicks, effectiveFilterMode, {
        team: context.team,
        playerId: context.playerId,
        soloMode: monochrome,
      }),
    [allPicks, effectiveFilterMode, context.team, context.playerId, monochrome],
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
  const displayedKillers = useMemo(
    () =>
      filteredKillers.filter((killer) => {
        const cellState = pickerCellStates.get(killer.id)
        if (hidePicked && (cellState?.visiblePicks.length ?? 0) > 0) {
          return false
        }
        if (hideBanned && (cellState?.isBanned ?? false)) {
          return false
        }
        return true
      }),
    [filteredKillers, pickerCellStates, hidePicked, hideBanned],
  )

  useEffect(() => {
    if (!selectedKillerId) return
    const cellState = pickerCellStates.get(selectedKillerId)
    if (!cellState) return
    if (hidePicked && cellState.visiblePicks.length > 0) {
      applySelection(null)
    } else if (hideBanned && cellState.isBanned) {
      applySelection(null)
    }
  }, [applySelection, hideBanned, hidePicked, pickerCellStates, selectedKillerId])

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

  const dismissSelectionAfterAction = useCallback(() => {
    skipSelectionSyncRef.current = true
    applySelection(null)
  }, [applySelection])

  const pulseCell = useCallback(
    (killerId: string, kind: "pick" | "ban" | "unban") => {
      const token = Date.now()
      setCellFeedback({ killerId, kind, token })
      onFeedbackSyncRef.current?.(killerId, kind)
    },
    [],
  )

  useEffect(() => {
    if (!readOnly || !open || !syncedPickerUi) return

    if (syncedPickerUi.selectionSeq !== lastRemoteSelectionSeqRef.current) {
      lastRemoteSelectionSeqRef.current = syncedPickerUi.selectionSeq
      setSelectedKillerId(syncedPickerUi.selectedKillerId)
    }

    if (
      syncedPickerUi.feedbackToken > 0 &&
      syncedPickerUi.feedbackToken !== lastRemoteFeedbackTokenRef.current &&
      syncedPickerUi.feedbackKillerId &&
      syncedPickerUi.feedbackKind
    ) {
      lastRemoteFeedbackTokenRef.current = syncedPickerUi.feedbackToken
      setCellFeedback({
        killerId: syncedPickerUi.feedbackKillerId,
        kind: syncedPickerUi.feedbackKind,
        token: syncedPickerUi.feedbackToken,
      })
    }
  }, [open, readOnly, syncedPickerUi])

  const handlePickAction = useCallback(() => {
    if (!selectedKillerId) return
    if (isCurrentSelection) onCancelPick()
    else {
      onPick(selectedKillerId)
      pulseCell(selectedKillerId, "pick")
    }
    dismissSelectionAfterAction()
  }, [
    dismissSelectionAfterAction,
    isCurrentSelection,
    onCancelPick,
    onPick,
    pulseCell,
    selectedKillerId,
  ])

  const handleBanAction = useCallback(() => {
    if (!selectedKillerId) return
    const wasBanned = killerBans.includes(selectedKillerId)
    onToggleBan(selectedKillerId)
    pulseCell(selectedKillerId, wasBanned ? "unban" : "ban")
    dismissSelectionAfterAction()
  }, [
    dismissSelectionAfterAction,
    killerBans,
    onToggleBan,
    pulseCell,
    selectedKillerId,
  ])

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
          isCatalog || monochrome
            ? "fearless-picker-panel-catalog"
            : `fearless-picker-panel-${context.team}`,
          !isCatalog && "fearless-picker-panel-pick",
        )}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{
          ["--fearless-banned-filter" as string]: `url(#${bannedColorizeFilterId})`,
          ["--fearless-picked-filter" as string]: `url(#${pickedToneFilterId})`,
        }}
        onMouseDown={(event) => {
          if (!selectedKillerId) return
          const target = event.target
          if (!(target instanceof HTMLElement)) return
          if (target.closest(".fearless-picker-cell")) return
          if (target.closest("button, input, label, [role='group']")) return
          applySelection(null)
        }}
      >
        <svg className="fearless-picker-svg-filters" aria-hidden="true">
          <defs>
            <filter
              id={bannedColorizeFilterId}
              colorInterpolationFilters="sRGB"
            >
              <feColorMatrix
                in="SourceGraphic"
                type="matrix"
                result="colorized"
                values="
                  0.190 0.638 0.064 0 0.022
                  0.069 0.231 0.023 0 0
                  0.069 0.231 0.023 0 0
                  0     0     0     1 0
                "
              />
              <feComponentTransfer in="colorized" colorInterpolationFilters="sRGB">
                <feFuncR
                  type="table"
                  tableValues="0.03 0.13 0.23 0.33 0.42 0.50 0.58 0.62 0.66 0.69 0.72"
                />
                <feFuncG
                  type="table"
                  tableValues="0.03 0.13 0.23 0.33 0.42 0.50 0.58 0.62 0.66 0.69 0.72"
                />
                <feFuncB
                  type="table"
                  tableValues="0.03 0.13 0.23 0.33 0.42 0.50 0.58 0.62 0.66 0.69 0.72"
                />
              </feComponentTransfer>
            </filter>
            <filter
              id={pickedToneFilterId}
              colorInterpolationFilters="sRGB"
            >
              <feColorMatrix
                in="SourceGraphic"
                type="matrix"
                result="grayscale"
                values="
                  0.2126 0.7152 0.0722 0 0
                  0.2126 0.7152 0.0722 0 0
                  0.2126 0.7152 0.0722 0 0
                  0      0      0      1 0
                "
              />
              <feComponentTransfer in="grayscale" colorInterpolationFilters="sRGB">
                <feFuncR
                  type="table"
                  tableValues="0.03 0.13 0.23 0.33 0.42 0.50 0.58 0.62 0.66 0.69 0.72"
                />
                <feFuncG
                  type="table"
                  tableValues="0.03 0.13 0.23 0.33 0.42 0.50 0.58 0.62 0.66 0.69 0.72"
                />
                <feFuncB
                  type="table"
                  tableValues="0.03 0.13 0.23 0.33 0.42 0.50 0.58 0.62 0.66 0.69 0.72"
                />
              </feComponentTransfer>
            </filter>
          </defs>
        </svg>
        <header className="fearless-picker-header">
          <div className="fearless-picker-heading">
            <h2 id={titleId} className="fearless-picker-title">
              {isCatalog ? (
                <span className="fearless-picker-title-catalog">살인마 목록</span>
              ) : readOnly && viewerTeamCatalogTitle ? (
                <span className="fearless-picker-title-catalog">
                  {viewerTeamCatalogTitle}
                </span>
              ) : (
                <>
                  <span className="fearless-picker-title-name">
                    {displayPlayerName}
                  </span>{" "}
                  <span className="fearless-picker-title-pick">
                    {formatFearlessPickSlotLabel(context.slotIndex)}
                  </span>
                </>
              )}
            </h2>
          </div>

          {!readOnly && (
            <div
              className={cn(
                "fearless-picker-header-pick-actions",
                isCatalog && "is-ban-only",
              )}
            >
              <div className="fearless-picker-actions">
                {!isCatalog && (
                  <button
                    type="button"
                    className="fearless-picker-action is-primary"
                    disabled={!selectedKillerId || alreadyOwnedByPlayer}
                    title={
                      alreadyOwnedByPlayer
                        ? "이미 이 플레이어가 픽한 살인마입니다"
                        : undefined
                    }
                    onClick={handlePickAction}
                  >
                    {!selectedKillerId
                      ? "픽 하기"
                      : alreadyOwnedByPlayer
                        ? "이미 픽함"
                        : pickActionLabel}
                  </button>
                )}
                <button
                  type="button"
                  className="fearless-picker-action is-ban"
                  disabled={!selectedKillerId}
                  onClick={handleBanAction}
                >
                  {selectedKillerId && selectedIsBanned
                    ? "밴 취소하기"
                    : "밴 하기"}
                </button>
              </div>
            </div>
          )}

          <div className="fearless-picker-header-end">
            <div
              className="fearless-picker-hide-filters"
              role="group"
              aria-label="목록 숨김"
            >
              <label className="fearless-picker-hide-filter">
                <input
                  type="checkbox"
                  checked={hidePicked}
                  onChange={(event) => setHidePicked(event.target.checked)}
                />
                <span>픽 숨기기</span>
              </label>
              <label className="fearless-picker-hide-filter">
                <input
                  type="checkbox"
                  checked={hideBanned}
                  onChange={(event) => setHideBanned(event.target.checked)}
                />
                <span>밴 숨기기</span>
              </label>
            </div>

            {maxZoomLevel > 0 && (
              <div
                className="fearless-picker-zoom"
                role="group"
                aria-label="목록 크기"
              >
                <button
                  type="button"
                  className="fearless-picker-zoom-btn"
                  aria-label="목록 축소"
                  title="목록 축소"
                  disabled={clampedZoomLevel <= 0}
                  onClick={handleZoomOut}
                >
                  <Minus aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="fearless-picker-zoom-btn"
                  aria-label="목록 확대"
                  title="목록 확대"
                  disabled={clampedZoomLevel >= maxZoomLevel}
                  onClick={handleZoomIn}
                >
                  <Plus aria-hidden="true" />
                </button>
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
        </header>

        {!isCatalog && (
          <div className="fearless-picker-filter-row">
            <div
              className={cn(
                "fearless-filter-tabs",
                monochrome && "fearless-filter-tabs-solo",
              )}
              role="group"
              aria-label="피어리스 필터"
            >
              {filterOptions.map((option) => (
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
          </div>
        )}

        <div
          className="fearless-picker-grid-wrap"
          onMouseDown={(event) => {
            if (!selectedKillerId) return
            if (event.target === event.currentTarget) {
              applySelection(null)
            }
          }}
        >
          <div
            className="fearless-picker-grid"
            style={{
              gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))`,
              gap: `${gridGap.rowGap} ${gridGap.columnGap}`,
              ["--picker-ui-scale" as string]: pickerUiScale,
            }}
          >
            {displayedKillers.map((killer) => {
              const cellState = pickerCellStates.get(killer.id)
              return (
                <KillerPickerCell
                  key={killer.id}
                  killer={killer}
                  visiblePicks={cellState?.visiblePicks ?? []}
                  pickKey={cellState?.pickKey ?? ""}
                  isBanned={cellState?.isBanned ?? false}
                  isSelected={selectedKillerId === killer.id}
                  monochrome={monochrome}
                  selectionPopToken={
                    readOnly &&
                    syncedPickerUi?.selectedKillerId === killer.id
                      ? syncedPickerUi.selectionSeq
                      : undefined
                  }
                  feedback={
                    cellFeedback?.killerId === killer.id
                      ? {
                          kind: cellFeedback.kind,
                          token: cellFeedback.token,
                        }
                      : null
                  }
                  onSelect={handleSelectKiller}
                />
              )
            })}
            {displayedKillers.length === 0 && (
              <p className="fearless-picker-empty">
                {filteredKillers.length === 0
                  ? "검색 결과가 없습니다."
                  : "표시할 살인마가 없습니다."}
              </p>
            )}
          </div>
        </div>
      </section>
    </div>,
    document.body,
  )
}

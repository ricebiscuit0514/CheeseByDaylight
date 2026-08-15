"use client"

import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { Copy } from "lucide-react"
import { useRouter } from "next/navigation"
import { PlayerRow, type Player } from "@/components/player-row"
import { KillerPickSlots } from "@/components/killer-pick-slots"
import { KillerPicker, type KillerPickerContext } from "@/components/killer-picker"
import { ScoreboardSyncPanel } from "@/components/scoreboard-sync-panel"
import { AppVersionCorner } from "@/components/app-version"
import { useScoreboardRoom } from "@/hooks/use-scoreboard-room"
import type { FivePlayerSyncState } from "@/lib/firebase/scoreboard-room"
import { MODE_SWITCH_SESSION_KEY, VIEWER_SESSION_KEY, loadRoomSession, normalizeFivePlayerState } from "@/lib/firebase/scoreboard-room"
import {
  cancelPlayerKillerPick,
  flattenFearlessPicks,
  setPlayerKillerPick,
  toggleKillerBan,
} from "@/lib/fearless"
import {
  applyFivePlayerNameCommit,
  clearPlayerRosterField,
} from "@/lib/roster-name-commit"
import { buildScoreAnimationPatch } from "@/lib/player-score-animation"
import { ViewerLinkExpiredNotice } from "@/components/viewer-link-expired-notice"
import { ZoomCompensated } from "@/components/zoom-compensated"
import { UtilityUiToggle } from "@/components/utility-ui-toggle"
import { SyncStatusCompactLabel } from "@/components/sync-status-compact-label"
import {
  consumeViewerSessionEndedNotice,
  type ViewerSessionEndReason,
} from "@/lib/viewer-session-notice"
import { useUtilityUiHidden } from "@/hooks/use-utility-ui-hidden"
import {
  clearPickerSelection,
  createInitialPickerUi,
  nextPickerFeedback,
  nextPickerSelection,
  type PickerFeedbackKind,
  type PickerUiSyncState,
} from "@/lib/picker-ui-sync"
import { useAutoDismiss, RESET_MENU_IDLE_MS } from "@/hooks/use-auto-dismiss"
import { useDismissOnOutsideInteraction } from "@/hooks/use-dismiss-on-outside-interaction"
import { cn } from "@/lib/utils"

import {
  RESET_CONFIRM_NO,
  RESET_CONFIRM_PANEL,
  RESET_CONFIRM_TEXT,
  RESET_CONFIRM_YES,
  RESET_ROSTER_KILLER_BTN,
} from "@/lib/scoreboard-reset-ui"

const DEFAULT_RECEIVING = [5, 8, 10, 12, 15]
const DEFAULT_GIVING = [15, 12, 10, 8, 5]

const createInitialPlayers = (): Player[] => [
  { id: "1", name: "", kills: 0, played: false },
  { id: "2", name: "", kills: 0, played: false },
  { id: "3", name: "", kills: 0, played: false },
  { id: "4", name: "", kills: 0, played: false },
  { id: "5", name: "", kills: 0, played: false },
]

export function FivePlayerMode() {
  const router = useRouter()
  
  // State
  const [players, setPlayers] = useState<Player[]>(createInitialPlayers)
  const [receivingConfig, setReceivingConfig] = useState<number[]>(DEFAULT_RECEIVING)
  const [givingConfig, setGivingConfig] = useState<number[]>(DEFAULT_GIVING)
  
  // Modals & Confirm Prompts State
  const [showGuide, setShowGuide] = useState(false)
  const [showResetMenu, setShowResetMenu] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showKillerResetConfirm, setShowKillerResetConfirm] = useState(false)
  const [showRosterResetConfirm, setShowRosterResetConfirm] = useState(false)
  const [showFullResetConfirm, setShowFullResetConfirm] = useState(false)
  const [showModeSwitchConfirm, setShowModeSwitchConfirm] = useState(false)
  
  const [removeMode, setRemoveMode] = useState<boolean>(false)
  const [killerBans, setKillerBans] = useState<string[]>([])
  const [pickerContext, setPickerContext] = useState<KillerPickerContext | null>(
    null,
  )
  const [pickerUi, setPickerUi] = useState<PickerUiSyncState>(() =>
    createInitialPickerUi(),
  )
  const [anim, setAnim] = useState<Record<string, number>>({})
  const [prevKillsMap, setPrevKillsMap] = useState<Record<string, number>>({})
  const animRef = useRef(anim)
  const prevKillsRef = useRef(prevKillsMap)
  const remotePlayersRef = useRef<Player[] | null>(null)

  useEffect(() => {
    animRef.current = anim
  }, [anim])

  useEffect(() => {
    prevKillsRef.current = prevKillsMap
  }, [prevKillsMap])

  // Auto-increment ID generator
  const playerIdCounter = useRef(6)
  const dragItem = useRef<string | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  const handleDragEnter = (targetId: string) => {
    const currentId = dragItem.current
    if (!currentId || currentId === targetId) return
    setPlayers((prev) => {
      const fromIndex = prev.findIndex((p) => p.id === currentId)
      const toIndex = prev.findIndex((p) => p.id === targetId)
      if (fromIndex === -1 || toIndex === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(fromIndex, 1)
      next.splice(toIndex, 0, moved)
      return next
    })
  }

  const [isLoaded, setIsLoaded] = useState(false)
  const [hasSeenGuide, setHasSeenGuide] = useState(true)
  const [viewerSessionEndReason, setViewerSessionEndReason] =
    useState<ViewerSessionEndReason | null>(null)

  useEffect(() => {
    const reason = consumeViewerSessionEndedNotice()
    if (reason) setViewerSessionEndReason(reason)
  }, [])

  useEffect(() => {
    try {
      const seen = localStorage.getItem("dbd-guide-seen-1v4")
      if (!seen) setHasSeenGuide(false)
    } catch {
      // ignore
    }
  }, [])

  const handleOpenGuide = () => {
    setShowResetConfirm(false)
    setShowFullResetConfirm(false)
    setShowGuide(true)
    if (!hasSeenGuide) {
      setHasSeenGuide(true)
      try {
        localStorage.setItem("dbd-guide-seen-1v4", "true")
      } catch {
        // ignore
      }
    }
  }

  // Load/Save state from localStorage to maintain data when navigating away
  useEffect(() => {
    try {
      if (sessionStorage.getItem(MODE_SWITCH_SESSION_KEY)) {
        sessionStorage.removeItem(MODE_SWITCH_SESSION_KEY)
        setIsLoaded(true)
        return
      }
    } catch {
      // ignore
    }

    const viewerSession = loadRoomSession(sessionStorage, VIEWER_SESSION_KEY)
    if (viewerSession?.gameMode === "5p") {
      setIsLoaded(true)
      return
    }

    const saved = localStorage.getItem("dbd-5p-state-v2")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        const EXPIRATION_TIME_MS = 3 * 60 * 60 * 1000 // 3시간 만료
        if (parsed.updatedAt && Date.now() - parsed.updatedAt > EXPIRATION_TIME_MS) {
          localStorage.removeItem("dbd-5p-state-v2")
        } else {
          const normalized = normalizeFivePlayerState({
            mode: "5p",
            players: Array.isArray(parsed.players) ? parsed.players : [],
            receivingConfig: Array.isArray(parsed.receivingConfig)
              ? parsed.receivingConfig
              : DEFAULT_RECEIVING,
            givingConfig: Array.isArray(parsed.givingConfig)
              ? parsed.givingConfig
              : DEFAULT_GIVING,
            killerBans: Array.isArray(parsed.killerBans) ? parsed.killerBans : [],
          })
          setPlayers(normalized.players)
          setReceivingConfig(normalized.receivingConfig)
          setGivingConfig(normalized.givingConfig)
          setKillerBans(normalized.killerBans)
        }
      } catch (e) {
        console.error("Failed to parse saved state", e)
      }
    }
    setIsLoaded(true)
  }, [])

  const syncState = useMemo<FivePlayerSyncState>(
    () => ({
      mode: "5p",
      players,
      receivingConfig,
      givingConfig,
      killerBans,
      pickerUi,
    }),
    [players, receivingConfig, givingConfig, killerBans, pickerUi],
  )

  const applyRemoteState = useCallback((remote: FivePlayerSyncState) => {
    if (remote.mode !== "5p") return

    const previous = remotePlayersRef.current
    if (previous) {
      const patch = buildScoreAnimationPatch(
        previous,
        remote.players,
        animRef.current,
        prevKillsRef.current,
        "five-player",
      )
      animRef.current = patch.anim
      prevKillsRef.current = patch.prevKillsMap
      setAnim(patch.anim)
      setPrevKillsMap(patch.prevKillsMap)
    } else {
      animRef.current = {}
      prevKillsRef.current = {}
      setAnim({})
      setPrevKillsMap({})
    }

    remotePlayersRef.current = remote.players
    setPlayers(remote.players)
    setReceivingConfig(remote.receivingConfig)
    setGivingConfig(remote.givingConfig)
    setKillerBans(remote.killerBans)
    setPickerUi(remote.pickerUi)
    setRemoveMode(false)
    setIsEditingPinball(false)
    const maxId = remote.players.reduce((max, player) => {
      const parsed = Number.parseInt(player.id, 10)
      return Number.isFinite(parsed) ? Math.max(max, parsed) : max
    }, 5)
    playerIdCounter.current = maxId + 1
  }, [])

  const sync = useScoreboardRoom({
    gameMode: "5p",
    enabled: isLoaded,
    state: syncState,
    onRemoteState: applyRemoteState,
  })
  const isViewer = sync.role === "viewer"
  const { hidden: utilityUiHidden, toggle: toggleUtilityUi } = useUtilityUiHidden()

  useEffect(() => {
    if (!utilityUiHidden) return
    setShowResetConfirm(false)
    setShowFullResetConfirm(false)
    setShowModeSwitchConfirm(false)
  }, [utilityUiHidden])

  useEffect(() => {
    if (!isViewer) remotePlayersRef.current = null
  }, [isViewer])

  useEffect(() => {
    if (!isLoaded || isViewer) return
    try {
      const now = Date.now()
      localStorage.setItem(
        "dbd-5p-state-v2",
        JSON.stringify({
          players,
          receivingConfig,
          givingConfig,
          killerBans,
          updatedAt: now,
        }),
      )
      localStorage.setItem("dbd-last-mode", "1v4")
      localStorage.setItem("dbd-last-mode-time", now.toString())
    } catch {
      // ignore
    }
  }, [players, receivingConfig, givingConfig, killerBans, isLoaded, isViewer])

  // Player handlers
  const handleScore = (id: string, newKills: number) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        setPrevKillsMap((prevMap) => ({ ...prevMap, [id]: p.kills }))
        setAnim((prevAnim) => ({ ...prevAnim, [id]: (prevAnim[id] ?? 0) + 1 }))
        return { ...p, kills: newKills, played: newKills > 0 }
      })
    )
  }

  const handleZeroKill = (id: string) => {
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p
        setPrevKillsMap((prevMap) => ({ ...prevMap, [id]: p.kills }))
        setAnim((prevAnim) => ({ ...prevAnim, [id]: (prevAnim[id] ?? 0) + 1 }))
        return { ...p, kills: 0, played: true }
      })
    )
  }

  const handleCancel = (id: string) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, kills: 0, played: false } : p))
    )
    setAnim((a) => ({ ...a, [id]: 0 }))
    setPrevKillsMap((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }

  const updatePlayerName = (id: string, name: string) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)))
  }

  const commitPlayerNameWithMigration = (
    id: string,
    name: string,
    previousName: string,
  ) => {
    setPlayers((prev) =>
      applyFivePlayerNameCommit(prev, id, name, previousName),
    )
  }

  const addPlayer = () => {
    if (players.length >= 5) return
    const newId = String(playerIdCounter.current++)
    setPlayers((prev) => [...prev, { id: newId, name: "", kills: 0, played: false }])
  }

  const removePlayer = (id: string) => {
    setPlayers((prev) => {
      const next = prev.filter((p) => p.id !== id)
      if (next.length === 0) setRemoveMode(false)
      return next
    })
  }

  const shufflePlayers = () => {
    setPlayers((prev) => {
      const shuffled = [...prev]
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
      }
      return shuffled
    })
  }

  // Resets
  const resetScores = () => {
    setPlayers((prev) => prev.map((p) => ({ ...p, kills: 0, played: false })))
    setAnim({})
    setPrevKillsMap({})
    closeAllResetUI()
  }

  const resetRoster = () => {
    setPlayers((prev) => prev.map((player) => clearPlayerRosterField(player)))
    setAnim({})
    setPrevKillsMap({})
    setRemoveMode(false)
    closeAllResetUI()
  }

  const resetKillers = () => {
    setPlayers((prev) => prev.map((p) => ({ ...p, killerPicks: [] })))
    setKillerBans([])
    closeAllResetUI()
  }

  const fullReset = () => {
    setPlayers(createInitialPlayers())
    setReceivingConfig([...DEFAULT_RECEIVING])
    setGivingConfig([...DEFAULT_GIVING])
    setKillerBans([])
    setPickerContext(null)
    setAnim({})
    setPrevKillsMap({})
    setRemoveMode(false)
    closeAllResetUI()
    try {
      localStorage.removeItem("dbd-5p-state-v2")
    } catch {
      // ignore
    }
  }

  function closeAllResetUI() {
    setShowResetMenu(false)
    setShowResetConfirm(false)
    setShowKillerResetConfirm(false)
    setShowRosterResetConfirm(false)
    setShowFullResetConfirm(false)
  }

  const resetMenuRef = useRef<HTMLDivElement>(null)
  const resetTriggerRef = useRef<HTMLButtonElement>(null)
  const modeSwitchMenuRef = useRef<HTMLDivElement>(null)
  const modeSwitchTriggerRef = useRef<HTMLButtonElement>(null)

  const resetUiOpen =
    showResetMenu ||
    showResetConfirm ||
    showKillerResetConfirm ||
    showRosterResetConfirm ||
    showFullResetConfirm
  const resetUiDismissBind = useAutoDismiss(
    resetUiOpen,
    closeAllResetUI,
    RESET_MENU_IDLE_MS,
  )
  useDismissOnOutsideInteraction(
    resetUiOpen,
    closeAllResetUI,
    resetMenuRef,
    [resetTriggerRef],
  )
  const modeSwitchDismissBind = useAutoDismiss(showModeSwitchConfirm, () => {
    setShowModeSwitchConfirm(false)
  })
  useDismissOnOutsideInteraction(
    showModeSwitchConfirm,
    () => setShowModeSwitchConfirm(false),
    modeSwitchMenuRef,
    [modeSwitchTriggerRef],
  )

  function openResetConfirm(type: "score" | "killer" | "roster" | "full") {
    setShowResetConfirm(type === "score")
    setShowKillerResetConfirm(type === "killer")
    setShowRosterResetConfirm(type === "roster")
    setShowFullResetConfirm(type === "full")
  }

  function handleResetClick() {
    setShowModeSwitchConfirm(false)
    setShowResetConfirm(false)
    setShowKillerResetConfirm(false)
    setShowRosterResetConfirm(false)
    setShowFullResetConfirm(false)
    setShowResetMenu((open) => !open)
  }

  function closeKillerPicker() {
    setPickerContext(null)
    if (!isViewer) {
      setPickerUi((current) => clearPickerSelection(current))
    }
  }

  const handlePickerSelectionSync = (killerId: string | null) => {
    setPickerUi((current) => nextPickerSelection(current, killerId))
  }

  const handlePickerFeedbackSync = (
    killerId: string,
    kind: PickerFeedbackKind,
  ) => {
    setPickerUi((current) => nextPickerFeedback(current, killerId, kind))
  }

  function openKillerCatalog() {
    closeAllResetUI()
    setShowModeSwitchConfirm(false)
    setPickerContext({
      mode: "catalog",
      team: "thomas",
      playerId: "__catalog__",
      playerName: "",
      slotIndex: null,
    })
  }

  function openKillerPicker(player: Player, slotIndex: number | null) {
    closeAllResetUI()
    setShowModeSwitchConfirm(false)
    setPickerContext({
      team: "thomas",
      playerId: player.id,
      playerName: player.name,
      slotIndex,
      currentKillerId:
        slotIndex === null ? undefined : player.killerPicks?.[slotIndex]?.killerId,
    })
  }

  function handleKillerPick(killerId: string) {
    if (isViewer || !pickerContext) return
    setPlayers((current) =>
      current.map((player) =>
        player.id === pickerContext.playerId
          ? setPlayerKillerPick(
              player,
              killerId,
              pickerContext.slotIndex,
              undefined,
              player.name,
            )
          : player,
      ),
    )
    setPickerContext((current) =>
      current
        ? {
            ...current,
            slotIndex: current.slotIndex ?? 0,
            currentKillerId: killerId,
          }
        : current,
    )
  }

  function handleKillerPickCancel() {
    if (
      isViewer ||
      !pickerContext ||
      pickerContext.slotIndex === null
    ) {
      return
    }

    setPlayers((current) =>
      current.map((player) =>
        player.id === pickerContext.playerId
          ? cancelPlayerKillerPick(player, pickerContext.slotIndex!)
          : player,
      ),
    )
    setPickerContext({
      ...pickerContext,
      slotIndex: null,
      currentKillerId: undefined,
    })
  }

  function handleKillerBanToggle(killerId: string) {
    if (isViewer) return
    setKillerBans((current) => toggleKillerBan(current, killerId))
  }

  const allPicks = useMemo(
    () => flattenFearlessPicks(players, []),
    [players],
  )

  const activePickerContext = useMemo<KillerPickerContext | null>(() => {
    if (!pickerContext) return null
    if (pickerContext.mode === "catalog") return pickerContext

    const player = players.find(
      (candidate) => candidate.id === pickerContext.playerId,
    )
    if (!player) return null

    const picks = player.killerPicks ?? []
    if (
      pickerContext.slotIndex !== null &&
      pickerContext.slotIndex > picks.length
    ) {
      return null
    }

    return {
      ...pickerContext,
      playerName: player.name,
      currentKillerId:
        pickerContext.slotIndex !== null &&
        pickerContext.slotIndex < picks.length
          ? picks[pickerContext.slotIndex]?.killerId
          : undefined,
    }
  }, [pickerContext, players])

  const viewerPlayerCatalogLabel = useMemo(() => {
    if (!isViewer || !activePickerContext || activePickerContext.mode === "catalog") {
      return undefined
    }
    return activePickerContext.playerName.trim() || "이름 미입력"
  }, [activePickerContext, isViewer])

  const updateConfig = (isReceiving: boolean, killCount: number, numValue: number) => {
    if (isReceiving) {
      const newConfig = [...receivingConfig]
      newConfig[killCount] = numValue
      setReceivingConfig(newConfig)
    } else {
      const newConfig = [...givingConfig]
      newConfig[killCount] = numValue
      setGivingConfig(newConfig)
    }
  }

  // Generate commands
  const receivingCommand = players
    .filter((p) => p.name.trim() !== "" && p.played)
    .map((p) => {
      const killIdx = Math.min(4, Math.max(0, Math.floor(p.kills)))
      return `${p.name.trim()}*${receivingConfig[killIdx] ?? 0}`
    })
    .join(", ")

  const givingCommand = players
    .filter((p) => p.name.trim() !== "" && p.played)
    .map((p) => {
      const killIdx = Math.min(4, Math.max(0, Math.floor(p.kills)))
      return `${p.name.trim()}*${givingConfig[killIdx] ?? 0}`
    })
    .join(", ")

  const [copiedType, setCopiedType] = useState<"receiving" | "giving" | null>(null)
  const [isEditingPinball, setIsEditingPinball] = useState(false)

  const handleCopy = (text: string, type: "receiving" | "giving") => {
    try {
      navigator.clipboard.writeText(text || "")
    } catch {
      // fallback
    }
    setCopiedType(type)
    setTimeout(() => {
      setCopiedType((prev) => (prev === type ? null : prev))
    }, 1500)
  }

  const hasAnyScore = players.some((p) => p.played || p.kills > 0)

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden text-foreground"
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (
          target &&
          !target.closest("input") &&
          !target.closest("button") &&
          !target.closest("textarea")
        ) {
          if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        }
        if (removeMode) setRemoveMode(false)
        if (isEditingPinball) setIsEditingPinball(false)
      }}
    >
      {!utilityUiHidden && <AppVersionCorner />}

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-3 pb-12 md:px-6 md:py-4 md:pb-12">
        
        {/* Title Header matching DBD font & style */}
        <div className="border-b border-foreground/10 pb-2 text-center">
          <h1
            className="select-none text-2xl md:text-4xl font-bold italic text-neutral-500 drop-shadow-none"
            style={{ fontFamily: "var(--font-aldrich)" }}
          >
            5인 내전 모드
          </h1>
        </div>

        {/* Main Grid: Left Roster & Right Config */}
        <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-12">
          
          {/* Left Column: Player Roster (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3 five-player-roster">
            <div className="flex items-center justify-between pb-1 five-player-roster-header">
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-neutral-200" style={{ fontFamily: "var(--font-godo)" }}>
                  팀원 명단
                </span>
                <span className="text-xs text-neutral-400">({players.length}/5명)</span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={shufflePlayers}
                  disabled={hasAnyScore || isViewer}
                  aria-label="팀원 무작위 배치"
                  title={hasAnyScore ? "점수 초기화 후 섞기가 가능합니다" : "팀원 무작위 배치"}
                  className="group size-12 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
                >
                  <img
                    src="/images/random.webp"
                    alt=""
                    draggable={false}
                    className="size-full object-cover transition-[filter] group-hover:brightness-125 group-disabled:brightness-75"
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    addPlayer()
                  }}
                  disabled={players.length >= 5 || isViewer}
                  aria-label="플레이어 추가"
                  className="group size-9 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <img
                    src="/images/addplayer.webp"
                    alt=""
                    draggable={false}
                    className="size-full object-cover transition-[filter] group-hover:brightness-125"
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (isViewer) return
                    setRemoveMode((prev) => !prev)
                  }}
                  aria-label="플레이어 삭제 모드"
                  className={`group size-9 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 ${
                    isViewer ? "cursor-not-allowed opacity-35" : ""
                  } ${
                    removeMode ? "ring-2 ring-red-500 drop-shadow-[0_0_8px_var(--dbd-red)]" : ""
                  }`}
                >
                  <img
                    src="/images/removeplayer.webp"
                    alt=""
                    draggable={false}
                    className="size-full object-cover transition-[filter] group-hover:brightness-125"
                  />
                </button>
              </div>
            </div>

            {/* Roster List using PlayerRow */}
            <div className="flex flex-col gap-2.5 min-h-[370px]">
              {players.length === 0 ? (
                <button
                  type="button"
                  onClick={addPlayer}
                  disabled={isViewer}
                  className="flex min-h-36 w-full items-center justify-center rounded-md border border-dashed border-neutral-700 bg-black/25 px-4 text-center text-sm leading-relaxed text-neutral-400 transition-colors hover:border-neutral-500 hover:bg-black/40 hover:text-neutral-200 disabled:cursor-default disabled:opacity-60"
                >
                  + 버튼을 눌러 플레이어를 추가해주세요
                </button>
              ) : (
                players.map((p, index) => (
                  <div key={p.id} className="relative">
                    <PlayerRow
                      player={p}
                      team="thomas"
                      active={false}
                      tabIndex={1 + index}
                      onNameKeyDown={(e) => {
                        if (index === players.length - 1 && e.key === "Tab" && !e.shiftKey) {
                          e.preventDefault()
                          e.currentTarget.blur()
                        }
                      }}
                      animId={anim[p.id] ?? 0}
                      prevKills={prevKillsMap[p.id] ?? 0}
                      dragging={draggingId === p.id}
                      allowHalf={false}
                      readOnly={isViewer}
                      removeMode={removeMode}
                      killerControl={
                        <KillerPickSlots
                          playerName={p.name}
                          team="thomas"
                          monochrome
                          killerPicks={p.killerPicks ?? []}
                          disabled={removeMode}
                          readOnly={isViewer}
                          onOpen={(slotIndex) => openKillerPicker(p, slotIndex)}
                        />
                      }
                      onRemove={() => removePlayer(p.id)}
                      onScore={(nk) => handleScore(p.id, nk)}
                      onZeroKill={() => handleZeroKill(p.id)}
                      onCancel={() => handleCancel(p.id)}
                      onNameChange={(name) => updatePlayerName(p.id, name)}
                      onNameCommit={(name, previousName) =>
                        commitPlayerNameWithMigration(p.id, name, previousName)
                      }
                      onKillerChange={() => {}}
                      onDragStart={() => {
                        dragItem.current = p.id
                        setDraggingId(p.id)
                      }}
                      onDragEnter={() => handleDragEnter(p.id)}
                      onDragEnd={() => {
                        dragItem.current = null
                        setDraggingId(null)
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right Column: Pinball Config (5 cols) */}
          <div
            className="lg:col-span-5 flex flex-col gap-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative max-w-[310px] w-full mx-auto flex items-center justify-center border-b border-neutral-700/60 pb-2 select-none">
              <h2
                className="text-xl font-bold italic text-neutral-300 text-center"
                style={{ fontFamily: "var(--font-aldrich)" }}
              >
                핀볼 갯수 설정
              </h2>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  if (isViewer) return
                  setIsEditingPinball((prev) => !prev)
                }}
                disabled={isViewer}
                className={cn(
                  "absolute right-0 px-2 py-0.5 text-xs font-bold rounded transition-all duration-200 cursor-pointer select-none",
                  isEditingPinball
                    ? "bg-dbd-yellow text-black hover:bg-yellow-400 font-extrabold shadow-[0_0_10px_rgba(234,179,8,0.5)]"
                    : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700 hover:text-white border border-neutral-700 opacity-80"
                )}
                style={{ fontFamily: "var(--font-godo)" }}
              >
                {isEditingPinball ? "완료" : "수정하기"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-[310px] w-full mx-auto pt-1 select-none">
              {/* Receiving Config */}
              <div className="flex flex-col space-y-3.5">
                <div className="text-center font-bold text-emerald-400 text-sm border-b border-emerald-500/40 pb-1 w-full max-w-[145px] mx-auto" style={{ fontFamily: "var(--font-godo)" }}>
                  받는 사람
                </div>
                {[0, 1, 2, 3, 4].map((k) => (
                  <div key={`rec-${k}`} className="flex items-center justify-between bg-black/60 px-2 py-1.5 rounded border border-neutral-800 w-full max-w-[145px] mx-auto">
                    <span className="font-bold text-xs text-neutral-400" style={{ fontFamily: "var(--font-godo)" }}>{k}킬</span>
                    <PinballNumberInput
                      value={receivingConfig[k]}
                      disabled={!isEditingPinball || isViewer}
                      color="emerald"
                      onChange={(newVal) => updateConfig(true, k, newVal)}
                    />
                    <span className="text-neutral-500 text-xs">개</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!isEditingPinball || isViewer}
                        onClick={() => updateConfig(true, k, receivingConfig[k] + 1)}
                        className="size-5 flex items-center justify-center rounded bg-neutral-800 text-neutral-200 hover:bg-emerald-600 hover:text-white font-bold text-xs transition-colors cursor-pointer select-none disabled:opacity-20 disabled:hover:bg-neutral-800 disabled:cursor-not-allowed"
                        title="1 증가"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        disabled={!isEditingPinball || isViewer}
                        onClick={() => updateConfig(true, k, Math.max(0, receivingConfig[k] - 1))}
                        className="size-5 flex items-center justify-center rounded bg-neutral-800 text-neutral-200 hover:bg-red-600 hover:text-white font-bold text-xs transition-colors cursor-pointer select-none disabled:opacity-20 disabled:hover:bg-neutral-800 disabled:cursor-not-allowed"
                        title="1 감소"
                      >
                        -
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Giving Config */}
              <div className="flex flex-col space-y-3.5">
                <div className="text-center font-bold text-dbd-orange text-sm border-b border-dbd-orange/40 pb-1 w-full max-w-[145px] mx-auto" style={{ fontFamily: "var(--font-godo)" }}>
                  주는 사람
                </div>
                {[0, 1, 2, 3, 4].map((k) => (
                  <div key={`giv-${k}`} className="flex items-center justify-between bg-black/60 px-2 py-1.5 rounded border border-neutral-800 w-full max-w-[145px] mx-auto">
                    <span className="font-bold text-xs text-neutral-400" style={{ fontFamily: "var(--font-godo)" }}>{k}킬</span>
                    <PinballNumberInput
                      value={givingConfig[k]}
                      disabled={!isEditingPinball || isViewer}
                      color="orange"
                      onChange={(newVal) => updateConfig(false, k, newVal)}
                    />
                    <span className="text-neutral-500 text-xs">개</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={!isEditingPinball || isViewer}
                        onClick={() => updateConfig(false, k, givingConfig[k] + 1)}
                        className="size-5 flex items-center justify-center rounded bg-neutral-800 text-neutral-200 hover:bg-dbd-orange hover:text-white font-bold text-xs transition-colors cursor-pointer select-none disabled:opacity-20 disabled:hover:bg-neutral-800 disabled:cursor-not-allowed"
                        title="1 증가"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        disabled={!isEditingPinball || isViewer}
                        onClick={() => updateConfig(false, k, Math.max(0, givingConfig[k] - 1))}
                        className="size-5 flex items-center justify-center rounded bg-neutral-800 text-neutral-200 hover:bg-red-600 hover:text-white font-bold text-xs transition-colors cursor-pointer select-none disabled:opacity-20 disabled:hover:bg-neutral-800 disabled:cursor-not-allowed"
                        title="1 감소"
                      >
                        -
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Commands Area & Semi-transparent Divider */}
        <div className="mt-8 md:mt-10 pt-5 border-t border-foreground/10 flex flex-col space-y-2.5 max-w-3xl w-full mx-auto">
          
          {/* Receiving Command Box */}
          <div
            className="player-plate border-l-[3px] border-neutral-400 flex flex-col md:flex-row items-center gap-3 p-2.5 min-h-[3.5rem]"
            style={{ "--team": "#a3a3a3" } as React.CSSProperties}
          >
            <span className="plate-grain rounded-md" aria-hidden="true" />
            <span className="font-bold text-emerald-400 text-sm whitespace-nowrap z-10 select-none" style={{ fontFamily: "var(--font-godo)" }}>
              받는 사람:
            </span>
            <input
              type="text"
              readOnly
              value={receivingCommand}
              className="player-name-input pinball-command-input text-left text-neutral-100 border-none bg-transparent focus:outline-none w-full z-10"
              placeholder="플레이어 이름과 킬수가 선택되면 자동 작성됩니다."
            />
            <button
              type="button"
              onClick={() => handleCopy(receivingCommand, "receiving")}
              className={`rounded border px-4 py-1.5 text-xs transition-colors cursor-pointer flex items-center space-x-1.5 whitespace-nowrap z-10 ${
                copiedType === "receiving"
                  ? "border-emerald-500 bg-emerald-500/20 text-emerald-300 font-bold"
                  : "border-neutral-600 bg-black/80 text-neutral-300 hover:border-neutral-400 hover:text-white"
              }`}
              style={{ fontFamily: "var(--font-godo)" }}
            >
              <Copy size={15} />
              <span>{copiedType === "receiving" ? "✓ 복사완료!" : "복사하기"}</span>
            </button>
          </div>

          {/* Giving Command Box */}
          <div
            className="player-plate border-l-[3px] border-neutral-400 flex flex-col md:flex-row items-center gap-3 p-2.5 min-h-[3.5rem]"
            style={{ "--team": "#a3a3a3" } as React.CSSProperties}
          >
            <span className="plate-grain rounded-md" aria-hidden="true" />
            <span className="font-bold text-dbd-orange text-sm whitespace-nowrap z-10 select-none" style={{ fontFamily: "var(--font-godo)" }}>
              주는 사람:
            </span>
            <input
              type="text"
              readOnly
              value={givingCommand}
              className="player-name-input pinball-command-input text-left text-neutral-100 border-none bg-transparent focus:outline-none w-full z-10"
              placeholder="플레이어 이름과 킬수가 선택되면 자동 작성됩니다."
            />
            <button
              type="button"
              onClick={() => handleCopy(givingCommand, "giving")}
              className={`rounded border px-4 py-1.5 text-xs transition-colors cursor-pointer flex items-center space-x-1.5 whitespace-nowrap z-10 ${
                copiedType === "giving"
                  ? "border-dbd-orange bg-dbd-orange/20 text-dbd-orange font-bold"
                  : "border-neutral-600 bg-black/80 text-neutral-300 hover:border-neutral-400 hover:text-white"
              }`}
              style={{ fontFamily: "var(--font-godo)" }}
            >
              <Copy size={15} />
              <span>{copiedType === "giving" ? "✓ 복사완료!" : "복사하기"}</span>
            </button>
          </div>

          {/* Roulette Link Button */}
          <div className="flex justify-center pt-1">
            <a
              href="https://chzzk-roulette.netlify.app"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded border border-dbd-yellow/70 bg-black/80 px-5 py-2 text-sm text-dbd-yellow backdrop-blur-sm transition-colors hover:bg-dbd-yellow/10 shadow-lg cursor-pointer flex items-center space-x-2 font-bold"
              style={{ fontFamily: "var(--font-godo)" }}
            >
              <span>🎲 핀볼 사이트 바로가기 ➔</span>
            </a>
          </div>
        </div>

        {/* 설명서 모달 */}
        {showGuide && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowGuide(false)}
            />
            <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-2 sm:p-4">
              <div className="pointer-events-auto relative max-h-[94vh] w-full max-w-6xl overflow-y-auto rounded-lg shadow-2xl border border-neutral-800 bg-black/90">
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="absolute top-4 right-4 z-10 size-9 flex items-center justify-center rounded-full bg-black/80 text-white transition-all hover:bg-neutral-800 border border-white/20 shadow-lg text-lg cursor-pointer"
                  aria-label="Close guide"
                >
                  ✕
                </button>
                <img
                  src="/images/guide_1v4.webp"
                  alt="Game Guide"
                  className="h-auto w-full object-contain"
                />
              </div>
            </div>
          </>
        )}

        {/* fixed utility controls — layout matches 4v4 */}
        <ZoomCompensated
          origin="bottom left"
          className="scoreboard-utility-stack fixed bottom-5 left-4 z-50 text-neutral-300 md:bottom-6 md:left-8"
        >
          {!utilityUiHidden && (
          <div className="scoreboard-utility-stack-top">
          {isViewer && (
            <button
              type="button"
              onClick={openKillerCatalog}
              className="scoreboard-utility-btn scoreboard-utility-btn-neutral"
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              살인마 목록 열기
            </button>
          )}
          {!isViewer && (
            <div className="relative flex w-full flex-col gap-2">
              <button
                type="button"
                onClick={openKillerCatalog}
                className="scoreboard-utility-btn scoreboard-utility-btn-neutral"
                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
              >
                살인마 목록 열기
              </button>
              <button
                type="button"
                ref={resetTriggerRef}
                onClick={handleResetClick}
                className="scoreboard-utility-btn scoreboard-utility-btn-neutral"
                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
              >
                초기화 메뉴
              </button>

              {showResetMenu && (
                <div
                  ref={resetMenuRef}
                  className="scoreboard-reset-menu"
                  {...resetUiDismissBind}
                >
                  <div className="flex flex-col gap-1.5 rounded border border-neutral-600/70 bg-black/95 p-2 backdrop-blur-sm whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openResetConfirm("score")}
                      className="h-8 rounded border border-neutral-400/70 bg-black/80 px-3 text-sm text-white transition-colors hover:bg-white/10"
                      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                    >
                      점수 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => openResetConfirm("roster")}
                      className={RESET_ROSTER_KILLER_BTN}
                      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                    >
                      팀원 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => openResetConfirm("killer")}
                      className={RESET_ROSTER_KILLER_BTN}
                      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                    >
                      살인마 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => openResetConfirm("full")}
                      className="h-8 rounded border border-red-700/70 bg-black/80 px-3 text-sm text-red-400 transition-colors hover:bg-red-900/20"
                      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                    >
                      모두 초기화
                    </button>
                  </div>

                  {(showResetConfirm || showKillerResetConfirm || showRosterResetConfirm || showFullResetConfirm) && (
                    <div className="flex flex-col gap-1.5 py-2">
                      <div className="flex h-8 items-center">
                        {showResetConfirm && (
                          <div className="flex flex-col gap-2 rounded border border-neutral-400/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
                            <p className="text-xs text-neutral-200">점수를 초기화하시겠습니까?</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={resetScores}
                                className="rounded border border-neutral-400/70 bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={closeAllResetUI}
                                className="rounded border border-neutral-600 bg-black/50 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                아니오
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex h-8 items-center">
                        {showRosterResetConfirm && (
                          <div className={RESET_CONFIRM_PANEL}>
                            <p className={RESET_CONFIRM_TEXT}>
                              팀원 목록과 점수를 초기화하시겠습니까?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={resetRoster}
                                className={RESET_CONFIRM_YES}
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={closeAllResetUI}
                                className={RESET_CONFIRM_NO}
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                아니오
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex h-8 items-center">
                        {showKillerResetConfirm && (
                          <div className={RESET_CONFIRM_PANEL}>
                            <p className={RESET_CONFIRM_TEXT}>
                              살인마 픽/밴 기록을 초기화 하시겠습니까?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={resetKillers}
                                className={RESET_CONFIRM_YES}
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={closeAllResetUI}
                                className={RESET_CONFIRM_NO}
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                아니오
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex h-8 items-center">
                        {showFullResetConfirm && (
                          <div className="flex flex-col gap-2 rounded border border-red-700/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
                            <p className="text-xs text-neutral-200">모두 초기화하시겠습니까?</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={fullReset}
                                className="rounded border border-red-700/70 bg-red-900/20 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/40"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={closeAllResetUI}
                                className="rounded border border-neutral-600 bg-black/50 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                아니오
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
          )}
          <div className="scoreboard-utility-stack-bottom">
          {!utilityUiHidden && (
          <div className="relative flex w-full items-center">
            <button
              type="button"
              onClick={handleOpenGuide}
              className={cn(
                "scoreboard-utility-btn scoreboard-utility-btn-neutral border-neutral-600 bg-black/50",
                !hasSeenGuide &&
                  "border-dbd-yellow/90 text-dbd-yellow bg-dbd-yellow/15 font-bold",
              )}
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              설명서
            </button>

            {!hasSeenGuide && (
              <div
                className="absolute left-full ml-3 z-50 flex cursor-pointer items-center gap-1.5 rounded-md border border-dbd-yellow/80 bg-black/95 px-3.5 py-2 text-sm text-dbd-yellow backdrop-blur-md whitespace-nowrap hover:brightness-125"
                onClick={handleOpenGuide}
                style={{ fontFamily: "var(--font-s-core)", fontWeight: 400 }}
              >
                <span className="text-sm">👈</span>
                <span>최초 접속! 사용설명서를 확인해 보세요</span>
              </div>
            )}
          </div>
          )}
          <UtilityUiToggle hidden={utilityUiHidden} onToggle={toggleUtilityUi} />
          </div>
        </ZoomCompensated>

        {/* Mode Switcher — layout matches 4v4 (no capture button) */}
        {!utilityUiHidden && (
        <ZoomCompensated
          origin="bottom right"
          className="scoreboard-utility-stack fixed bottom-5 right-4 z-50 md:bottom-6 md:right-8"
        >
          <ScoreboardSyncPanel
            role={sync.role}
            status={sync.status}
            busy={sync.busy}
            inviteUrl={sync.inviteUrl}
            errorMessage={sync.errorMessage}
            guideStorageKey="dbd-sync-guide-seen-1v4"
            onStart={sync.startSharing}
            onStopSharing={sync.stopSharing}
            onStopViewing={sync.stopViewing}
          />
          {!isViewer && (
            <div className="relative w-full">
          <button
            type="button"
            ref={modeSwitchTriggerRef}
            onClick={() => {
              closeAllResetUI()
              setShowModeSwitchConfirm((prev) => !prev)
            }}
            className="scoreboard-utility-btn border border-dbd-yellow/70 bg-black/80 text-dbd-yellow shadow-lg hover:bg-dbd-yellow/10 hover:text-dbd-yellow"
            style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
          >
            4vs4 모드로 전환
          </button>
          {showModeSwitchConfirm && (
            <div
              ref={modeSwitchMenuRef}
              className="absolute right-full bottom-0 z-50 mr-2 flex flex-col gap-2 rounded border border-dbd-yellow/50 bg-black/95 p-3 whitespace-nowrap shadow-2xl backdrop-blur-sm"
              {...modeSwitchDismissBind}
            >
              <p className="text-xs text-neutral-200">4vs4 모드로 넘어가시겠습니까?</p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowModeSwitchConfirm(false)
                    if (sync.role === "host") {
                      void sync.switchGameMode("4v4")
                      return
                    }
                    router.push("/4v4")
                  }}
                  className="rounded border border-dbd-yellow/70 bg-dbd-yellow/10 px-2 py-1 text-xs text-dbd-yellow transition-colors hover:bg-dbd-yellow/20 cursor-pointer"
                  style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                >
                  예
                </button>
                <button
                  type="button"
                  onClick={() => setShowModeSwitchConfirm(false)}
                  className="rounded border border-neutral-600 bg-black/50 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white cursor-pointer"
                  style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                >
                  아니오
                </button>
              </div>
            </div>
          )}
            </div>
          )}
        </ZoomCompensated>
        )}

        {utilityUiHidden && <SyncStatusCompactLabel role={sync.role} />}

      </div>

      {viewerSessionEndReason && (
        <ViewerLinkExpiredNotice
          reason={viewerSessionEndReason}
          onDismiss={() => setViewerSessionEndReason(null)}
        />
      )}

      {sync.tabSuperseded && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-md border border-dbd-yellow/70 bg-neutral-950/95 p-6 text-center shadow-[0_0_40px_rgba(234,179,8,0.2)]"
            style={{ fontFamily: "var(--font-godo)" }}
          >
            <h2 className="text-lg font-bold text-dbd-yellow">
              다른 탭에서 연동 중입니다
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-300">
              같은 브라우저에서는 가장 최근에 연 탭 하나만 Firebase에
              연결됩니다. 이 탭의 연결은 자동으로 종료되었습니다.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded border border-dbd-yellow/70 bg-dbd-yellow/10 px-4 py-2 text-sm text-dbd-yellow transition-colors hover:bg-dbd-yellow/20"
            >
              이 탭에서 다시 연결
            </button>
          </div>
        </div>
      )}

      {activePickerContext && (
        <KillerPicker
          open
          monochrome
          context={activePickerContext}
          allPicks={allPicks}
          killerBans={killerBans}
          playerKillerPicks={
            activePickerContext.mode === "catalog"
              ? []
              : (players.find(
                  (player) => player.id === activePickerContext.playerId,
                )?.killerPicks ?? [])
          }
          readOnly={isViewer}
          viewerTeamCatalogTeamLabel={viewerPlayerCatalogLabel}
          viewerCatalogTitleSuffix="의 살인마 목록"
          syncedPickerUi={isViewer ? pickerUi : null}
          onSelectionSync={isViewer ? undefined : handlePickerSelectionSync}
          onFeedbackSync={isViewer ? undefined : handlePickerFeedbackSync}
          onPick={handleKillerPick}
          onCancelPick={handleKillerPickCancel}
          onToggleBan={handleKillerBanToggle}
          onClose={closeKillerPicker}
        />
      )}
    </main>
  )
}

function PinballNumberInput({
  value,
  disabled,
  color,
  onChange,
}: {
  value: number
  disabled: boolean
  color: "emerald" | "orange"
  onChange: (newVal: number) => void
}) {
  const [draft, setDraft] = useState<string | null>(null)
  const displayValue = draft !== null ? draft : String(value)

  return (
    <input
      type="text"
      inputMode="numeric"
      pattern="[0-9]*"
      value={displayValue}
      readOnly={disabled}
      onFocus={(e) => {
        if (disabled) return
        setDraft(String(value))
        e.currentTarget.select()
      }}
      onChange={(e) => {
        if (disabled) return
        const raw = e.target.value
        if (raw === "" || /^\d+$/.test(raw)) {
          setDraft(raw)
          if (raw !== "") {
            const parsed = parseInt(raw, 10)
            if (!isNaN(parsed)) {
              onChange(parsed)
            }
          }
        }
      }}
      onBlur={() => {
        if (disabled) return
        if (draft === "" || draft === null || isNaN(Number(draft))) {
          setDraft(null)
        } else {
          const parsed = parseInt(draft, 10)
          onChange(parsed)
          setDraft(null)
        }
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.currentTarget.blur()
        }
      }}
      className={cn(
        "w-9 bg-neutral-900/90 text-white font-bold text-center py-0.5 text-sm rounded border border-neutral-700 focus:outline-none transition-all",
        color === "emerald" ? "focus:border-emerald-500" : "focus:border-dbd-orange",
        disabled && "cursor-default border-neutral-800 select-none"
      )}
    />
  )
}

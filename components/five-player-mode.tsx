"use client"

import { useState, useEffect, useRef } from "react"
import { Copy } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useRouter } from "next/navigation"
import { PlayerRow, type Player } from "@/components/player-row"

const DEFAULT_RECEIVING = [5, 8, 10, 12, 15]
const DEFAULT_GIVING = [15, 12, 10, 8, 5]

const createInitialPlayers = (): Player[] => [
  { id: "1", name: "", kills: 0, played: false, killer: "" },
  { id: "2", name: "", kills: 0, played: false, killer: "" },
  { id: "3", name: "", kills: 0, played: false, killer: "" },
  { id: "4", name: "", kills: 0, played: false, killer: "" },
  { id: "5", name: "", kills: 0, played: false, killer: "" },
]

export function FivePlayerMode() {
  const router = useRouter()
  
  // State
  const [players, setPlayers] = useState<Player[]>(createInitialPlayers)
  const [receivingConfig, setReceivingConfig] = useState<number[]>(DEFAULT_RECEIVING)
  const [givingConfig, setGivingConfig] = useState<number[]>(DEFAULT_GIVING)
  
  // Modals & Confirm Prompts State
  const [showGuide, setShowGuide] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  const [showFullResetConfirm, setShowFullResetConfirm] = useState(false)
  const [showModeSwitchConfirm, setShowModeSwitchConfirm] = useState(false)
  
  const [removeMode, setRemoveMode] = useState<boolean>(false)
  const [anim, setAnim] = useState<Record<string, number>>({})
  const [prevKillsMap, setPrevKillsMap] = useState<Record<string, number>>({})

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

  // Load/Save state from localStorage to maintain data when navigating away
  useEffect(() => {
    const saved = localStorage.getItem("dbd-5p-state-v2")
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (parsed.players && Array.isArray(parsed.players)) setPlayers(parsed.players)
        if (parsed.receivingConfig) setReceivingConfig(parsed.receivingConfig)
        if (parsed.givingConfig) setGivingConfig(parsed.givingConfig)
      } catch (e) {
        console.error("Failed to parse saved state", e)
      }
    }
    setIsLoaded(true)
  }, [])

  useEffect(() => {
    if (!isLoaded) return
    try {
      localStorage.setItem("dbd-5p-state-v2", JSON.stringify({ players, receivingConfig, givingConfig }))
    } catch {
      // ignore
    }
  }, [players, receivingConfig, givingConfig, isLoaded])

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

  const updateKiller = (id: string, killer: string) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, killer } : p)))
  }

  const addPlayer = () => {
    if (players.length >= 5) return
    const newId = String(playerIdCounter.current++)
    setPlayers((prev) => [...prev, { id: newId, name: "", kills: 0, played: false, killer: "" }])
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
    setPlayers((prev) => prev.map((p) => ({ ...p, kills: 0, played: false, killer: "" })))
    setAnim({})
    setPrevKillsMap({})
    setShowResetConfirm(false)
  }

  const fullReset = () => {
    setPlayers([])
    setReceivingConfig([...DEFAULT_RECEIVING])
    setGivingConfig([...DEFAULT_GIVING])
    setAnim({})
    setPrevKillsMap({})
    setRemoveMode(false)
    setShowFullResetConfirm(false)
    try {
      localStorage.removeItem("dbd-5p-state-v2")
    } catch {
      // ignore
    }
  }

  const updateConfig = (isReceiving: boolean, killCount: number, value: string) => {
    const numValue = parseInt(value) || 0
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

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden text-foreground"
      onClick={() => {
        if (removeMode) setRemoveMode(false)
      }}
    >

      <div className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-3 pb-12 md:px-6 md:py-4 md:pb-12">
        
        {/* Title Header matching DBD font & style */}
        <div className="border-b border-foreground/10 pb-2 text-center">
          <h1
            className="text-2xl md:text-4xl font-bold italic text-dbd-orange drop-shadow-[0_3px_12px_color-mix(in_oklch,var(--dbd-orange),transparent_55%)]"
            style={{ fontFamily: "var(--font-aldrich)" }}
          >
            5인 내전 모드
          </h1>
        </div>

        {/* Main Grid: Left Roster & Right Config */}
        <div className="mt-3 grid grid-cols-1 gap-5 lg:grid-cols-12">
          
          {/* Left Column: Player Roster (7 cols) */}
          <div className="lg:col-span-7 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-1">
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
                  aria-label="팀원 무작위 배치"
                  title="팀원 무작위 배치"
                  className="group size-12 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95"
                >
                  <img
                    src="/images/random.png"
                    alt=""
                    draggable={false}
                    className="size-full object-cover transition-[filter] group-hover:brightness-125"
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    addPlayer()
                  }}
                  disabled={players.length >= 5}
                  aria-label="플레이어 추가"
                  className="group size-9 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Addplayer-j1Wdqcd9gLokCKfKVrdt96Gu5wBqbM.png"
                    alt=""
                    draggable={false}
                    className="size-full object-cover transition-[filter] group-hover:brightness-125"
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    setRemoveMode((prev) => !prev)
                  }}
                  aria-label="플레이어 삭제 모드"
                  className={`group size-9 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 ${
                    removeMode ? "ring-2 ring-red-500 drop-shadow-[0_0_8px_var(--dbd-red)]" : ""
                  }`}
                >
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Removeplayer-ExYhz8hM8Tgzqopazw6mq4EtaVtoK4.png"
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
                  className="flex min-h-36 w-full items-center justify-center rounded-md border border-dashed border-neutral-700 bg-black/25 px-4 text-center text-sm leading-relaxed text-neutral-400 transition-colors hover:border-neutral-500 hover:bg-black/40 hover:text-neutral-200"
                >
                  + 버튼을 눌러 플레이어를 추가해주세요
                </button>
              ) : (
                players.map((p) => (
                  <div key={p.id} className="relative">
                    <PlayerRow
                      player={p}
                      team="thomas"
                      active={false}
                      animId={anim[p.id] ?? 0}
                      prevKills={prevKillsMap[p.id] ?? 0}
                      dragging={draggingId === p.id}
                      allowHalf={false}
                      removeMode={removeMode}
                      onRemove={() => removePlayer(p.id)}
                      onScore={(nk) => handleScore(p.id, nk)}
                      onZeroKill={() => handleZeroKill(p.id)}
                      onCancel={() => handleCancel(p.id)}
                      onNameChange={(name) => updatePlayerName(p.id, name)}
                      onNameCommit={(name) => updatePlayerName(p.id, name)}
                      onKillerChange={(killer) => updateKiller(p.id, killer)}
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
          <div className="lg:col-span-5 flex flex-col gap-3">
            <div className="max-w-[310px] w-full mx-auto">
              <h2
                className="text-xl font-bold italic text-dbd-yellow border-b border-neutral-700/60 pb-2 text-center"
                style={{ fontFamily: "var(--font-aldrich)" }}
              >
                핀볼 갯수 설정
              </h2>
            </div>

            <div className="grid grid-cols-2 gap-3 max-w-[310px] w-full mx-auto pt-1">
              {/* Receiving Config */}
              <div className="flex flex-col space-y-3.5">
                <div className="text-center font-bold text-emerald-400 text-sm border-b border-emerald-500/20 pb-1 w-full max-w-[145px] mx-auto" style={{ fontFamily: "var(--font-godo)" }}>
                  받는 사람
                </div>
                {[0, 1, 2, 3, 4].map((k) => (
                  <div key={`rec-${k}`} className="flex items-center justify-between bg-black/60 px-2 py-1.5 rounded border border-neutral-800 w-full max-w-[145px] mx-auto">
                    <span className="font-bold text-xs text-neutral-400" style={{ fontFamily: "var(--font-godo)" }}>{k}킬</span>
                    <input
                      type="number"
                      value={receivingConfig[k]}
                      onChange={(e) => updateConfig(true, k, e.target.value)}
                      className="w-9 bg-neutral-900/90 text-white font-bold text-center py-0.5 text-sm rounded border border-neutral-700 focus:border-emerald-500 focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-neutral-500 text-xs">개</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateConfig(true, k, receivingConfig[k] + 1)}
                        className="size-5 flex items-center justify-center rounded bg-neutral-800 text-neutral-200 hover:bg-emerald-600 hover:text-white font-bold text-xs transition-colors cursor-pointer select-none"
                        title="1 증가"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfig(true, k, Math.max(0, receivingConfig[k] - 1))}
                        className="size-5 flex items-center justify-center rounded bg-neutral-800 text-neutral-200 hover:bg-red-600 hover:text-white font-bold text-xs transition-colors cursor-pointer select-none"
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
                <div className="text-center font-bold text-dbd-orange text-sm border-b border-dbd-orange/20 pb-1 w-full max-w-[145px] mx-auto" style={{ fontFamily: "var(--font-godo)" }}>
                  주는 사람
                </div>
                {[0, 1, 2, 3, 4].map((k) => (
                  <div key={`giv-${k}`} className="flex items-center justify-between bg-black/60 px-2 py-1.5 rounded border border-neutral-800 w-full max-w-[145px] mx-auto">
                    <span className="font-bold text-xs text-neutral-400" style={{ fontFamily: "var(--font-godo)" }}>{k}킬</span>
                    <input
                      type="number"
                      value={givingConfig[k]}
                      onChange={(e) => updateConfig(false, k, e.target.value)}
                      className="w-9 bg-neutral-900/90 text-white font-bold text-center py-0.5 text-sm rounded border border-neutral-700 focus:border-dbd-orange focus:outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-neutral-500 text-xs">개</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => updateConfig(false, k, givingConfig[k] + 1)}
                        className="size-5 flex items-center justify-center rounded bg-neutral-800 text-neutral-200 hover:bg-dbd-orange hover:text-white font-bold text-xs transition-colors cursor-pointer select-none"
                        title="1 증가"
                      >
                        +
                      </button>
                      <button
                        type="button"
                        onClick={() => updateConfig(false, k, Math.max(0, givingConfig[k] - 1))}
                        className="size-5 flex items-center justify-center rounded bg-neutral-800 text-neutral-200 hover:bg-red-600 hover:text-white font-bold text-xs transition-colors cursor-pointer select-none"
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
        <div className="mt-10 md:mt-12 pt-5 border-t border-foreground/10 flex flex-col space-y-2.5">
          
          {/* Receiving Command Box */}
          <div
            className="player-plate border-l-[3px] border-neutral-400 flex flex-col md:flex-row items-center gap-3 p-2.5 min-h-[3.5rem]"
            style={{ "--team": "#a3a3a3" } as React.CSSProperties}
          >
            <span className="plate-grain rounded-md" aria-hidden="true" />
            <span className="font-bold text-emerald-400 text-sm whitespace-nowrap z-10" style={{ fontFamily: "var(--font-godo)" }}>
              받는 사람:
            </span>
            <input
              type="text"
              readOnly
              value={receivingCommand}
              className="player-name-input text-left text-neutral-100 font-mono text-sm border-none bg-transparent focus:outline-none w-full z-10"
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
            <span className="font-bold text-dbd-orange text-sm whitespace-nowrap z-10" style={{ fontFamily: "var(--font-godo)" }}>
              주는 사람:
            </span>
            <input
              type="text"
              readOnly
              value={givingCommand}
              className="player-name-input text-left text-neutral-100 font-mono text-sm border-none bg-transparent focus:outline-none w-full z-10"
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
            <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4">
              <div className="pointer-events-auto relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="absolute top-4 right-4 z-10 size-8 flex items-center justify-center rounded bg-black/60 text-white transition-colors hover:bg-black/80"
                  aria-label="Close guide"
                >
                  ✕
                </button>
                <img
                  src="/images/guide.jpg"
                  alt="Game Guide"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </>
        )}

        {/* backdrop for closing prompts on background click */}
        {(showResetConfirm || showFullResetConfirm) && (
          <div
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => {
              setShowResetConfirm(false)
              setShowFullResetConfirm(false)
            }}
          />
        )}

        {/* Fixed Utility Controls (Bottom-Left) matching 4v4 mode */}
        <div className="fixed bottom-5 left-4 z-50 flex flex-col gap-2 text-neutral-300 md:bottom-6 md:left-8">
          <button
            type="button"
            onClick={() => {
              setShowResetConfirm(false)
              setShowFullResetConfirm(false)
              setShowGuide(true)
            }}
            className="rounded border border-neutral-600 bg-black/50 px-3 py-1 text-sm transition-colors hover:border-neutral-400 hover:text-white text-center"
            style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
          >
            설명서
          </button>
          
          {/* 점수 초기화 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (showResetConfirm) {
                  setShowResetConfirm(false)
                } else {
                  setShowFullResetConfirm(false)
                  setShowResetConfirm(true)
                }
              }}
              className="rounded border border-dbd-yellow/70 bg-black/80 px-3 py-1 text-sm text-dbd-yellow backdrop-blur-sm transition-colors hover:bg-dbd-yellow/10"
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              점수 초기화
            </button>
            {showResetConfirm && (
              <div className="absolute left-full bottom-0 ml-2 z-50 flex flex-col gap-2 rounded border border-dbd-yellow/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
                <p className="text-xs text-neutral-200">점수를 초기화하시겠습니까?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={resetScores}
                    className="rounded border border-dbd-yellow/70 bg-dbd-yellow/10 px-2 py-1 text-xs text-dbd-yellow transition-colors hover:bg-dbd-yellow/20"
                    style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                  >
                    예
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetConfirm(false)}
                    className="rounded border border-neutral-600 bg-black/50 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white"
                    style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                  >
                    아니오
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 모두 초기화 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (showFullResetConfirm) {
                  setShowFullResetConfirm(false)
                } else {
                  setShowResetConfirm(false)
                  setShowFullResetConfirm(true)
                }
              }}
              className="rounded border border-red-700/70 bg-black/80 px-3 py-1 text-sm text-red-400 backdrop-blur-sm transition-colors hover:bg-red-900/20"
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              모두 초기화
            </button>
            {showFullResetConfirm && (
              <div className="absolute left-full bottom-0 ml-2 z-50 flex flex-col gap-2 rounded border border-red-700/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
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
                    onClick={() => setShowFullResetConfirm(false)}
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

        {/* Mode Switcher Floating Button & Popover (Bottom-Right) */}
        <div className="fixed bottom-6 right-6 z-50">
          <button
            type="button"
            onClick={() => setShowModeSwitchConfirm((prev) => !prev)}
            className="rounded border border-dbd-yellow/70 bg-black/80 px-4 py-2 text-sm text-dbd-yellow backdrop-blur-sm transition-colors hover:bg-dbd-yellow/10 shadow-lg cursor-pointer flex items-center space-x-2"
            style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
          >
            <span>4vs4 모드로 전환</span>
          </button>
          {showModeSwitchConfirm && (
            <div className="absolute right-0 bottom-full mb-2 z-50 flex flex-col gap-2 rounded border border-dbd-yellow/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap shadow-2xl">
              <p className="text-xs text-neutral-200">4vs4 모드로 넘어가시겠습니까?</p>
              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => router.push("/4v4")}
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

      </div>
    </main>
  )
}

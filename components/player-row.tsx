"use client"

import { useState, useEffect, useRef } from "react"
import { createPortal } from "react-dom"
import { motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

export const SKULLS_PER_PLAYER = 4
export const MAX_KILLS = 4

import type { KillerPick } from "@/lib/fearless"

export type Player = {
  id: string
  name: string
  kills: number
  played: boolean
  /** 1v4 legacy/free-text killer field. */
  killer?: string
  /** Ordered 4v4 fearless picks. Unique per player; cross-player duplicates OK. */
  killerPicks?: KillerPick[]
}
type Team = "thomas" | "ada"
const SKULL_URL = "/images/skull.webp"
const SKULL_STAGGER = 0.42
const SKULL_DURATION = 0.68
const SKULL_IMPACT_AT = 0.32
const CHARGE_DURATION = 0.55

function formatKillPreview(kills: number) {
  return `${kills}킬`
}

function Skull({ fill, previewFill, team, animId, animOrder, animate, disabled, hoverPreview, onPick, onHover }: {
  fill: 0 | 0.5 | 1; previewFill: 0 | 0.5 | 1; team: Team; animId: number; animOrder: number; animate: boolean; disabled: boolean
  hoverPreview?: string | null
  onPick: (half: boolean) => void; onHover: (half: boolean) => void
}) {
  const reducedMotionRaw = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  )
  useEffect(() => { setMounted(true) }, [])
  const reducedMotion = mounted ? reducedMotionRaw : false
  const full = fill > 0
  const image = <img src={SKULL_URL} alt="" draggable={false} loading="eager" decoding="sync" className="absolute inset-0 size-full object-contain" />
  const getHalf = (element: HTMLButtonElement, clientX: number) => {
    const ratio = (clientX - element.getBoundingClientRect().left) / element.offsetWidth
    return team === "thomas" ? ratio < 0.5 : ratio > 0.5
  }
  const syncTooltipPos = (element: HTMLButtonElement) => {
    const rect = element.getBoundingClientRect()
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
  }
  const clearTooltip = () => setTooltipPos(null)

  return (
    <>
    <button
      type="button"
      disabled={disabled}
      aria-label={`${animOrder + 1}번째 킬 스코어`}
      onPointerEnter={(event) => {
        onHover(getHalf(event.currentTarget, event.clientX))
        syncTooltipPos(event.currentTarget)
      }}
      onPointerMove={(event) => {
        onHover(getHalf(event.currentTarget, event.clientX))
      }}
      onPointerLeave={clearTooltip}
      onClick={(event) => {
        clearTooltip()
        onPick(getHalf(event.currentTarget, event.clientX))
      }}
      className="skull-slot"
    >
      <span className="skull-slot-visual">
      <span className="skull-ghost"><img src={SKULL_URL} alt="" draggable={false} className="size-full object-contain" /></span>
      {previewFill > 0 && <span className={cn("skull-preview", previewFill === 0.5 && (team === "thomas" ? "half-left" : "half-right"))}>{image}</span>}
      {full && (
        <motion.span
          key={`${animId}-${fill}`}
          className={cn("skull-impact", fill === 0.5 && (team === "thomas" ? "half-left" : "half-right"))}
          initial={animate && !reducedMotion
            ? { opacity: 0, scale: 2.9, y: -42, x: team === "thomas" ? -12 : 12, rotate: team === "thomas" ? -20 : 20, filter: "brightness(3) blur(4px)" }
            : false}
          animate={animate && !reducedMotion
            ? {
                opacity: [0, 0.45, 1, 1, 1, 1],
                scale: [2.9, 2.15, 0.58, 1.18, 0.91, 1],
                y: [-42, -17, 2, -3, 1, 0],
                x: [team === "thomas" ? -12 : 12, team === "thomas" ? -5 : 5, 0, 0, 0, 0],
                rotate: [team === "thomas" ? -20 : 20, team === "thomas" ? -8 : 8, 0, 0, 0, 0],
                filter: [
                  "brightness(3) blur(4px)",
                  "brightness(2.4) blur(1px)",
                  "brightness(5) blur(0px)",
                  "brightness(1.7) blur(0px)",
                  "brightness(1.1) blur(0px)",
                  "brightness(1) blur(0px)",
                ],
              }
            : { opacity: 1, scale: 1, y: 0, x: 0, rotate: 0, filter: "brightness(1) blur(0px)" }}
          transition={{
            duration: SKULL_DURATION,
            delay: animate && !reducedMotion ? animOrder * SKULL_STAGGER : 0,
            times: [0, 0.24, 0.47, 0.65, 0.82, 1],
            ease: [0.12, 0.82, 0.18, 1],
          }}
        >
          {image}
          {animate && !reducedMotion && (
            <motion.i
              className="skull-ring"
              initial={{ opacity: 0, scale: 0.1 }}
              animate={{ opacity: [0, 0.9, 0], scale: [0.1, 1.6, 2.4] }}
              transition={{ duration: 0.44, delay: animOrder * SKULL_STAGGER + SKULL_IMPACT_AT, ease: [0.08, 0.72, 0.18, 1] }}
            />
          )}
        </motion.span>
      )}
      </span>
    </button>
    {mounted &&
      hoverPreview &&
      tooltipPos &&
      createPortal(
        <span
          className={cn("score-hover-tooltip", `score-hover-tooltip-${team}`)}
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
          role="tooltip"
        >
          {hoverPreview}
        </span>,
        document.body,
      )}
    </>
  )
}

const ZERO_KILL_URL = "/images/0kill.webp"

function NoKillButton({
  team,
  played,
  kills,
  disabled,
  onZero,
  onCancel,
}: {
  team: Team
  played: boolean
  kills: number
  disabled: boolean
  onZero: () => void
  onCancel: () => void
}) {
  const [mounted, setMounted] = useState(false)
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(
    null,
  )
  useEffect(() => {
    setMounted(true)
  }, [])
  const selected = played && kills === 0
  const showTooltip = !disabled && tooltipPos !== null

  return (
    <>
      <button
        type="button"
        onClick={() => (selected ? onCancel() : onZero())}
        disabled={disabled}
        aria-label={selected ? "0킬 입력 취소" : "0킬 처리"}
        className={cn("no-kill-button", selected && "is-selected")}
        onPointerEnter={(event) => {
          const rect = event.currentTarget.getBoundingClientRect()
          setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top })
        }}
        onPointerLeave={() => setTooltipPos(null)}
      >
        <span className="no-kill-button-visual">
          <img src={ZERO_KILL_URL} alt="" draggable={false} className="size-full object-contain" />
        </span>
      </button>
      {mounted &&
        showTooltip &&
        createPortal(
          <span
            className={cn("score-hover-tooltip", `score-hover-tooltip-${team}`)}
            style={{ left: tooltipPos.x, top: tooltipPos.y }}
            role="tooltip"
          >
            0킬
          </span>,
          document.body,
        )}
    </>
  )
}

function KillerTag({ value, isThomas, disabled, onChange }: {
  value: string; isThomas: boolean; disabled: boolean; onChange?: (v: string) => void
}) {
  const isEmpty = value.trim() === ""
  return (
    <div className="relative inline-flex items-center min-w-[1.75rem] h-[1.75rem]">
      <span
        aria-hidden="true"
        className="invisible px-2 text-xs font-normal whitespace-pre h-[1.75rem] flex items-center select-none pointer-events-none"
        style={{ fontFamily: "var(--font-godo)" }}
      >
        {isEmpty ? " " : value}
      </span>
      <input
        type="text"
        value={value}
        placeholder=""
        readOnly={disabled}
        onChange={(e) => onChange?.(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur() }}
        aria-label="살인마 이름"
        style={{
          fontFamily: "var(--font-godo)",
          fontWeight: 400,
        }}
        className={cn(
          "absolute inset-0 size-full rounded border border-dbd-yellow/80 bg-neutral-950/80 text-xs text-dbd-yellow outline-none text-center px-1.5 placeholder-transparent transition-all duration-150",
          "focus:border-dbd-yellow",
          disabled && "cursor-default pointer-events-none"
        )}
      />
    </div>
  )
}

function DragHandle({
  disabled,
  highlighted = false,
  onDragStart,
  onDragEnd,
}: {
  disabled: boolean
  highlighted?: boolean
  onDragStart?: (e: React.DragEvent) => void
  onDragEnd?: (e: React.DragEvent) => void
}) {
  return (
    <span
      aria-hidden
      draggable={!disabled}
      onDragStart={(e) => {
        try {
          e.dataTransfer.setData("text/plain", "drag")
          e.dataTransfer.effectAllowed = "move"
        } catch {
          // ignore
        }
        onDragStart?.(e)
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "drag-handle relative z-10",
        !disabled && "cursor-grab active:cursor-grabbing",
        highlighted && "text-dbd-yellow"
      )}
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <i key={i} />
      ))}
      {highlighted && (
        <span
          className="pointer-events-none absolute -inset-1 rounded border-2 border-dbd-yellow bg-dbd-yellow/20 shadow-[0_0_10px_rgba(234,179,8,0.75)] animate-pulse"
          aria-hidden="true"
        />
      )}
    </span>
  )
}

function buildPlateMotion(prevKills: number, kills: number, fourKill: boolean, isThomas: boolean) {
  // position + 0.5 이상이 새로 채워졌으면 해당 슬롯이 타격받은 것으로 판단
  // (반 개 박힐 때도 이름표 흔들림 발생)
  const newPositions = Array.from({ length: SKULLS_PER_PLAYER }, (_, position) => position)
    .filter((position) => position + 0.5 > prevKills && position + 0.5 <= kills)
  if (newPositions.length === 0) return null

  const finalImpact = newPositions.at(-1)! * SKULL_STAGGER + SKULL_IMPACT_AT
  const duration = fourKill
    ? (SKULLS_PER_PLAYER - 1) * SKULL_STAGGER + SKULL_DURATION + CHARGE_DURATION
    : finalImpact + 0.26
  const frames: Array<{ at: number; x: number; y: number; rotate: number }> = [{ at: 0, x: 0, y: 0, rotate: 0 }]

  // thomas팀은 해골이 왼쪽부터 채워지므로 짝수 위치는 왼쪽 반동,
  // ada팀은 해골이 오른쪽부터 채워지므로 방향을 반전
  const dir = isThomas ? 1 : -1
  newPositions.forEach((position) => {
    const impact = position * SKULL_STAGGER + SKULL_IMPACT_AT
    frames.push(
      { at: Math.max(0, impact - 0.025), x: 0, y: 0, rotate: 0 },
      { at: impact, x: (position % 2 === 0 ? -2.5 : 2.5) * dir, y: 2, rotate: 0 },
      { at: impact + 0.09, x: (position % 2 === 0 ? 1 : -1) * dir, y: -1, rotate: 0 },
      { at: impact + 0.2, x: 0, y: 0, rotate: 0 },
    )
  })

  if (fourKill) {
    const chargeStart = (SKULLS_PER_PLAYER - 1) * SKULL_STAGGER + SKULL_DURATION
    const charge = [
      [0, 0], [-0.2, 0.1], [0.25, -0.15], [-0.4, 0.2],
      [0.55, -0.28], [-0.75, 0.38], [1.0, -0.5], [-1.35, 0.65],
      [1.7, -0.85], [-2.2, 1.1], [2.7, -1.35], [0, 0],
    ]
    charge.forEach(([x, y], index) => frames.push({ at: chargeStart + (index / (charge.length - 1)) * CHARGE_DURATION, x, y, rotate: 0 }))
  }

  frames.sort((a, b) => a.at - b.at)
  return {
    x: frames.map((frame) => frame.x),
    y: frames.map((frame) => frame.y),
    rotate: frames.map((frame) => frame.rotate),
    transition: { duration, times: frames.map((frame) => Math.min(frame.at / duration, 1)), ease: "linear" as const },
  }
}

export function PlayerRow({ player, team, active, isSelgong = false, aceBadge, isGoldSkull = false, animId, prevKills, dragging, isDragHighlighted = false, readOnly = false, removeMode = false, allowHalf = true, tabIndex, killerControl, onRemove, onScore, onZeroKill, onCancel, onNameChange, onNameCommit, onKillerChange, onDragStart, onDragEnter, onDragEnd, onNameKeyDown }: {
  player: Player; team: Team; active: boolean; isSelgong?: boolean; aceBadge?: "win" | "lose" | null; isGoldSkull?: boolean; animId: number; prevKills: number; dragging: boolean; isDragHighlighted?: boolean; readOnly?: boolean; removeMode?: boolean; allowHalf?: boolean; tabIndex?: number
  killerControl?: React.ReactNode
  onRemove?: () => void; onScore: (newKills: number) => void; onZeroKill: () => void; onCancel: () => void; onNameChange: (name: string) => void
  onNameCommit: (name: string, previousName: string) => void; onKillerChange: (killer: string) => void; onDragStart: () => void; onDragEnter: () => void; onDragEnd: () => void
  onNameKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void
}) {
  const isThomas = team === "thomas"
  const hasKillerControl = killerControl != null
  const interactionsDisabled = readOnly || removeMode
  const reducedMotionRaw = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const reducedMotion = mounted ? reducedMotionRaw : false
  const [hover, setHover] = useState<{ index: number; half: boolean } | null>(null)

  useEffect(() => {
    if (!player.played) {
      setHover(null)
    }
  }, [player.played])
  const nameInputRef = useRef<HTMLInputElement>(null)
  const nameAtFocusRef = useRef(player.name)
  useEffect(() => {
    const input = nameInputRef.current
    if (input && document.activeElement === input) {
      if (!player.name.trim()) {
        nameAtFocusRef.current = ""
      }
      return
    }
    nameAtFocusRef.current = player.name
  }, [player.name])
  const [isRevealed, setIsRevealed] = useState(false)
  const [isFlashReady, setIsFlashReady] = useState(false)
  const posForIndex = (i: number) => isThomas ? i : SKULLS_PER_PLAYER - 1 - i
  const fillFor = (pos: number, kills: number): 0 | 0.5 | 1 => kills - pos >= 1 ? 1 : kills - pos >= 0.5 ? 0.5 : 0
  
  // 4v4 모드에서 0.5, 1.5, 2.5킬은 규칙상 불가능함.
  // 반 킬(0.5점)은 4번째 해골(pos === 3)에만 허용하여 3.5킬 입력을 지원함.
  const calcScore = (pos: number, half: boolean) => {
    if (!allowHalf) return pos + 1
    if (pos < 3) return pos + 1
    return pos + (half ? 0.5 : 1)
  }

  const previewKills = hover ? calcScore(posForIndex(hover.index), hover.half) : null
  const fourKill = player.played && player.kills === 4
  const allKillDelay = animId > 0 ? (SKULLS_PER_PLAYER - 1) * SKULL_STAGGER + SKULL_DURATION : 0
  const exaltedRevealDelay = allKillDelay + CHARGE_DURATION
  const plateMotion = animId > 0 && !reducedMotion ? buildPlateMotion(prevKills, player.kills, fourKill, isThomas) : null

  const prevFourKill = useRef(false)
  useEffect(() => {
    if (fourKill && !prevFourKill.current) {
      if (reducedMotion || animId === 0) {
        setIsRevealed(true)
      } else {
        const t = setTimeout(() => setIsRevealed(true), exaltedRevealDelay * 1000)
        return () => clearTimeout(t)
      }
    } else if (!fourKill) {
      setIsRevealed(false)
    }
    prevFourKill.current = fourKill
  }, [fourKill, reducedMotion, animId, exaltedRevealDelay])

  useEffect(() => {
    if (!fourKill || reducedMotion) { setIsFlashReady(false); return }
    const t = setTimeout(() => setIsFlashReady(true), (exaltedRevealDelay + 0.66) * 1000)
    return () => { clearTimeout(t); setIsFlashReady(false) }
  }, [fourKill, reducedMotion, exaltedRevealDelay])

  const skulls = Array.from({ length: SKULLS_PER_PLAYER }).map((_, i) => {
    const pos = posForIndex(i)
    const fill = fillFor(pos, player.kills)
    const preview = previewKills === null ? 0 : fillFor(pos, previewKills)
    const isNew = animId > 0 && fill > 0 && (pos + (fill === 0.5 ? 0.5 : 1)) > prevKills
    return <Skull key={i} team={team} fill={fill} previewFill={preview === fill ? 0 : preview} animId={animId} animOrder={pos} animate={isNew} disabled={interactionsDisabled} hoverPreview={hover?.index === i && previewKills !== null ? formatKillPreview(previewKills) : null} onHover={(half) => setHover({ index: i, half: allowHalf && pos === 3 && half })} onPick={(half) => {
      setHover(null)
      const selected = calcScore(pos, half)
      if (player.kills === selected && player.played) {
        onCancel()
      } else {
        onScore(selected)
      }
    }} />
  })

  const nameInput = (
    <input
      ref={nameInputRef}
      value={player.name}
      placeholder="이름 입력"
      readOnly={interactionsDisabled}
      tabIndex={tabIndex}
      onChange={(event) => {
        if (!event.target.value.trim()) {
          nameAtFocusRef.current = ""
        }
        onNameChange(event.target.value)
      }}
      onFocus={(event) => {
        nameAtFocusRef.current = player.name
        event.currentTarget.select()
      }}
      onBlur={(event) => {
        // Overflowed Hangul can leave scrollLeft > 0 and hide the first glyph.
        event.currentTarget.scrollLeft = 0
        onNameCommit(event.target.value, nameAtFocusRef.current)
      }}
      onKeyDown={(event) => {
        onNameKeyDown?.(event)
        if (event.key === "Enter" && !event.nativeEvent.isComposing && event.keyCode !== 229) {
          event.currentTarget.blur()
        }
      }}
      aria-label="플레이어 이름"
      className={cn(
        "player-name-input",
        isThomas ? "text-left" : "text-right",
        interactionsDisabled && "cursor-default",
      )}
    />
  )
  const skullGroup = (
    <div
      className="skull-group"
      onPointerLeave={() => setHover(null)}
      onMouseLeave={() => setHover(null)}
    >
      {skulls}
    </div>
  )

  return (
    <div className={cn(
      "relative",
      hasKillerControl && "fearless-player-row",
      hasKillerControl && `fearless-player-row-${team}`,
    )}>
      {/* 살인마 기록 — 이름표 바깥 절대 위치, 이름표 높이와 수직 중앙 정렬
          thomas팀: 오른쪽 끝(이름표 가장자리)이 고정되고 input이 왼쪽으로 늘어남
          ada팀:    왼쪽 끝(이름표 가장자리)이 고정되고 input이 오른쪽으로 늘어남 */}
      <div className={cn(
        hasKillerControl
          ? "fearless-player-row-control"
          : "absolute top-1/2 -translate-y-1/2 z-10 flex",
        !hasKillerControl && (isThomas
          ? "justify-end right-[calc(100%+0.375rem)]"  // 우측 끝 고정 → 왼쪽으로 성장
          : "justify-start left-[calc(100%+0.375rem)]"), // 좌측 끝 고정 → 오른쪽으로 성장
      )}>
        {hasKillerControl ? killerControl : (
          <KillerTag
            value={player.killer ?? ""}
            isThomas={isThomas}
            disabled={interactionsDisabled}
            onChange={onKillerChange}
          />
        )}
      </div>
      <motion.div
        key={`${player.id}-${animId}`}
        role={removeMode ? "button" : undefined} tabIndex={removeMode ? 0 : undefined} aria-label={removeMode ? `${player.name} 제거` : undefined}
        onClick={removeMode ? (event) => { event.stopPropagation(); onRemove?.() } : undefined}
        onKeyDown={removeMode ? (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onRemove?.() } } : undefined}
        onDragEnter={onDragEnter}
        onDragOver={(event) => {
          if (!interactionsDisabled) {
            event.preventDefault()
            event.dataTransfer.dropEffect = "move"
          }
        }}
        onDrop={(event) => {
          if (!interactionsDisabled) {
            event.preventDefault()
          }
        }}
        className={cn("plate-motion-shell", dragging && "opacity-40")}
        animate={plateMotion ? { x: plateMotion.x, y: plateMotion.y, rotate: plateMotion.rotate } : undefined}
        transition={plateMotion?.transition}
      >
        <div className={cn("player-plate", `player-plate-${team}`, active && "is-active", isSelgong && "is-selgong", isRevealed && "is-exalted", removeMode && "is-removing")}>
          <span className="plate-grain" aria-hidden="true" />
          {fourKill && !reducedMotion && (
            <motion.span
              className="plate-whiteout"
              aria-hidden="true"
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 1, 0] }}
              transition={{ duration: 0.62, delay: exaltedRevealDelay, times: [0, 0.01, 0.22, 1], ease: [0.16, 0.84, 0.28, 1] }}
            />
          )}
          {isRevealed && <span className="exalted-corners" aria-hidden="true" />}
          {isFlashReady && <span className="exalted-flash" aria-hidden="true" />}
          {isThomas ? (
            <>
              <div className="player-plate-leading flex min-w-0 flex-1 items-center gap-[inherit]">
                <DragHandle disabled={interactionsDisabled} highlighted={isDragHighlighted} onDragStart={onDragStart} onDragEnd={onDragEnd} />
                <div className="flex min-w-0 flex-1 items-center overflow-hidden gap-[inherit]">
                  <div className="player-name-cell flex w-[8.75rem] max-w-[8.75rem] shrink-0 items-center sm:w-[9.5rem] sm:max-w-[9.5rem]">
                    {nameInput}
                  </div>
                  <div className="min-w-0 flex-1 pointer-events-none" aria-hidden="true" />
                </div>
              </div>
              <NoKillButton
                team={team}
                played={player.played}
                kills={player.kills}
                disabled={interactionsDisabled}
                onZero={() => {
                  setHover(null)
                  onZeroKill()
                }}
                onCancel={() => {
                  setHover(null)
                  onCancel()
                }}
              />
              {skullGroup}
            </>
          ) : (
            <>
              {skullGroup}
              <NoKillButton
                team={team}
                played={player.played}
                kills={player.kills}
                disabled={interactionsDisabled}
                onZero={() => {
                  setHover(null)
                  onZeroKill()
                }}
                onCancel={() => {
                  setHover(null)
                  onCancel()
                }}
              />
              <div className="player-plate-trailing flex min-w-0 flex-1 items-center gap-[inherit]">
                <div className="flex min-w-0 flex-1 items-center justify-end overflow-hidden gap-[inherit]">
                  <div className="min-w-0 flex-1 pointer-events-none" aria-hidden="true" />
                  <div className="player-name-cell flex w-[8.75rem] max-w-[8.75rem] shrink-0 items-center justify-end sm:w-[9.5rem] sm:max-w-[9.5rem]">
                    {nameInput}
                  </div>
                </div>
                <DragHandle disabled={interactionsDisabled} highlighted={isDragHighlighted} onDragStart={onDragStart} onDragEnd={onDragEnd} />
              </div>
            </>
          )}
          {isRevealed && (
            <motion.span
              className="exalted-rank"
              aria-hidden="true"
              initial={animId > 0 && !reducedMotion ? { opacity: 0, x: "-60%" } : { opacity: 0.1, x: 0 }}
              animate={{ opacity: 0.1, x: 0 }}
              transition={{ duration: 0.6, ease: [0.8, 0, 0.15, 1] }}
            >ALL KILL</motion.span>
          )}

        </div>
        {fourKill && !reducedMotion && (
          <motion.span
            className={cn("plate-burst-echo", `plate-burst-echo-${team}`)}
            aria-hidden="true"
            initial={{ opacity: 0, scale: 1 }}
            animate={{ opacity: [0, 0.95, 0], scale: [1, 1.18, 1.72] }}
            transition={{ duration: 1.05, delay: exaltedRevealDelay, times: [0, 0.035, 1], ease: [0.08, 0.82, 0.18, 1] }}
          />
        )}
      </motion.div>
    </div>
  )
}

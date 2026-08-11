"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { type Player } from "@/components/player-row"
import { cn } from "@/lib/utils"
import {
  buildExcludedIdsFromList,
  buildSlotSpinPlan,
  DEFAULT_ACE_LOCKED_TEAMS,
  DEFAULT_ACE_MODAL_SYNC,
  estimateSlotSpinDurationMs,
  getAceRerollButtonState,
  getActiveRoster,
  pickInitialSlotIndices,
  runSlotSpinAnimation,
  SLOT_REEL_OVERSHOOT_MS,
  SLOT_SPIN_BASE_DELAY_MS,
  type AceModalSyncState,
  type AceSlotSpinPlan,
} from "@/lib/ace-modal-sync"

export type { AceModalSyncState } from "@/lib/ace-modal-sync"
export type ModalStep = AceModalSyncState["step"]

interface AceMatchModalProps {
  thomas: Player[]
  ada: Player[]
  thomasName: string
  adaName: string
  onCancel: () => void
  onConfirmAceMatch: (
    selectedThomasId: string,
    selectedAdaId: string,
    excludedIds: string[],
  ) => void
  initialStep?: ModalStep
  onStepChange?: (step: ModalStep) => void
  onSyncState?: (state: AceModalSyncState) => void
  readOnly?: boolean
  syncState?: AceModalSyncState | null
  /** Pre-check players excluded from random draw (e.g. prior ace round). */
  initialExcludedIds?: readonly string[]
}

export function AceMatchModal({
  thomas,
  ada,
  thomasName,
  adaName,
  onCancel,
  onConfirmAceMatch,
  initialStep = "prompt",
  onStepChange,
  onSyncState,
  readOnly = false,
  syncState = null,
  initialExcludedIds = [],
}: AceMatchModalProps) {
  const [localState, setLocalState] = useState<AceModalSyncState>(() => ({
    ...DEFAULT_ACE_MODAL_SYNC,
    step: initialStep,
    excludedIds: buildExcludedIdsFromList(initialExcludedIds),
  }))
  const [hasCompletedDraw, setHasCompletedDraw] = useState(false)
  const [viewerSlotDisplay, setViewerSlotDisplay] = useState({
    slotThomasIdx: 0,
    slotAdaIdx: 0,
    isRolling: false,
    slotFinished: false,
  })
  const lastReplayedSpinToken = useRef(0)
  const cancelSpinRef = useRef<(() => void) | null>(null)
  const localStateRef = useRef(localState)

  useEffect(() => {
    localStateRef.current = localState
  }, [localState])

  const excludedIdsKey = JSON.stringify(localState.excludedIds)
  const lockedTeamsKey = JSON.stringify(localState.slotLockedTeams)
  const slotThomasSyncKey =
    localState.isRolling && !localState.slotFinished
      ? -1
      : localState.slotThomasIdx
  const slotAdaSyncKey =
    localState.isRolling && !localState.slotFinished
      ? -1
      : localState.slotAdaIdx

  useEffect(() => {
    if (readOnly || !onSyncState) return
    onSyncState(localState)
  }, [
    excludedIdsKey,
    lockedTeamsKey,
    localState.isRolling,
    localState.selectedAdaId,
    localState.selectedThomasId,
    localState.slotFinished,
    localState.slotSpinPlan,
    localState.slotSpinToken,
    localState.step,
    onSyncState,
    readOnly,
    slotAdaSyncKey,
    slotThomasSyncKey,
  ])

  const baseState = readOnly && syncState ? syncState : localState
  const state =
    readOnly && baseState.step === "random_slot"
      ? { ...baseState, ...viewerSlotDisplay }
      : baseState
  const {
    step,
    selectedThomasId,
    selectedAdaId,
    slotThomasIdx,
    slotAdaIdx,
    isRolling,
    slotFinished,
    excludedIds,
    slotLockedTeams,
    slotSpinPlan,
    slotSpinToken,
  } = state

  const listExcludedIds = () =>
    Object.keys(localStateRef.current.excludedIds).filter(
      (id) => localStateRef.current.excludedIds[id],
    )

  const patchLocalState = (
    patch: Partial<AceModalSyncState>,
  ) => {
    if (readOnly) return
    setLocalState((current) => ({ ...current, ...patch }))
  }

  const setStep = (nextStep: ModalStep) => {
    if (readOnly) return
    if (nextStep !== "random_slot") setHasCompletedDraw(false)
    setLocalState((current) => ({ ...current, step: nextStep }))
    onStepChange?.(nextStep)
  }

  const toggleExcludePlayer = (id: string) => {
    if (readOnly || isRolling) return
    setLocalState((current) => ({
      ...current,
      excludedIds: {
        ...current.excludedIds,
        [id]: !current.excludedIds[id],
      },
    }))
  }

  const toggleTeamLock = (team: "thomas" | "ada") => {
    if (readOnly || isRolling) return
    setLocalState((current) => {
      const currentlyLocked = current.slotLockedTeams[team]
      if (!currentlyLocked && !current.slotFinished) return current
      return {
        ...current,
        slotLockedTeams: {
          ...current.slotLockedTeams,
          [team]: !currentlyLocked,
        },
      }
    })
  }

  const startSlotMachine = () => {
    if (readOnly || thomas.length === 0 || ada.length === 0) return

    const current = localStateRef.current
    if (current.slotLockedTeams.thomas && current.slotLockedTeams.ada) return

    const spinToken = current.slotSpinToken + 1
    const plan = buildSlotSpinPlan(
      thomas,
      ada,
      current.excludedIds,
      current.slotThomasIdx,
      current.slotAdaIdx,
      spinToken,
      current.slotLockedTeams,
    )
    if (!plan) return

    cancelSpinRef.current?.()
    setLocalState({
      ...current,
      isRolling: true,
      slotFinished: false,
      slotSpinToken: spinToken,
      slotSpinPlan: plan,
    })

    cancelSpinRef.current = runSlotSpinAnimation(
      thomas,
      ada,
      current.excludedIds,
      plan,
      (next) => {
        setLocalState((previous) => ({ ...previous, ...next }))
      },
    )
  }

  useEffect(() => {
    if (slotFinished) setHasCompletedDraw(true)
  }, [slotFinished])

  useEffect(() => {
    if (readOnly) return
    const initial = pickInitialSlotIndices(thomas, ada, {})
    patchLocalState({
      slotThomasIdx: initial.slotThomasIdx,
      slotAdaIdx: initial.slotAdaIdx,
    })
  }, [readOnly, thomas, ada])

  useEffect(() => {
    onStepChange?.(localState.step)
  }, [localState.step, onStepChange])

  useEffect(() => {
    if (!readOnly || !syncState?.slotSpinPlan) return
    if (syncState.slotSpinToken <= lastReplayedSpinToken.current) return
    lastReplayedSpinToken.current = syncState.slotSpinToken

    cancelSpinRef.current?.()
    setViewerSlotDisplay({
      slotThomasIdx: syncState.slotThomasIdx,
      slotAdaIdx: syncState.slotAdaIdx,
      isRolling: true,
      slotFinished: false,
    })

    cancelSpinRef.current = runSlotSpinAnimation(
      thomas,
      ada,
      syncState.excludedIds,
      syncState.slotSpinPlan,
      (next) => {
        setViewerSlotDisplay(next)
      },
    )
  }, [
    ada,
    readOnly,
    syncState?.excludedIds,
    syncState?.slotSpinPlan,
    syncState?.slotSpinToken,
    syncState?.slotAdaIdx,
    syncState?.slotThomasIdx,
    thomas,
  ])

  useEffect(() => {
    if (!readOnly || !syncState) return
    if (syncState.step !== "random_slot") return
    if (syncState.isRolling) return
    setViewerSlotDisplay({
      slotThomasIdx: syncState.slotThomasIdx,
      slotAdaIdx: syncState.slotAdaIdx,
      isRolling: false,
      slotFinished: syncState.slotFinished,
    })
  }, [
    readOnly,
    syncState,
    syncState?.isRolling,
    syncState?.slotAdaIdx,
    syncState?.slotFinished,
    syncState?.slotThomasIdx,
    syncState?.step,
  ])

  useEffect(() => {
    return () => {
      cancelSpinRef.current?.()
    }
  }, [])

  return (
    <div className="ace-modal-backdrop">
      <AnimatePresence mode="wait">
        {step === "prompt" && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="ace-modal-panel"
          >
            <h2 className="ace-modal-title">에이스 결정전</h2>
            <p className="ace-modal-body">
              {readOnly ? (
                <>
                  에이스 결정전 시작 여부를
                  <br />
                  확인하고 있습니다.
                </>
              ) : (
                <>
                  경기가 무승부로 종료되었습니다.
                  <br />
                  <span className="ace-modal-em">에이스 결정전</span>
                  을 진행하시겠습니까?
                </>
              )}
            </p>
            {!readOnly && (
              <div className="ace-modal-actions">
                <button
                  type="button"
                  onClick={() => setStep("method_select")}
                  className="ace-modal-btn ace-modal-btn--primary"
                >
                  예
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="ace-modal-btn ace-modal-btn--muted"
                >
                  아니오
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === "method_select" && (
          <motion.div
            key="method_select"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="ace-modal-panel"
          >
            <h2 className="ace-modal-title mb-6">참여 멤버 결정 방법</h2>
            {!readOnly ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setStep("manual_select")}
                    className="ace-modal-choice"
                  >
                    <span className="ace-modal-choice-title">직접 선택</span>
                    <span className="ace-modal-choice-desc">
                      원하는 선수를 클릭하여 지정
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const initial = pickInitialSlotIndices(
                        thomas,
                        ada,
                        excludedIds,
                      )
                      patchLocalState({
                        slotFinished: false,
                        isRolling: false,
                        slotLockedTeams: DEFAULT_ACE_LOCKED_TEAMS,
                        slotThomasIdx: initial.slotThomasIdx,
                        slotAdaIdx: initial.slotAdaIdx,
                      })
                      setStep("random_slot")
                    }}
                    className="ace-modal-choice"
                  >
                    <span className="ace-modal-choice-title">무작위 추첨</span>
                    <span className="ace-modal-choice-desc">
                      슬롯머신으로 랜덤 추첨
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("prompt")}
                  className="ace-modal-btn ace-modal-btn--ghost mt-5"
                >
                  이전으로 돌아가기
                </button>
              </>
            ) : (
              <p className="ace-modal-body">
                참여 멤버 결정 방법을 선택하고 있습니다.
              </p>
            )}
          </motion.div>
        )}

        {step === "manual_select" && (
          <motion.div
            key="manual_select"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="ace-modal-panel ace-modal-panel--wide"
          >
            <h2 className="ace-modal-title ace-modal-title--white">
              {readOnly ? "출전 인원 선택중..." : "출전 인원을 선택해주세요"}
            </h2>

            <div className="ace-modal-columns">
              <div>
                <div className="ace-modal-team-label ace-modal-team-label--thomas ace-modal-team-label--edge-left">
                  {thomasName} 팀
                </div>
                <div className="ace-modal-roster">
                  {thomas.map((player) => {
                    const isSelected = selectedThomasId === player.id
                    return (
                      <PlayerChoice
                        key={player.id}
                        label={player.name || "이름 없음"}
                        team="thomas"
                        isSelected={isSelected}
                        readOnly={readOnly}
                        onClick={() =>
                          patchLocalState({ selectedThomasId: player.id })
                        }
                      />
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="ace-modal-team-label ace-modal-team-label--ada ace-modal-team-label--edge-right">
                  {adaName} 팀
                </div>
                <div className="ace-modal-roster">
                  {ada.map((player) => {
                    const isSelected = selectedAdaId === player.id
                    return (
                      <PlayerChoice
                        key={player.id}
                        label={player.name || "이름 없음"}
                        team="ada"
                        isSelected={isSelected}
                        readOnly={readOnly}
                        onClick={() =>
                          patchLocalState({ selectedAdaId: player.id })
                        }
                      />
                    )
                  })}
                </div>
              </div>
            </div>

            {!readOnly && (
              <div className="ace-modal-footer flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setStep("method_select")}
                  className="ace-modal-btn ace-modal-btn--ghost"
                >
                  방법 다시 선택
                </button>

                <button
                  type="button"
                  disabled={!selectedThomasId || !selectedAdaId}
                  onClick={() => {
                    if (selectedThomasId && selectedAdaId) {
                      onConfirmAceMatch(
                        selectedThomasId,
                        selectedAdaId,
                        listExcludedIds(),
                      )
                    }
                  }}
                  className="ace-modal-btn ace-modal-btn--primary px-8"
                >
                  진행하기
                </button>
              </div>
            )}
          </motion.div>
        )}

        {step === "random_slot" && (
          <motion.div
            key="random_slot"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="ace-modal-panel ace-modal-panel--wide"
          >
            <div className="ace-modal-columns">
              <SlotColumn
                team="thomas"
                teamName={thomasName}
                roster={thomas}
                slotIdx={slotThomasIdx}
                excludedIds={excludedIds}
                isRolling={isRolling}
                slotFinished={slotFinished}
                isLocked={slotLockedTeams.thomas}
                spinPlan={slotSpinPlan}
                spinToken={slotSpinToken}
                keepLockControlsVisible={
                  hasCompletedDraw ||
                  slotFinished ||
                  slotLockedTeams.thomas ||
                  slotLockedTeams.ada
                }
                readOnly={readOnly}
                onToggleExclude={toggleExcludePlayer}
                onToggleLock={() => toggleTeamLock("thomas")}
              />
              <SlotColumn
                team="ada"
                teamName={adaName}
                roster={ada}
                slotIdx={slotAdaIdx}
                excludedIds={excludedIds}
                isRolling={isRolling}
                slotFinished={slotFinished}
                isLocked={slotLockedTeams.ada}
                spinPlan={slotSpinPlan}
                spinToken={slotSpinToken}
                keepLockControlsVisible={
                  hasCompletedDraw ||
                  slotFinished ||
                  slotLockedTeams.thomas ||
                  slotLockedTeams.ada
                }
                readOnly={readOnly}
                onToggleExclude={toggleExcludePlayer}
                onToggleLock={() => toggleTeamLock("ada")}
              />
            </div>

            {!readOnly && (
              <div className="ace-modal-footer relative min-h-[2.5rem]">
                <button
                  type="button"
                  onClick={() => setStep("method_select")}
                  className="ace-modal-btn ace-modal-btn--ghost absolute left-0 top-1.5"
                >
                  방법 다시 선택
                </button>

                <div className="absolute left-1/2 top-1.5 -translate-x-1/2">
                  <AceRerollButton
                    state={getAceRerollButtonState(
                      slotLockedTeams,
                      thomasName,
                      adaName,
                      slotFinished,
                    )}
                    disabled={isRolling}
                    onClick={startSlotMachine}
                  />
                </div>

                <div className="absolute right-0 top-1.5">
                  <button
                    type="button"
                    disabled={isRolling || !slotFinished}
                    onClick={() => {
                      const pickedThomas = thomas[slotThomasIdx]
                      const pickedAda = ada[slotAdaIdx]
                      if (pickedThomas && pickedAda) {
                        onConfirmAceMatch(
                          pickedThomas.id,
                          pickedAda.id,
                          listExcludedIds(),
                        )
                      }
                    }}
                    className="ace-modal-btn ace-modal-btn--primary"
                  >
                    진행하기
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function PlayerChoice({
  label,
  team,
  isSelected,
  readOnly,
  onClick,
}: {
  label: string
  team: "thomas" | "ada"
  isSelected: boolean
  readOnly: boolean
  onClick: () => void
}) {
  const className = cn(
    "ace-modal-player",
    team === "thomas" ? "ace-modal-player--thomas" : "ace-modal-player--ada",
    isSelected && "is-selected",
    readOnly && "is-readonly",
  )

  if (readOnly) {
    return <div className={className}>{label}</div>
  }

  return (
    <button type="button" onClick={onClick} className={className}>
      {label}
    </button>
  )
}

function AceRerollButton({
  state,
  disabled,
  onClick,
}: {
  state: ReturnType<typeof getAceRerollButtonState>
  disabled: boolean
  onClick: () => void
}) {
  if (state.kind === "hidden") return null

  const teamColorClass =
    state.kind === "reroll-team" && state.team === "thomas"
      ? "text-dbd-orange"
      : state.kind === "reroll-team" && state.team === "ada"
        ? "text-dbd-blue"
        : "text-dbd-yellow"

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "ace-modal-btn",
        state.kind === "reroll-team" && state.team === "thomas"
          ? "ace-modal-btn--thomas"
          : state.kind === "reroll-team" && state.team === "ada"
            ? "ace-modal-btn--ada"
            : "ace-modal-btn--primary",
      )}
    >
      {state.kind === "draw" && "추첨하기"}
      {state.kind === "reroll-all" && "다시 뽑기"}
      {state.kind === "reroll-team" && (
        <>
          <span className={teamColorClass}>{state.teamName}</span>
          <span className="text-white">{" "}팀 다시 추첨하기</span>
        </>
      )}
    </button>
  )
}

function AceSlotReel({
  team,
  players,
  startActiveIdx,
  maxSteps,
  spinToken,
  baseDelay,
  visibleRows,
  settleStyle,
}: {
  team: "thomas" | "ada"
  players: Player[]
  startActiveIdx: number
  maxSteps: number
  spinToken: number
  baseDelay: number
  visibleRows: number
  settleStyle: "overshoot" | "undershoot"
}) {
  // Must match --ace-reel-cell (61px) in CSS exactly.
  const cellPx = 61
  const safeStart = Math.max(0, startActiveIdx)
  const safeSteps = Math.max(0, maxSteps)
  const rows = Math.max(1, visibleRows)
  const centerOffset = (rows - 1) / 2
  const travelMs = Math.max(
    0,
    estimateSlotSpinDurationMs(safeSteps, baseDelay) - SLOT_REEL_OVERSHOOT_MS,
  )
  // Keep in sync with runSlotSpinAnimation — no artificial floor, or the
  // slower reel can still be moving when isRolling flips false.
  const travelDuration = Math.max(0.05, travelMs / 1000)
  const snapDuration = SLOT_REEL_OVERSHOOT_MS / 1000
  const totalDuration = travelDuration + snapDuration
  const settlePx = Math.round(cellPx * 0.34)
  const targetIndex = safeStart + safeSteps
  const leadIn = Math.max(players.length * 4, safeSteps)
  const startIndex = targetIndex + leadIn
  const stripLength = startIndex + rows + 4
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    setLanded(false)
    // Fire shine as the settle/clack begins, not after it fully finishes.
    const shineAtMs = Math.max(0, travelDuration * 1000 - 30)
    const timer = window.setTimeout(() => setLanded(true), shineAtMs)
    return () => window.clearTimeout(timer)
  }, [spinToken, travelDuration])

  const strip = useMemo(() => {
    if (players.length === 0) return []
    return Array.from({ length: stripLength }, (_, index) => {
      const player = players[index % players.length]
      return {
        key: `${spinToken}-${index}-${player.id}`,
        player,
        index,
      }
    })
  }, [players, spinToken, stripLength])

  // Top → bottom: start further down the strip, settle on target in the center frame.
  const startY = (centerOffset - startIndex) * cellPx
  const endY = (centerOffset - targetIndex) * cellPx
  const overshootY = endY + settlePx
  const undershootY = endY - settlePx
  const peakY = settleStyle === "overshoot" ? overshootY : undershootY

  return (
    <div
      className={cn(
        "ace-modal-reel",
        team === "thomas" ? "ace-modal-reel--thomas" : "ace-modal-reel--ada",
        landed && "is-landed",
      )}
      style={{ ["--ace-reel-rows" as string]: String(rows) }}
    >
      <div className="ace-modal-reel-focus" aria-hidden="true" />
      <motion.div
        key={`${spinToken}-${settleStyle}`}
        className="ace-modal-reel-strip"
        initial={{ y: startY }}
        animate={{
          y: [startY, peakY, endY],
        }}
        transition={{
          duration: totalDuration,
          times: [0, travelDuration / totalDuration, 1],
          ease:
            settleStyle === "overshoot"
              ? [
                  // Cruise past the winner, then snap back.
                  [0.05, 0.85, 0.12, 1],
                  [0.22, 1.55, 0.36, 1],
                ]
              : [
                  // Stop short, then 철컥! the remaining distance with overshoot.
                  [0.05, 0.82, 0.12, 1],
                  [0.2, 1.7, 0.32, 1],
                ],
        }}
      >
        {strip.map(({ key, player, index }) => {
          const isWinner = index === targetIndex
          return (
            <div
              key={key}
              className={cn(
                "ace-modal-reel-cell",
                landed && isWinner && "is-winner",
                landed && !isWinner && "is-dimmed",
              )}
            >
              <div
                className={cn(
                  "ace-modal-player is-readonly",
                  team === "thomas"
                    ? "ace-modal-player--thomas"
                    : "ace-modal-player--ada",
                  landed && isWinner && "is-picked",
                )}
              >
                <span className="ace-modal-player-name">
                  {player.name || "이름 없음"}
                </span>
              </div>
            </div>
          )
        })}
      </motion.div>
    </div>
  )
}

function SlotColumn({
  team,
  teamName,
  roster,
  slotIdx,
  excludedIds,
  isRolling,
  slotFinished,
  isLocked,
  spinPlan,
  spinToken,
  keepLockControlsVisible,
  readOnly,
  onToggleExclude,
  onToggleLock,
}: {
  team: "thomas" | "ada"
  teamName: string
  roster: Player[]
  slotIdx: number
  excludedIds: Record<string, boolean>
  isRolling: boolean
  slotFinished: boolean
  isLocked: boolean
  spinPlan: AceSlotSpinPlan | null
  spinToken: number
  keepLockControlsVisible: boolean
  readOnly: boolean
  onToggleExclude: (id: string) => void
  onToggleLock: () => void
}) {
  const showLockControl =
    !readOnly && (keepLockControlsVisible || slotFinished || isLocked)
  const activePlayers = getActiveRoster(roster, excludedIds)
  const reelSteps =
    team === "thomas" ? spinPlan?.thomasMaxSteps ?? 0 : spinPlan?.adaMaxSteps ?? 0
  const reelStart =
    team === "thomas"
      ? spinPlan?.startThomasActiveIdx ?? 0
      : spinPlan?.startAdaActiveIdx ?? 0
  const settleStyle =
    team === "thomas"
      ? spinPlan?.thomasSettleStyle ?? "undershoot"
      : spinPlan?.adaSettleStyle ?? "undershoot"
  const showReel =
    Boolean(spinPlan) &&
    isRolling &&
    !isLocked &&
    reelSteps > 0 &&
    activePlayers.length > 0

  return (
    <div
      className={cn(
        "ace-modal-slot-col",
        team === "thomas" ? "ace-modal-slot-col--thomas" : "ace-modal-slot-col--ada",
        isLocked && "is-locked",
      )}
    >
      <div
        className={cn(
          "ace-modal-slot-header",
          team === "thomas"
            ? "ace-modal-slot-header--thomas"
            : "ace-modal-slot-header--ada",
        )}
      >
        <div
          className={cn(
            "ace-modal-team-label",
            team === "thomas"
              ? "ace-modal-team-label--thomas"
              : "ace-modal-team-label--ada",
          )}
        >
          {teamName} 팀
        </div>
        <div className="ace-modal-slot-header-action">
          {showLockControl ? (
            <button
              type="button"
              onClick={onToggleLock}
              disabled={isRolling || (!slotFinished && !isLocked)}
              className={cn(
                "ace-modal-slot-lock",
                isLocked && "is-active",
              )}
            >
              {isLocked ? "확정 해제" : "멤버 확정"}
            </button>
          ) : readOnly && isLocked ? (
            <span className="ace-modal-slot-lock is-active is-badge">
              확정됨
            </span>
          ) : (
            <span
              aria-hidden="true"
              className="ace-modal-slot-lock ace-modal-slot-lock--placeholder"
            >
              멤버 확정
            </span>
          )}
        </div>
      </div>

      <div
        className="ace-modal-slot-body"
        style={{ ["--ace-reel-rows" as string]: String(Math.max(1, roster.length)) }}
      >
        {showReel ? (
          <AceSlotReel
            team={team}
            players={activePlayers}
            startActiveIdx={reelStart}
            maxSteps={reelSteps}
            spinToken={spinToken}
            baseDelay={SLOT_SPIN_BASE_DELAY_MS}
            visibleRows={roster.length}
            settleStyle={settleStyle}
          />
        ) : (
          <div className="ace-modal-roster">
            {roster.map((player, index) => {
              const isPicked = (slotFinished || isRolling) && index === slotIdx
              const isExcluded = Boolean(excludedIds[player.id])
              return (
                <div
                  key={player.id}
                  onClick={() =>
                    !readOnly && !isLocked && onToggleExclude(player.id)
                  }
                  className={cn(
                    "ace-modal-player justify-between",
                    team === "thomas"
                      ? "ace-modal-player--thomas"
                      : "ace-modal-player--ada",
                    isExcluded && "is-excluded",
                    !isExcluded && isPicked && "is-picked",
                    !isExcluded && isPicked && isLocked && "is-locked",
                    !isExcluded && isLocked && !isPicked && "is-dimmed",
                    !readOnly && !isExcluded && !isLocked && "cursor-pointer",
                    readOnly && "is-readonly",
                  )}
                >
                  <span className="ace-modal-player-name">
                    {player.name || "이름 없음"}
                  </span>
                  {!readOnly && (
                    <div
                      className="ace-modal-player-meta"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <span>{isExcluded ? "제외" : "포함"}</span>
                      <input
                        type="checkbox"
                        disabled={isRolling || isLocked}
                        checked={!isExcluded}
                        onChange={() => onToggleExclude(player.id)}
                        title={isExcluded ? "추첨 대상에 포함" : "추첨에서 제외"}
                        className="size-3.5 accent-dbd-yellow cursor-pointer"
                      />
                    </div>
                  )}
                  {readOnly && isExcluded && (
                    <span className="ace-modal-player-meta">제외</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { type Player } from "@/components/player-row"
import { cn } from "@/lib/utils"
import {
  buildSlotSpinPlan,
  DEFAULT_ACE_MODAL_SYNC,
  pickInitialSlotIndices,
  runSlotSpinAnimation,
  type AceModalSyncState,
} from "@/lib/ace-modal-sync"

export type { AceModalSyncState } from "@/lib/ace-modal-sync"
export type ModalStep = AceModalSyncState["step"]

interface AceMatchModalProps {
  thomas: Player[]
  ada: Player[]
  thomasName: string
  adaName: string
  onCancel: () => void
  onConfirmAceMatch: (selectedThomasId: string, selectedAdaId: string) => void
  initialStep?: ModalStep
  onStepChange?: (step: ModalStep) => void
  onSyncState?: (state: AceModalSyncState) => void
  readOnly?: boolean
  syncState?: AceModalSyncState | null
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
}: AceMatchModalProps) {
  const [localState, setLocalState] = useState<AceModalSyncState>({
    ...DEFAULT_ACE_MODAL_SYNC,
    step: initialStep,
  })
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
  } = state

  const patchLocalState = (
    patch: Partial<AceModalSyncState>,
  ) => {
    if (readOnly) return
    setLocalState((current) => ({ ...current, ...patch }))
  }

  const setStep = (nextStep: ModalStep) => {
    if (readOnly) return
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

  const startSlotMachine = () => {
    if (readOnly || thomas.length === 0 || ada.length === 0) return

    const current = localStateRef.current
    const spinToken = current.slotSpinToken + 1
    const plan = buildSlotSpinPlan(
      thomas,
      ada,
      current.excludedIds,
      current.slotThomasIdx,
      current.slotAdaIdx,
      spinToken,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto p-4">
      <AnimatePresence mode="wait">
        {step === "prompt" && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="w-full max-w-md rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          >
            <h2
              className="text-xl font-bold text-dbd-yellow mb-3"
              style={{ fontFamily: "var(--font-godo)" }}
            >
              에이스 결정전
            </h2>
            <p
              className={cn(
                "text-sm text-neutral-300 leading-relaxed",
                !readOnly && "mb-6",
              )}
            >
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
                  <span className="text-dbd-yellow font-bold">에이스 결정전</span>
                  을 진행하시겠습니까?
                </>
              )}
            </p>
            {!readOnly && (
              <div className="flex gap-4 justify-center">
                <button
                  type="button"
                  onClick={() => setStep("method_select")}
                  className="rounded border border-neutral-600 bg-black/90 px-6 py-2.5 text-sm font-bold text-dbd-yellow hover:border-neutral-400 hover:bg-dbd-yellow/20 transition-all cursor-pointer"
                >
                  예
                </button>
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded border border-neutral-600 bg-neutral-900/90 px-6 py-2.5 text-sm font-bold text-neutral-300 hover:border-neutral-400 hover:text-white transition-all cursor-pointer"
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
            className="w-full max-w-md rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          >
            <h2
              className="text-xl font-bold text-dbd-yellow mb-6"
              style={{ fontFamily: "var(--font-godo)" }}
            >
              참여 멤버 결정 방법
            </h2>
            {!readOnly ? (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    type="button"
                    onClick={() => setStep("manual_select")}
                    className="flex flex-col items-center justify-center p-5 rounded-lg border border-neutral-600 bg-black/80 hover:bg-neutral-800/80 hover:border-neutral-400 text-neutral-200 transition-all cursor-pointer group"
                  >
                    <span className="font-bold text-sm">직접 선택</span>
                    <span className="text-[11px] text-neutral-400 mt-1">
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
                        slotThomasIdx: initial.slotThomasIdx,
                        slotAdaIdx: initial.slotAdaIdx,
                      })
                      setStep("random_slot")
                    }}
                    className="flex flex-col items-center justify-center p-5 rounded-lg border border-neutral-600 bg-black/80 hover:bg-neutral-800/80 hover:border-neutral-400 text-neutral-200 transition-all cursor-pointer group"
                  >
                    <span className="font-bold text-sm">무작위 추첨</span>
                    <span className="text-[11px] text-neutral-400 mt-1">
                      슬롯머신으로 랜덤 추첨
                    </span>
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setStep("prompt")}
                  className="mt-5 text-xs text-neutral-400 hover:text-white underline cursor-pointer"
                >
                  이전으로 돌아가기
                </button>
              </>
            ) : (
              <p className="text-sm text-neutral-300 leading-relaxed">
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
            className="w-full max-w-2xl rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          >
            <h2
              className="text-xl font-bold text-dbd-yellow mb-6"
              style={{ fontFamily: "var(--font-godo)" }}
            >
              {readOnly ? "출전 인원 선택중..." : "출전 인원을 선택해주세요"}
            </h2>

            <div className="grid grid-cols-2 gap-6 text-left mb-6">
              <div>
                <div className="font-bold text-dbd-orange text-sm mb-2 pb-1 border-b border-dbd-orange/40 text-center">
                  {thomasName} 팀
                </div>
                <div className="flex flex-col gap-2">
                  {thomas.map((player) => {
                    const isSelected = selectedThomasId === player.id
                    return (
                      <PlayerChoice
                        key={player.id}
                        label={player.name || "이름 없음"}
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
                <div className="font-bold text-dbd-blue text-sm mb-2 pb-1 border-b border-dbd-blue/40 text-center">
                  {adaName} 팀
                </div>
                <div className="flex flex-col gap-2">
                  {ada.map((player) => {
                    const isSelected = selectedAdaId === player.id
                    return (
                      <PlayerChoice
                        key={player.id}
                        label={player.name || "이름 없음"}
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
              <div className="flex justify-between items-center pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setStep("method_select")}
                  className="text-xs text-neutral-400 hover:text-white underline cursor-pointer"
                >
                  방법 다시 선택
                </button>

                <button
                  type="button"
                  disabled={!selectedThomasId || !selectedAdaId}
                  onClick={() => {
                    if (selectedThomasId && selectedAdaId) {
                      onConfirmAceMatch(selectedThomasId, selectedAdaId)
                    }
                  }}
                  className={cn(
                    "rounded border px-8 py-2.5 text-sm font-bold transition-all cursor-pointer disabled:cursor-not-allowed",
                    selectedThomasId && selectedAdaId
                      ? "border-neutral-600 bg-black/90 text-dbd-yellow hover:border-neutral-400 hover:bg-dbd-yellow/20"
                      : "border-neutral-800 bg-neutral-900 text-neutral-500 opacity-50",
                  )}
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
            className="w-full max-w-2xl rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          >
            <div className="grid grid-cols-2 gap-6 text-left mb-6">
              <SlotColumn
                teamName={thomasName}
                teamColor="text-dbd-orange border-dbd-orange/40"
                roster={thomas}
                slotIdx={slotThomasIdx}
                excludedIds={excludedIds}
                isRolling={isRolling}
                slotFinished={slotFinished}
                readOnly={readOnly}
                onToggleExclude={toggleExcludePlayer}
              />
              <SlotColumn
                teamName={adaName}
                teamColor="text-dbd-blue border-dbd-blue/40"
                roster={ada}
                slotIdx={slotAdaIdx}
                excludedIds={excludedIds}
                isRolling={isRolling}
                slotFinished={slotFinished}
                readOnly={readOnly}
                onToggleExclude={toggleExcludePlayer}
              />
            </div>

            {!readOnly && (
              <div className="relative flex items-center justify-center pt-2 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setStep("method_select")}
                  className="absolute left-0 text-xs text-neutral-400 hover:text-white underline cursor-pointer"
                >
                  방법 다시 선택
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    disabled={isRolling}
                    onClick={startSlotMachine}
                    className="rounded px-5 py-2.5 border border-neutral-600 bg-black/90 text-sm font-bold text-dbd-yellow hover:border-neutral-400 hover:bg-dbd-yellow/20 disabled:opacity-40 cursor-pointer transition-all"
                  >
                    {slotFinished ? "다시 뽑기" : "추첨하기"}
                  </button>

                  {slotFinished && (
                    <button
                      type="button"
                      disabled={isRolling || !slotFinished}
                      onClick={() => {
                        const pickedThomas = thomas[slotThomasIdx]
                        const pickedAda = ada[slotAdaIdx]
                        if (pickedThomas && pickedAda) {
                          onConfirmAceMatch(pickedThomas.id, pickedAda.id)
                        }
                      }}
                      className="rounded border border-neutral-600 bg-black/90 px-6 py-2.5 text-sm font-bold text-dbd-yellow hover:border-neutral-400 hover:bg-dbd-yellow/20 transition-all cursor-pointer"
                    >
                      진행하기
                    </button>
                  )}
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
  isSelected,
  readOnly,
  onClick,
}: {
  label: string
  isSelected: boolean
  readOnly: boolean
  onClick: () => void
}) {
  const className = cn(
    "w-full px-4 py-2.5 rounded border text-center justify-center flex items-center transition-all duration-200",
    isSelected
      ? "border-dbd-yellow bg-dbd-yellow/20 text-dbd-yellow font-bold shadow-[0_0_15px_rgba(234,179,8,0.4)]"
      : "border-neutral-700 bg-neutral-900/80 text-neutral-200",
    !readOnly && !isSelected && "hover:border-neutral-500 cursor-pointer",
    readOnly && "cursor-default",
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

function SlotColumn({
  teamName,
  teamColor,
  roster,
  slotIdx,
  excludedIds,
  isRolling,
  slotFinished,
  readOnly,
  onToggleExclude,
}: {
  teamName: string
  teamColor: string
  roster: Player[]
  slotIdx: number
  excludedIds: Record<string, boolean>
  isRolling: boolean
  slotFinished: boolean
  readOnly: boolean
  onToggleExclude: (id: string) => void
}) {
  return (
    <div>
      <div
        className={cn(
          "font-bold text-sm mb-2 pb-1 border-b text-center",
          teamColor,
        )}
      >
        {teamName} 팀
      </div>
      <div className="flex flex-col gap-2">
        {roster.map((player, index) => {
          const isPicked = (slotFinished || isRolling) && index === slotIdx
          const isExcluded = Boolean(excludedIds[player.id])
          return (
            <div
              key={player.id}
              onClick={() => !readOnly && onToggleExclude(player.id)}
              className={cn(
                "w-full px-3 py-2.5 rounded border flex items-center justify-between transition-all duration-150 select-none",
                isExcluded
                  ? "border-neutral-900 bg-neutral-950/80 text-neutral-600 opacity-45"
                  : isPicked
                    ? "border-dbd-yellow bg-dbd-yellow/25 text-dbd-yellow font-extrabold scale-[1.02] shadow-[0_0_20px_rgba(234,179,8,0.5)]"
                    : "border-neutral-800 bg-neutral-900/50 text-neutral-300",
                !readOnly && !isExcluded && "cursor-pointer hover:border-neutral-700",
                readOnly && "cursor-default",
              )}
            >
              <span
                className={cn(
                  "flex-1 text-center font-bold text-sm",
                  isExcluded && "line-through text-neutral-600",
                )}
              >
                {player.name || "이름 없음"}
              </span>
              {!readOnly && (
                <div
                  className="flex items-center gap-1.5 shrink-0"
                  onClick={(event) => event.stopPropagation()}
                >
                  <span className="text-[11px] text-neutral-500 font-mono">
                    {isExcluded ? "제외" : "포함"}
                  </span>
                  <input
                    type="checkbox"
                    disabled={isRolling}
                    checked={!isExcluded}
                    onChange={() => onToggleExclude(player.id)}
                    title={isExcluded ? "추첨 대상에 포함" : "추첨에서 제외"}
                    className="size-3.5 accent-dbd-yellow cursor-pointer"
                  />
                </div>
              )}
              {readOnly && isExcluded && (
                <span className="text-[11px] text-neutral-500 font-mono shrink-0">
                  제외
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

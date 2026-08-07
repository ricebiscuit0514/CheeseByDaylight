"use client"

import { useEffect, useRef, useState } from "react"
import { motion, AnimatePresence } from "motion/react"
import { HoldButton } from "@/components/hold-button"
import { type Player } from "@/components/player-row"
import { cn } from "@/lib/utils"

interface AceMatchModalProps {
  thomas: Player[]
  ada: Player[]
  thomasName: string
  adaName: string
  onCancel: () => void
  onConfirmAceMatch: (selectedThomasId: string, selectedAdaId: string) => void
  initialStep?: ModalStep
}

type ModalStep = "prompt" | "method_select" | "manual_select" | "random_slot"

export function AceMatchModal({
  thomas,
  ada,
  thomasName,
  adaName,
  onCancel,
  onConfirmAceMatch,
  initialStep = "prompt",
}: AceMatchModalProps) {
  const [step, setStep] = useState<ModalStep>(initialStep)

  // Manual Select State
  const [selectedThomasId, setSelectedThomasId] = useState<string | null>(null)
  const [selectedAdaId, setSelectedAdaId] = useState<string | null>(null)
  const [hoveredPlayerId, setHoveredPlayerId] = useState<string | null>(null)

  // Random Slot State
  const [isRolling, setIsRolling] = useState(false)
  const [slotThomasIdx, setSlotThomasIdx] = useState(0)
  const [slotAdaIdx, setSlotAdaIdx] = useState(0)
  const [slotFinished, setSlotFinished] = useState(false)
  const [excludedIds, setExcludedIds] = useState<Record<string, boolean>>({})

  // Memory refs to prevent consecutive duplicate draws on re-rolls & suppress same-index pairs
  const lastThomasIdx = useRef<number | null>(null)
  const lastAdaIdx = useRef<number | null>(null)

  const toggleExcludePlayer = (id: string) => {
    if (isRolling) return
    setExcludedIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // Randomize initial slot starting indices so both reels don't start at the same seat position
  const initSlotPositions = () => {
    if (thomas.length === 0 || ada.length === 0) return
    const randT = Math.floor(Math.random() * thomas.length)
    let randA = Math.floor(Math.random() * ada.length)
    if (ada.length > 1 && randA === randT) {
      randA = (randA + 1) % ada.length
    }
    setSlotThomasIdx(randT)
    setSlotAdaIdx(randA)
  }

  // Start Slot Machine Animation
  const startSlotMachine = () => {
    if (thomas.length === 0 || ada.length === 0) return
    setIsRolling(true)
    setSlotFinished(false)

    const tLen = thomas.length
    const aLen = ada.length

    // Filter eligible candidates (excluding checked excluded players)
    const eligibleThomas = thomas.filter((p) => !excludedIds[p.id])
    const eligibleAda = ada.filter((p) => !excludedIds[p.id])

    const activeThomas = eligibleThomas.length > 0 ? eligibleThomas : thomas
    const activeAda = eligibleAda.length > 0 ? eligibleAda : ada

    let chosenThomasObj = activeThomas[Math.floor(Math.random() * activeThomas.length)]
    let chosenAdaObj = activeAda[Math.floor(Math.random() * activeAda.length)]

    let targetThomas = thomas.findIndex((p) => p.id === chosenThomasObj.id)
    let targetAda = ada.findIndex((p) => p.id === chosenAdaObj.id)

    // 1. 이전 추첨 결과와 동일한 인덱스가 다시 걸리지 않도록 방지 (리롤 시 중복 방지)
    if (activeThomas.length > 1 && lastThomasIdx.current !== null && targetThomas === lastThomasIdx.current) {
      const filtered = activeThomas.filter((p) => p.id !== chosenThomasObj.id)
      if (filtered.length > 0) {
        chosenThomasObj = filtered[Math.floor(Math.random() * filtered.length)]
        targetThomas = thomas.findIndex((p) => p.id === chosenThomasObj.id)
      }
    }
    if (activeAda.length > 1 && lastAdaIdx.current !== null && targetAda === lastAdaIdx.current) {
      const filtered = activeAda.filter((p) => p.id !== chosenAdaObj.id)
      if (filtered.length > 0) {
        chosenAdaObj = filtered[Math.floor(Math.random() * filtered.length)]
        targetAda = ada.findIndex((p) => p.id === chosenAdaObj.id)
      }
    }

    lastThomasIdx.current = targetThomas
    lastAdaIdx.current = targetAda

    // Calculate exact steps to land naturally on target index
    const tStepsToTarget = (targetThomas - slotThomasIdx + tLen * 10) % tLen
    const aStepsToTarget = (targetAda - slotAdaIdx + aLen * 10) % aLen

    // Reduced total spin duration by ~30%
    const thomasMaxSteps = (tStepsToTarget === 0 ? tLen : tStepsToTarget) + tLen * (4 + Math.floor(Math.random() * 2))
    const adaMaxSteps = (aStepsToTarget === 0 ? aLen : aStepsToTarget) + aLen * (5 + Math.floor(Math.random() * 2))

    let thomasStep = 0
    let adaStep = 0
    let thomasDone = false
    let adaDone = false

    // Identical roll speed for both reels
    const BASE_SPEED_MS = 40
    const DECEL_STEPS = 5 // Decelerate over the last 5 steps

    const rollThomas = () => {
      thomasStep += 1
      setSlotThomasIdx((prev) => (prev + 1) % tLen)

      if (thomasStep >= thomasMaxSteps) {
        thomasDone = true
        if (adaDone) {
          setIsRolling(false)
          setSlotFinished(true)
        }
      } else {
        const remaining = thomasMaxSteps - thomasStep
        let delay = BASE_SPEED_MS
        if (remaining <= DECEL_STEPS) {
          delay = BASE_SPEED_MS + Math.pow(DECEL_STEPS - remaining + 1, 2) * 12
        }
        setTimeout(rollThomas, delay)
      }
    }

    const rollAda = () => {
      adaStep += 1
      setSlotAdaIdx((prev) => (prev + 1) % aLen)

      if (adaStep >= adaMaxSteps) {
        adaDone = true
        if (thomasDone) {
          setIsRolling(false)
          setSlotFinished(true)
        }
      } else {
        const remaining = adaMaxSteps - adaStep
        let delay = BASE_SPEED_MS
        if (remaining <= DECEL_STEPS) {
          delay = BASE_SPEED_MS + Math.pow(DECEL_STEPS - remaining + 1, 2) * 12
        }
        setTimeout(rollAda, delay)
      }
    }

    rollThomas()
    rollAda()
  }

  useEffect(() => {
    initSlotPositions()
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto p-4">
      <AnimatePresence mode="wait">
        {/* Step 1: 에이스 결정전 진행 여부 확인 */}
        {step === "prompt" && (
          <motion.div
            key="prompt"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="w-full max-w-md rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          >
            <h2 className="text-xl font-bold text-dbd-yellow mb-3" style={{ fontFamily: "var(--font-godo)" }}>
              에이스 결정전
            </h2>
            <p className="text-sm text-neutral-300 mb-6 leading-relaxed">
              경기가 무승부로 종료되었습니다.<br />
              <span className="text-dbd-yellow font-bold">에이스 결정전</span>을 진행하시겠습니까?
            </p>
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
          </motion.div>
        )}

        {/* Step 2: 참여 멤버 결정 방법 확인창 */}
        {step === "method_select" && (
          <motion.div
            key="method_select"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="w-full max-w-md rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          >
            <h2 className="text-xl font-bold text-dbd-yellow mb-6" style={{ fontFamily: "var(--font-godo)" }}>
              참여 멤버 결정 방법
            </h2>
            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={() => setStep("manual_select")}
                className="flex flex-col items-center justify-center p-5 rounded-lg border border-neutral-600 bg-black/80 hover:bg-neutral-800/80 hover:border-neutral-400 text-neutral-200 transition-all cursor-pointer group"
              >
                <span className="font-bold text-sm">직접 선택</span>
                <span className="text-[11px] text-neutral-400 mt-1">원하는 선수를 클릭하여 지정</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSlotFinished(false)
                  setIsRolling(false)
                  setStep("random_slot")
                }}
                className="flex flex-col items-center justify-center p-5 rounded-lg border border-neutral-600 bg-black/80 hover:bg-neutral-800/80 hover:border-neutral-400 text-neutral-200 transition-all cursor-pointer group"
              >
                <span className="font-bold text-sm">무작위 추첨</span>
                <span className="text-[11px] text-neutral-400 mt-1">슬롯머신으로 랜덤 추첨</span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setStep("prompt")}
              className="mt-5 text-xs text-neutral-400 hover:text-white underline cursor-pointer"
            >
              이전으로 돌아가기
            </button>
          </motion.div>
        )}

        {/* Step 3-A: 직접 선택 모드 */}
        {step === "manual_select" && (
          <motion.div
            key="manual_select"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="w-full max-w-2xl rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          >
            <h2 className="text-xl font-bold text-dbd-yellow mb-6" style={{ fontFamily: "var(--font-godo)" }}>
              출전 인원을 선택해주세요
            </h2>

            <div className="grid grid-cols-2 gap-6 text-left mb-6">
              {/* Thomas Team Column */}
              <div>
                <div className="font-bold text-dbd-orange text-sm mb-2 pb-1 border-b border-dbd-orange/40 text-center">
                  {thomasName} 팀
                </div>
                <div className="flex flex-col gap-2">
                  {thomas.map((p) => {
                    const isSelected = selectedThomasId === p.id
                    const isHovered = hoveredPlayerId === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedThomasId(p.id)}
                        onMouseEnter={() => setHoveredPlayerId(p.id)}
                        onMouseLeave={() => setHoveredPlayerId(null)}
                        className={cn(
                          "w-full px-4 py-2.5 rounded border text-center justify-center flex items-center transition-all duration-200 cursor-pointer",
                          isSelected
                            ? "border-dbd-yellow bg-dbd-yellow/20 text-dbd-yellow font-bold shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                            : isHovered
                            ? "border-neutral-500 bg-neutral-800/80 text-white"
                            : "border-neutral-700 bg-neutral-900/80 text-neutral-200 hover:border-neutral-500"
                        )}
                      >
                        <span>{p.name || "이름 없음"}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Ada Team Column */}
              <div>
                <div className="font-bold text-dbd-blue text-sm mb-2 pb-1 border-b border-dbd-blue/40 text-center">
                  {adaName} 팀
                </div>
                <div className="flex flex-col gap-2">
                  {ada.map((p) => {
                    const isSelected = selectedAdaId === p.id
                    const isHovered = hoveredPlayerId === p.id
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedAdaId(p.id)}
                        onMouseEnter={() => setHoveredPlayerId(p.id)}
                        onMouseLeave={() => setHoveredPlayerId(null)}
                        className={cn(
                          "w-full px-4 py-2.5 rounded border text-center justify-center flex items-center transition-all duration-200 cursor-pointer",
                          isSelected
                            ? "border-dbd-yellow bg-dbd-yellow/20 text-dbd-yellow font-bold shadow-[0_0_15px_rgba(234,179,8,0.4)]"
                            : isHovered
                            ? "border-neutral-500 bg-neutral-800/80 text-white"
                            : "border-neutral-700 bg-neutral-900/80 text-neutral-200 hover:border-neutral-500"
                        )}
                      >
                        <span>{p.name || "이름 없음"}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

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
                    : "border-neutral-800 bg-neutral-900 text-neutral-500 opacity-50"
                )}
              >
                진행하기
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3-B: 무작위 슬롯머신 추첨 모드 */}
        {step === "random_slot" && (
          <motion.div
            key="random_slot"
            initial={{ opacity: 0, scale: 0.9, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -10 }}
            className="w-full max-w-2xl rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]"
          >
            <div className="grid grid-cols-2 gap-6 text-left mb-6">
              {/* Thomas Slot */}
              <div>
                <div className="font-bold text-dbd-orange text-sm mb-2 pb-1 border-b border-dbd-orange/40 text-center">
                  {thomasName} 팀
                </div>
                <div className="flex flex-col gap-2">
                  {thomas.map((p, idx) => {
                    const isPicked = (slotFinished || isRolling) && idx === slotThomasIdx
                    const isExcluded = Boolean(excludedIds[p.id])
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleExcludePlayer(p.id)}
                        className={cn(
                          "w-full px-3 py-2.5 rounded border flex items-center justify-between transition-all duration-150 cursor-pointer select-none",
                          isExcluded
                            ? "border-neutral-900 bg-neutral-950/80 text-neutral-600 opacity-45"
                            : isPicked
                            ? "border-dbd-yellow bg-dbd-yellow/25 text-dbd-yellow font-extrabold scale-[1.02] shadow-[0_0_20px_rgba(234,179,8,0.5)]"
                            : "border-neutral-800 bg-neutral-900/50 text-neutral-300 hover:border-neutral-700"
                        )}
                      >
                        <span className={cn("flex-1 text-center font-bold text-sm", isExcluded && "line-through text-neutral-600")}>
                          {p.name || "이름 없음"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[11px] text-neutral-500 font-mono">
                            {isExcluded ? "제외" : "포함"}
                          </span>
                          <input
                            type="checkbox"
                            disabled={isRolling}
                            checked={!isExcluded}
                            onChange={() => toggleExcludePlayer(p.id)}
                            title={isExcluded ? "추첨 대상에 포함" : "추첨에서 제외"}
                            className="size-3.5 accent-dbd-yellow cursor-pointer"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Ada Slot */}
              <div>
                <div className="font-bold text-dbd-blue text-sm mb-2 pb-1 border-b border-dbd-blue/40 text-center">
                  {adaName} 팀
                </div>
                <div className="flex flex-col gap-2">
                  {ada.map((p, idx) => {
                    const isPicked = (slotFinished || isRolling) && idx === slotAdaIdx
                    const isExcluded = Boolean(excludedIds[p.id])
                    return (
                      <div
                        key={p.id}
                        onClick={() => toggleExcludePlayer(p.id)}
                        className={cn(
                          "w-full px-3 py-2.5 rounded border flex items-center justify-between transition-all duration-150 cursor-pointer select-none",
                          isExcluded
                            ? "border-neutral-900 bg-neutral-950/80 text-neutral-600 opacity-45"
                            : isPicked
                            ? "border-dbd-yellow bg-dbd-yellow/25 text-dbd-yellow font-extrabold scale-[1.02] shadow-[0_0_20px_rgba(234,179,8,0.5)]"
                            : "border-neutral-800 bg-neutral-900/50 text-neutral-300 hover:border-neutral-700"
                        )}
                      >
                        <span className={cn("flex-1 text-center font-bold text-sm", isExcluded && "line-through text-neutral-600")}>
                          {p.name || "이름 없음"}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <span className="text-[11px] text-neutral-500 font-mono">
                            {isExcluded ? "제외" : "포함"}
                          </span>
                          <input
                            type="checkbox"
                            disabled={isRolling}
                            checked={!isExcluded}
                            onChange={() => toggleExcludePlayer(p.id)}
                            title={isExcluded ? "추첨 대상에 포함" : "추첨에서 제외"}
                            className="size-3.5 accent-dbd-yellow cursor-pointer"
                          />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>

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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

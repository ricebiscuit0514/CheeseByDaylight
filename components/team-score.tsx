"use client"

import { useEffect, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { cn } from "@/lib/utils"

type Side = "left" | "right"

// wave: y keyframe 배열 — 날아가면서 불씨처럼 위아래 일렁임
// 각 파티클마다 다른 웨이브 패턴으로 랜덤한 느낌 부여
const PARTICLES: { startY: number; travelX: number; wave: number[]; w: number; h: number; delay: number; dur: number }[] = [
  { startY:  2, travelX: 380, wave: [0,  6, -3,  8, -2,  5],  w:  8, h: 1,   delay: 0.00, dur: 0.90 },
  { startY:  8, travelX: 290, wave: [0, -5,  9, -4,  7, -6],  w:  6, h: 0.8, delay: 0.05, dur: 0.75 },
  { startY: 15, travelX: 460, wave: [0,  4, -8,  2, -5,  3],  w:  9, h: 1,   delay: 0.02, dur: 0.95 },
  { startY: 22, travelX: 320, wave: [0, -7,  3, -9,  4, -3],  w:  6, h: 0.8, delay: 0.07, dur: 0.80 },
  { startY: 29, travelX: 540, wave: [0,  8, -4, 11, -6,  7],  w: 10, h: 1,   delay: 0.01, dur: 1.00 },
  { startY: 36, travelX: 360, wave: [0, -3,  7, -5,  9, -4],  w:  7, h: 0.8, delay: 0.06, dur: 0.85 },
  { startY: 43, travelX: 430, wave: [0,  5, -9,  3, -7,  6],  w:  8, h: 1,   delay: 0.03, dur: 0.90 },
  { startY: 50, travelX: 270, wave: [0, -8,  4, -6,  2, -5],  w:  5, h: 0.8, delay: 0.08, dur: 0.72 },
  { startY: 57, travelX: 500, wave: [0,  3, -6,  8, -4,  5],  w:  9, h: 1,   delay: 0.02, dur: 0.95 },
  { startY: 64, travelX: 340, wave: [0, -4,  8, -2,  6, -7],  w:  6, h: 0.8, delay: 0.05, dur: 0.82 },
  { startY: 71, travelX: 450, wave: [0,  7, -3, 10, -5,  4],  w:  8, h: 1,   delay: 0.04, dur: 0.92 },
  { startY: 78, travelX: 300, wave: [0, -6,  2, -8,  3, -4],  w:  6, h: 0.8, delay: 0.07, dur: 0.78 },
  { startY: 85, travelX: 520, wave: [0,  4, -7,  6, -3,  8],  w:  9, h: 1,   delay: 0.01, dur: 0.98 },
  { startY: 92, travelX: 350, wave: [0, -5,  9, -3,  7, -6],  w:  7, h: 0.8, delay: 0.06, dur: 0.83 },
]

function ScoreNumber({ value, side, lit, close, bump = 0 }: { value: number; side: Side; lit: boolean; close: boolean; bump?: number }) {
  const reducedMotionRaw = useReducedMotion()
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  const reducedMotion = mounted ? reducedMotionRaw : false
  const whole = Math.floor(value)
  const hasHalf = value % 1 !== 0
  // 왼팀: 왼쪽(-1), 오른팀: 오른쪽(+1)
  const direction = side === "left" ? -1 : 1

  return (
    <section
      aria-label={`${side === "left" ? "왼쪽" : "오른쪽"} 팀 ${value}점`}
      className={cn("score-sanctum", `score-sanctum-${side}`, lit && "is-lit", close && "is-clutch")}
    >
      <span className="score-energy" aria-hidden="true" />
      <span className="score-scratch" aria-hidden="true" />
      <AnimatePresence>
        {!reducedMotion && (value > 0 || bump > 0) && (
          <motion.span
            key={`burst-${value}-${bump}`}
            className="score-particle-field"
            aria-hidden="true"
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0 } }}
          >
            {PARTICLES.map((particle, index) => (
              <motion.i
                key={index}
                className="score-streak"
                style={{
                  width: particle.w,
                  height: particle.h,
                  top: `${particle.startY}%`,
                  // 왼팀: 오른쪽 끝에서 출발 → 왼쪽으로, 오른팀: 왼쪽 끝에서 출발 → 오른쪽으로
                  [direction === -1 ? "right" : "left"]: 0,
                }}
                initial={{ x: 0, y: 0, opacity: 0, scaleX: 0 }}
                animate={{
                  x: direction * particle.travelX,
                  y: particle.wave,
                  opacity: [0, 1, 0.85, 0],
                  scaleX: [0, 1, 1, 0.3],
                }}
                transition={{
                  duration: particle.dur,
                  delay: particle.delay,
                  ease: [0.1, 0.6, 0.25, 1],
                  y: { duration: particle.dur, ease: "easeInOut" },
                  opacity: { times: [0, 0.1, 0.5, 1] },
                  scaleX:  { times: [0, 0.1, 0.6, 1] },
                }}
              />
            ))}
          </motion.span>
        )}
      </AnimatePresence>
      <span className="score-value-wrap">
        <motion.span
          key={`${whole}-${bump}`}
          className="score-whole"
          initial={reducedMotion ? false : { y: -28, opacity: 0, filter: "blur(10px)", scale: 0.85 }}
          animate={{ y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          {whole}
        </motion.span>
        <AnimatePresence mode="wait">
          {hasHalf && (
            <motion.span
              key={`half-${value}`}
              className="score-half"
              initial={reducedMotion ? false : { y: -20, opacity: 0, filter: "blur(8px)", scale: 0.8 }}
              animate={{ y: 0, opacity: 1, filter: "blur(0px)", scale: 1 }}
              exit={{ y: 12, opacity: 0, filter: "blur(6px)", scale: 0.85, transition: { duration: 0.2 } }}
              transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            >
              .5
            </motion.span>
          )}
        </AnimatePresence>
      </span>
      <motion.span
        key={`wake-${value}-${bump}`}
        className="score-color-wake"
        aria-hidden="true"
        initial={reducedMotion ? false : { x: direction * -30, scaleX: 0.15, opacity: 0 }}
        animate={{ x: direction * 80, scaleX: [0.15, 1.2, 2.0], opacity: [0, 0.75, 0] }}
        transition={{ duration: 0.85, ease: [0.2, 0.75, 0.25, 1] }}
      />
    </section>
  )
}

export function TeamScore({ left, right, orangeLit, blueLit, close, leftBump = 0, rightBump = 0 }: { left: number; right: number; orangeLit: boolean; blueLit: boolean; close: boolean; leftBump?: number; rightBump?: number }) {
  return (
    <div className="versus-stage">
      <ScoreNumber value={left} side="left" lit={orangeLit} close={close} bump={leftBump} />
      <div className="versus-sigil" aria-label="대">
        <span className="versus-line" aria-hidden="true" />
        <span className="versus-label">VS</span>
      </div>
      <ScoreNumber value={right} side="right" lit={blueLit} close={close} bump={rightBump} />
    </div>
  )
}

"use client"

import { useEffect, useRef } from "react"
import { motion, useAnimationControls } from "motion/react"
import { cn } from "@/lib/utils"

interface WinnerOverlayProps {
  winnerName: string | "tie"
  teamColor?: "thomas" | "ada"
  isComeback?: boolean
  isColdGame?: boolean
  onDismiss: () => void
}

export function WinnerOverlay({
  winnerName,
  teamColor,
  isComeback = false,
  isColdGame = false,
  onDismiss,
}: WinnerOverlayProps) {
  const barControls = useAnimationControls()
  const textControls = useAnimationControls()
  const lineControls = useAnimationControls()
  const onDismissRef = useRef(onDismiss)

  useEffect(() => {
    onDismissRef.current = onDismiss
  }, [onDismiss])

  useEffect(() => {
    let cancelled = false

    const wait = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), ms)
      })

    const sequence = async () => {
      if (cancelled) return
      await wait(50)
      if (cancelled) return

      await barControls.start({
        height: ["0px", "4px", "280px"],
        opacity: [0, 1, 1],
        transition: {
          duration: 0.25,
          times: [0, 0.25, 1],
          ease: [0.25, 1, 0.5, 1],
        },
      })
      if (cancelled) return

      const speeds = [0.18, 0.32, 0.38]
      lineControls.start((i) => ({
        x: ["-180%", "280%"],
        skewX: -35,
        opacity: [0, 0.75, 0.75, 0],
        transition: {
          duration: speeds[i % 3],
          delay: i * 0.04,
          ease: "easeOut",
        },
      }))

      await wait(220)
      if (cancelled) return

      await textControls.start({
        x: ["-100vw", "-15px"],
        opacity: [1, 1],
        transition: {
          duration: 0.3,
          ease: [0.16, 1, 0.3, 1],
        },
      })
      if (cancelled) return

      await textControls.start({
        x: ["-15px", "25px"],
        transition: {
          duration: 1.8,
          ease: "linear",
        },
      })
      if (cancelled) return

      const textExitPromise = textControls.start({
        x: ["25px", "100vw"],
        opacity: [1, 0],
        transition: {
          duration: 0.3,
          ease: [0.7, 0, 0.84, 0],
        },
      })

      await wait(180)
      if (cancelled) return

      await lineControls.start((i) => ({
        x: ["-180%", "280%"],
        skewX: -35,
        opacity: [0, 0.75, 0.75, 0],
        transition: {
          duration: speeds[i % 3],
          delay: i * 0.04,
          ease: "easeIn",
        },
      }))

      await textExitPromise
      if (cancelled) return

      await barControls.start({
        height: ["280px", "4px", "0px"],
        opacity: [1, 1, 0],
        transition: {
          duration: 0.25,
          times: [0, 0.65, 1],
          ease: [0.4, 0, 1, 1],
        },
      })
      if (cancelled) return

      onDismissRef.current()
    }

    void sequence().catch((error) => console.error("Animation error:", error))

    return () => {
      cancelled = true
    }
  }, [barControls, lineControls, textControls, winnerName, isComeback, isColdGame])

  const isTie = winnerName === "tie"
  const lineBg = teamColor === "thomas" 
    ? "rgba(249, 115, 22, 0.40)" 
    : teamColor === "ada" 
    ? "rgba(59, 130, 246, 0.40)" 
    : "rgba(255, 255, 255, 0.30)"

  const companionBg = teamColor === "thomas" 
    ? "rgba(249, 115, 22, 0.075)" 
    : teamColor === "ada" 
    ? "rgba(59, 130, 246, 0.075)" 
    : "rgba(255, 255, 255, 0.06)"
  
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden pointer-events-none">
      <motion.div
        animate={barControls}
        initial={{ height: "0px", opacity: 0 }}
        className="absolute w-full bg-black/95 flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden"
      >
        {/* Black bar 높이 전체(100%)를 채우는 진짜 완벽한 평행사변형(Parallelogram) 쉐잎 3개 (먼저 스위프) */}
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            custom={index}
            animate={lineControls}
            initial={{ x: "-180%", opacity: 0, skewX: -35 }}
            className="absolute top-0 h-full pointer-events-none shadow-2xl border-x border-white/40"
            style={{
              width: `${18 + index * 8}%`,
              backgroundColor: lineBg,
            }}
          />
        ))}

        <motion.div
          animate={textControls}
          initial={{ x: "-100vw", opacity: 1 }}
          className="relative z-10 flex flex-col items-center justify-center text-center w-full h-[280px]"
        >
          {/* 글자와 함께 날아와서 체류하고 같이 나가는 동행 평행사변형 쉐잎 3개 (full-height 100% 채움 + 교차 겹침) */}
          <div className="absolute inset-0 flex justify-center items-center pointer-events-none">
            {[
              { base: -220, fromX: -40, toX: 50 },
              { base: -10, fromX: 30, toX: -60 },
              { base: 200, fromX: -50, toX: 40 },
            ].map((item, i) => (
              <motion.div
                key={i}
                initial={{ x: item.base + item.fromX, skewX: -35 }}
                animate={{ x: item.base + item.toX, skewX: -35 }}
                transition={{
                  repeat: Infinity,
                  repeatType: "reverse",
                  duration: 1.8 + i * 0.4,
                  ease: "easeInOut",
                }}
                className="absolute top-0 h-full pointer-events-none border-x border-white/10 shadow-lg"
                style={{
                  width: `${16 + i * 6}%`,
                  backgroundColor: companionBg,
                }}
              />
            ))}
          </div>

          <div className="relative flex flex-col items-center justify-center z-10">
            {/* 메인 텍스트 (이탈릭 적용) */}
            {isTie ? (
               <span 
                  className="text-6xl md:text-8xl font-black italic text-neutral-300 drop-shadow-[0_0_20px_rgba(200,200,200,0.5)]"
                  style={{ fontFamily: "var(--font-godo)", whiteSpace: "nowrap" }}
                >
                  무승부!
                </span>
            ) : (
              <>
                {isColdGame && (
                  <span
                    className="mb-1 text-xl md:text-3xl font-black italic text-dbd-red tracking-widest drop-shadow-[0_0_12px_color-mix(in_oklch,var(--dbd-red),transparent_35%)]"
                    style={{ fontFamily: "var(--font-godo)", fontWeight: 900 }}
                  >
                    콜드게임!
                  </span>
                )}
                {isComeback && (
                  <span
                    className="mb-1 text-xl md:text-3xl font-black italic text-dbd-yellow tracking-widest drop-shadow-[0_0_12px_color-mix(in_oklch,var(--dbd-yellow),transparent_35%)]"
                    style={{ fontFamily: "var(--font-godo)", fontWeight: 900 }}
                  >
                    역전!
                  </span>
                )}
                <span 
                  className="text-6xl md:text-[8rem] font-black italic drop-shadow-[0_0_40px_rgba(0,0,0,0.5)]"
                  style={{ fontFamily: "var(--font-godo)", whiteSpace: "nowrap", letterSpacing: "-0.02em" }}
                >
                  <span className={teamColor === "thomas" ? "text-dbd-orange" : "text-dbd-blue"}>
                    {winnerName}
                  </span>
                  <span className="text-neutral-100">팀 우승!</span>
                </span>
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

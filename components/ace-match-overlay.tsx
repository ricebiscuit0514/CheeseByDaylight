"use client"

import { useEffect, useRef } from "react"
import { motion, useAnimationControls } from "motion/react"
import { cn } from "@/lib/utils"

interface AceMatchOverlayProps {
  winnerTeamName: string
  acePlayerName: string
  teamColor?: "thomas" | "ada"
  onDismiss: () => void
}

export function AceMatchOverlay({
  winnerTeamName,
  acePlayerName,
  teamColor = "thomas",
  onDismiss,
}: AceMatchOverlayProps) {
  const barControls = useAnimationControls()
  const textControls = useAnimationControls()
  const lineControls = useAnimationControls()
  const hasRun = useRef(false)

  useEffect(() => {
    if (hasRun.current) return
    hasRun.current = true

    const sequence = async () => {
      await new Promise((resolve) => setTimeout(resolve, 50))

      // 1. Black bar expands
      await barControls.start({
        height: ["0px", "4px", "280px"],
        opacity: [0, 1, 1],
        transition: {
          duration: 0.25,
          times: [0, 0.25, 1],
          ease: [0.25, 1, 0.5, 1],
        },
      })

      // 2. Full-height parallelograms sweep first
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

      await new Promise((resolve) => setTimeout(resolve, 220))

      // 3. Text flies in
      await textControls.start({
        x: ["-100vw", "-15px"],
        opacity: [1, 1],
        transition: {
          duration: 0.3,
          ease: [0.16, 1, 0.3, 1],
        },
      })

      // 4. Drift slowly across center (1.8s)
      await textControls.start({
        x: ["-15px", "25px"],
        transition: {
          duration: 1.8,
          ease: "linear",
        },
      })

      // 5. Text flies out right
      const textExitPromise = textControls.start({
        x: ["25px", "100vw"],
        opacity: [1, 0],
        transition: {
          duration: 0.3,
          ease: [0.7, 0, 0.84, 0],
        },
      })

      await new Promise((resolve) => setTimeout(resolve, 180))

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

      // 6. Black bar shrinks
      await barControls.start({
        height: ["280px", "4px", "0px"],
        opacity: [1, 1, 0],
        transition: {
          duration: 0.25,
          times: [0, 0.65, 1],
          ease: [0.4, 0, 1, 1],
        },
      })

      onDismiss()
    }

    sequence().catch((err) => console.error("Animation error:", err))
  }, [barControls, textControls, lineControls, onDismiss])

  const lineBg =
    teamColor === "thomas"
      ? "rgba(249, 115, 22, 0.40)"
      : "rgba(59, 130, 246, 0.40)"

  const companionBg =
    teamColor === "thomas"
      ? "rgba(249, 115, 22, 0.075)"
      : "rgba(59, 130, 246, 0.075)"

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-hidden pointer-events-none">
      <motion.div
        animate={barControls}
        initial={{ height: "0px", opacity: 0 }}
        className="absolute w-full bg-black/95 flex items-center justify-center shadow-[0_0_50px_rgba(0,0,0,0.9)] overflow-hidden"
      >
        {/* Sweep Parallelogram shapes */}
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
            <span
              className={cn(
                "text-2xl md:text-4xl font-black italic drop-shadow-[0_0_30px_rgba(0,0,0,0.6)] mb-1",
                teamColor === "thomas" ? "text-dbd-orange" : "text-dbd-blue"
              )}
              style={{ fontFamily: "var(--font-godo)" }}
            >
              {winnerTeamName} 팀의
            </span>
            <span
              className="text-5xl md:text-[6.5rem] font-black italic text-neutral-100 drop-shadow-[0_0_40px_rgba(0,0,0,0.8)]"
              style={{ fontFamily: "var(--font-godo)", whiteSpace: "nowrap" }}
            >
              {acePlayerName} 우승!
            </span>
          </div>
        </motion.div>
      </motion.div>
    </div>
  )
}

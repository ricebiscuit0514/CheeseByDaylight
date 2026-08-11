"use client"

import { useEffect, useState } from "react"
import { motion } from "motion/react"
import { cn } from "@/lib/utils"

export type CoinTossTeam = "thomas" | "ada"

function CoinIcon({ className = "size-4" }: { className?: string }) {
  return (
    <svg className={cn("inline-block shrink-0", className)} viewBox="0 0 24 24" width="16" height="16" fill="none">
      <circle cx="12" cy="12" r="10" fill="url(#coin-gold-grad)" stroke="#D97706" strokeWidth="1" />
      <circle cx="12" cy="12" r="7" fill="none" stroke="#FEF08A" strokeWidth="1.2" opacity="0.85" />
      <defs>
        <linearGradient id="coin-gold-grad" x1="4" y1="4" x2="20" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="50%" stopColor="#EAB308" />
          <stop offset="100%" stopColor="#CA8A04" />
        </linearGradient>
      </defs>
    </svg>
  )
}

export function CoinTossWidget({
  thomasName,
  adaName,
  activeTeam,
  onTossResult,
  thomasDisplayName,
  adaDisplayName,
  disabled = false,
  idleLabel = "선공 결정",
  tossingLabel = "선공 결정 중...",
  resultSuffix = "선공!",
  formatResultLabel,
  idleTitle = "클릭 시 선공 팀을 무작위로 추첨합니다",
  resultTitle = "클릭 시 다시 추첨합니다",
  className,
  variant = "default",
}: {
  thomasName: string
  adaName: string
  activeTeam: CoinTossTeam | null
  onTossResult?: (winner: CoinTossTeam) => void
  thomasDisplayName?: string
  adaDisplayName?: string
  disabled?: boolean
  idleLabel?: string
  tossingLabel?: string
  resultSuffix?: string
  formatResultLabel?: (winner: CoinTossTeam) => string
  idleTitle?: string
  resultTitle?: string
  className?: string
  variant?: "default" | "purple"
}) {
  const [tossing, setTossing] = useState(false)
  const [result, setResult] = useState<CoinTossTeam | null>(activeTeam)

  useEffect(() => {
    setResult(activeTeam)
  }, [activeTeam])

  const handleToss = () => {
    if (tossing || disabled) return
    setTossing(true)
    setResult(null)

    setTimeout(() => {
      const winner: CoinTossTeam = Math.random() < 0.5 ? "thomas" : "ada"
      setResult(winner)
      setTossing(false)
      onTossResult?.(winner)
    }, 1100)
  }

  const getWinnerLabel = (winner: CoinTossTeam) => {
    if (winner === "thomas") {
      return thomasDisplayName || `${thomasName} 팀`
    }
    return adaDisplayName || `${adaName} 팀`
  }

  const resultText = result
    ? formatResultLabel?.(result) ?? `${getWinnerLabel(result)} ${resultSuffix}`
    : null

  const isPurple = variant === "purple"

  return (
    <button
      type="button"
      disabled={tossing || disabled}
      onClick={handleToss}
      title={result ? resultTitle : idleTitle}
      className={cn(
        "group relative flex h-8 min-h-8 max-h-8 items-center justify-center gap-2 rounded-full border px-4 py-0 text-xs font-black leading-none backdrop-blur-md transition-all duration-300 select-none active:scale-95 disabled:cursor-default disabled:opacity-70 disabled:active:scale-100",
        isPurple
          ? tossing
            ? "cursor-pointer border-violet-400 bg-black/90 text-violet-400"
            : result === "thomas"
            ? "cursor-pointer border-dbd-orange bg-black/90 text-dbd-orange hover:brightness-125"
            : result === "ada"
            ? "cursor-pointer border-dbd-blue bg-black/90 text-dbd-blue hover:brightness-125"
            : "cursor-pointer border-violet-500/80 bg-black/85 text-violet-400 hover:border-violet-400 hover:text-violet-300"
          : tossing
          ? "cursor-pointer border-dbd-yellow bg-black/90 text-dbd-yellow"
          : result === "thomas"
          ? "cursor-pointer border-dbd-orange bg-black/90 text-dbd-orange hover:brightness-125"
          : result === "ada"
          ? "cursor-pointer border-dbd-blue bg-black/90 text-dbd-blue hover:brightness-125"
          : "cursor-pointer border-dbd-yellow/70 bg-black/85 text-dbd-yellow hover:border-dbd-yellow hover:bg-black",
        className,
      )}
      style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
    >
      {tossing && (
        <>
          <motion.span
            animate={{ rotateY: [0, 1080] }}
            transition={{ duration: 1.1, ease: "easeInOut" }}
            className="inline-flex items-center justify-center"
          >
            <CoinIcon className="size-4" />
          </motion.span>
          <span className="tracking-widest">{tossingLabel}</span>
        </>
      )}

      {!tossing && result !== null && (
        <>
          {result === "thomas" && (
            <motion.span
              animate={{ x: [-4, 0, -4] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="text-xs font-black leading-none text-dbd-orange"
            >
              ◄
            </motion.span>
          )}
          <span className="tracking-wide">{resultText}</span>
          {result === "ada" && (
            <motion.span
              animate={{ x: [0, 4, 0] }}
              transition={{ repeat: Infinity, duration: 0.8 }}
              className="text-xs font-black leading-none text-dbd-blue"
            >
              ►
            </motion.span>
          )}
        </>
      )}

      {!tossing && result === null && (
        <>
          <span className="inline-flex items-center justify-center transition-transform duration-300 group-hover:rotate-180">
            <CoinIcon className="size-4" />
          </span>
          <span className="tracking-wider">{idleLabel}</span>
        </>
      )}
    </button>
  )
}

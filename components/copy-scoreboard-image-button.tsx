"use client"

import { useEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import { Copy } from "lucide-react"
import { ScoreboardCaptureCard } from "@/components/scoreboard-capture-card"
import type { Player } from "@/components/player-row"
import type { CaptureMatchResult } from "@/lib/capture-match-result"
import type { AceRoundLogEntry } from "@/lib/ace-round-log"
import { copyScoreboardImage } from "@/lib/copy-scoreboard-image"
import { cn } from "@/lib/utils"

type CopyScoreboardImageButtonProps = {
  thomas: Player[]
  ada: Player[]
  thomasName: string
  adaName: string
  leftScore: number
  rightScore: number
  matchResult?: CaptureMatchResult | null
  aceRoundLog?: AceRoundLogEntry[]
  mainFirstAttackerId?: string | null
  className?: string
}

export function CopyScoreboardImageButton({
  thomas,
  ada,
  thomasName,
  adaName,
  leftScore,
  rightScore,
  matchResult = null,
  aceRoundLog = [],
  mainFirstAttackerId = null,
  className,
}: CopyScoreboardImageButtonProps) {
  const captureRef = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  const [status, setStatus] = useState<"idle" | "copying" | "copied" | "error">(
    "idle",
  )
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleCopy = async () => {
    const target = captureRef.current
    if (!target || status === "copying") return

    setStatus("copying")
    setErrorMessage(null)

    try {
      await document.fonts.ready
      await document.fonts.load("700 17px 'Godo'")
      await document.fonts.load("700 56px 'Aldrich'")
      await copyScoreboardImage(target)
      setStatus("copied")
      window.setTimeout(() => setStatus("idle"), 1500)
    } catch (error) {
      setStatus("error")
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "이미지 복사에 실패했습니다.",
      )
      window.setTimeout(() => {
        setStatus("idle")
        setErrorMessage(null)
      }, 2500)
    }
  }

  const label =
    status === "copying"
      ? "복사 중..."
      : status === "copied"
        ? "복사 완료!"
        : status === "error"
          ? "복사 실패"
          : "경기 기록 캡쳐"

  const captureHost = (
    <div
      aria-hidden
      style={{
        position: "fixed",
        left: -20000,
        top: 0,
        width: 880,
        opacity: 0,
        pointerEvents: "none",
        overflow: "hidden",
        zIndex: -1,
      }}
    >
      <ScoreboardCaptureCard
        ref={captureRef}
        thomas={thomas}
        ada={ada}
        thomasName={thomasName}
        adaName={adaName}
        leftScore={leftScore}
        rightScore={rightScore}
        matchResult={matchResult}
        aceRoundLog={aceRoundLog}
        mainFirstAttackerId={mainFirstAttackerId}
      />
    </div>
  )

  return (
    <>
      {mounted ? createPortal(captureHost, document.body) : null}

      <div className={cn("flex w-full flex-col gap-1", className)}>
        <button
          type="button"
          onClick={() => void handleCopy()}
          disabled={status === "copying"}
          className="scoreboard-utility-btn flex items-center justify-center gap-2 border border-neutral-600/80 bg-black/80 text-neutral-300 shadow-lg hover:border-neutral-400 hover:text-white disabled:cursor-wait disabled:opacity-60"
          style={{ fontFamily: "var(--font-godo)" }}
        >
          <Copy size={14} />
          <span>{label}</span>
        </button>
        {errorMessage && (
          <p className="max-w-56 text-right text-[10px] leading-relaxed text-red-400">
            {errorMessage}
          </p>
        )}
      </div>
    </>
  )
}

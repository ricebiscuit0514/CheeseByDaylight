"use client"

import { useEffect, useState } from "react"
import { X } from "lucide-react"
import { CoinTossWidget, type CoinTossTeam } from "@/components/coin-toss-widget"
import { cn } from "@/lib/utils"

const NAME_INPUT_WIDTH = "w-[9rem]"

type AuctionOrderModalProps = {
  open: boolean
  thomasPlayerName: string
  adaPlayerName: string
  auctionWinner: CoinTossTeam | null
  onClose: () => void
  onThomasPlayerNameChange: (name: string) => void
  onAdaPlayerNameChange: (name: string) => void
  onAuctionResult: (winner: CoinTossTeam, thomasName: string, adaName: string) => void
}

export function AuctionOrderModal({
  open,
  thomasPlayerName,
  adaPlayerName,
  auctionWinner,
  onClose,
  onThomasPlayerNameChange,
  onAdaPlayerNameChange,
  onAuctionResult,
}: AuctionOrderModalProps) {
  const [localWinner, setLocalWinner] = useState<CoinTossTeam | null>(auctionWinner)

  useEffect(() => {
    setLocalWinner(auctionWinner)
  }, [auctionWinner, open])

  if (!open) return null

  const handleTossResult = (winner: CoinTossTeam) => {
    setLocalWinner(winner)
    onAuctionResult(winner, thomasPlayerName, adaPlayerName)
  }

  const winnerName = (winner: CoinTossTeam) => {
    const name = winner === "thomas" ? thomasPlayerName.trim() : adaPlayerName.trim()
    return name || (winner === "thomas" ? "왼쪽" : "오른쪽")
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="relative w-[30rem] max-w-[calc(100vw-2rem)] rounded-md border border-neutral-700/80 bg-neutral-950 px-4 py-3 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="경매순서 창 닫기"
          className="absolute -right-2 -top-2 rounded-full border border-neutral-600 bg-neutral-900 p-1 text-neutral-400 transition-colors hover:border-neutral-400 hover:text-white"
        >
          <X size={14} />
        </button>

        <div className="grid grid-cols-[9rem_minmax(0,1fr)_9rem] items-center gap-3">
          <input
            value={thomasPlayerName}
            onChange={(event) => onThomasPlayerNameChange(event.target.value)}
            placeholder="이름을 입력해주세요..."
            className={cn(
              NAME_INPUT_WIDTH,
              "shrink-0 rounded border bg-transparent px-2.5 py-1.5 text-sm text-dbd-orange outline-none transition-[border-color,color,box-shadow]",
              localWinner === "thomas"
                ? "border-dbd-yellow bg-dbd-yellow/10 text-dbd-yellow shadow-[0_0_12px_color-mix(in_oklch,var(--dbd-yellow),transparent_55%)]"
                : "border-dbd-orange/40 focus:border-dbd-orange",
            )}
            style={{ fontFamily: "var(--font-godo)" }}
          />

          <div className="flex min-w-0 justify-center overflow-hidden">
            <CoinTossWidget
              thomasName=""
              adaName=""
              activeTeam={localWinner}
              variant="purple"
              thomasDisplayName={winnerName("thomas")}
              adaDisplayName={winnerName("ada")}
              idleLabel="경매 순서 결정"
              tossingLabel="결정 중..."
              formatResultLabel={() => "선착!"}
              idleTitle="클릭 시 경매 순서를 무작위로 정합니다"
              resultTitle="클릭 시 다시 추첨합니다"
              className="shrink-0 whitespace-nowrap px-4 text-xs"
              onTossResult={handleTossResult}
            />
          </div>

          <input
            value={adaPlayerName}
            onChange={(event) => onAdaPlayerNameChange(event.target.value)}
            placeholder="이름을 입력해주세요..."
            className={cn(
              NAME_INPUT_WIDTH,
              "shrink-0 rounded border bg-transparent px-2.5 py-1.5 text-right text-sm text-dbd-blue outline-none transition-[border-color,color,box-shadow]",
              localWinner === "ada"
                ? "border-dbd-yellow bg-dbd-yellow/10 text-dbd-yellow shadow-[0_0_12px_color-mix(in_oklch,var(--dbd-yellow),transparent_55%)]"
                : "border-dbd-blue/40 focus:border-dbd-blue",
            )}
            style={{ fontFamily: "var(--font-godo)" }}
          />
        </div>
      </div>
    </div>
  )
}

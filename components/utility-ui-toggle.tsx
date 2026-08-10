"use client"

import { cn } from "@/lib/utils"

type UtilityUiToggleProps = {
  hidden: boolean
  onToggle: () => void
}

export function UtilityUiToggle({ hidden, onToggle }: UtilityUiToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={hidden}
      className={cn(
        "scoreboard-utility-btn scoreboard-utility-btn-neutral",
        hidden &&
          "border-neutral-600/50 bg-black/35 text-neutral-400 opacity-45 hover:opacity-70 hover:text-neutral-300 hover:border-neutral-500",
      )}
      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
    >
      {hidden ? "UI 켜기" : "UI 끄기"}
    </button>
  )
}

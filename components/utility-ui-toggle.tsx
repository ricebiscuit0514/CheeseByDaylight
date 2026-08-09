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
        "rounded border border-neutral-600 bg-black/50 px-3 py-1 text-sm text-neutral-300 backdrop-blur-sm transition-all hover:border-neutral-400 hover:text-white",
        hidden &&
          "border-neutral-600/50 bg-black/35 text-neutral-400 opacity-45 hover:opacity-70",
      )}
      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
    >
      {hidden ? "UI 켜기" : "UI 끄기"}
    </button>
  )
}

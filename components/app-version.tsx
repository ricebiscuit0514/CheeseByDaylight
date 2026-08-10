import { cn } from "@/lib/utils"
import { APP_VERSION_LABEL } from "@/lib/app-version"

type AppVersionProps = {
  className?: string
}

export function AppVersion({ className }: AppVersionProps) {
  return (
    <span
      className={cn(
        "text-[10px] sm:text-[11px] text-neutral-400/90 tracking-wider",
        className,
      )}
      style={{ fontFamily: "var(--font-s-core)", fontWeight: 300 }}
    >
      {APP_VERSION_LABEL}
    </span>
  )
}

export function AppVersionCorner() {
  return (
    <AppVersion className="pointer-events-none fixed top-1.5 right-2 z-50 select-none text-[10px] text-neutral-500/80 sm:top-2 sm:right-2.5 sm:text-[11px] sm:text-neutral-400/90" />
  )
}

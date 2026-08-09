import { cn } from "@/lib/utils"
import { APP_VERSION_LABEL } from "@/lib/app-version"

type AppVersionProps = {
  className?: string
}

export function AppVersion({ className }: AppVersionProps) {
  return (
    <span
      className={cn(
        "text-xs sm:text-sm text-neutral-400/90 font-mono tracking-wider",
        className,
      )}
    >
      {APP_VERSION_LABEL}
    </span>
  )
}

export function AppVersionCorner() {
  return (
    <AppVersion className="pointer-events-none fixed top-1.5 right-2 z-50 select-none text-xs text-neutral-500/80 sm:top-2 sm:right-2.5 sm:text-sm sm:text-neutral-400/90" />
  )
}

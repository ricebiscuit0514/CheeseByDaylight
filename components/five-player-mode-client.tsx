"use client"

import dynamic from "next/dynamic"

const FivePlayerMode = dynamic(
  () => import("@/components/five-player-mode").then((m) => m.FivePlayerMode),
  { ssr: false }
)

export function FivePlayerModeClient() {
  return <FivePlayerMode />
}

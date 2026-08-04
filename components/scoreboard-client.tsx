"use client"

import dynamic from "next/dynamic"

const Scoreboard = dynamic(
  () => import("@/components/scoreboard").then((m) => m.Scoreboard),
  { ssr: false }
)

export function ScoreboardClient() {
  return <Scoreboard />
}

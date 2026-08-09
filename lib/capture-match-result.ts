export type CaptureMatchResult = {
  label: string
  alignTeam: "thomas" | "ada" | "center"
}

type BuildCaptureMatchResultInput = {
  cold:
    | { status: "none" | "warning" }
    | { status: "cold"; name: string }
    | {
        status: "gameover"
        winnerName: string | "tie"
        isCold?: boolean
      }
  thomasName: string
  adaName: string
  isComebackWin: boolean
  isAceMatchMode: boolean
  bothAcePlayed: boolean
  aceWinnerTeam: "thomas" | "ada" | null
  aceThomasId: string | null
  aceAdaId: string | null
  thomas: { id: string; kills: number }[]
  ada: { id: string; kills: number }[]
}

function winnerTeamFromName(
  winnerName: string,
  thomasName: string,
  adaName: string,
): "thomas" | "ada" | "center" {
  if (winnerName === thomasName) return "thomas"
  if (winnerName === adaName) return "ada"
  return "center"
}

export function buildCaptureMatchResult(
  input: BuildCaptureMatchResultInput,
): CaptureMatchResult | null {
  const {
    cold,
    thomasName,
    adaName,
    isComebackWin,
    isAceMatchMode,
    bothAcePlayed,
    aceWinnerTeam,
    aceThomasId,
    aceAdaId,
    thomas,
    ada,
  } = input

  if (cold.status === "cold") {
    const alignTeam = cold.name === thomasName ? "ada" : "thomas"
    return { label: "콜드게임으로 우승", alignTeam }
  }

  if (cold.status !== "gameover") return null
  if (isAceMatchMode && !bothAcePlayed) return null

  if (isAceMatchMode) {
    const tAce = thomas.find((player) => player.id === aceThomasId)
    const aAce = ada.find((player) => player.id === aceAdaId)
    if (tAce && aAce && tAce.kills === aAce.kills) {
      return { label: "무승부", alignTeam: "center" }
    }
    const alignTeam =
      tAce && aAce && tAce.kills > aAce.kills ? "thomas" : "ada"
    return { label: "에이스 결정전 승리", alignTeam }
  }

  if (aceWinnerTeam) {
    return { label: "에이스 결정전 승리", alignTeam: aceWinnerTeam }
  }

  if (cold.winnerName === "tie") {
    return { label: "무승부", alignTeam: "center" }
  }

  const alignTeam = winnerTeamFromName(cold.winnerName, thomasName, adaName)

  if (cold.isCold) {
    return { label: "콜드게임으로 우승", alignTeam }
  }

  if (isComebackWin) {
    return { label: "역전승", alignTeam }
  }

  return { label: "우승", alignTeam }
}

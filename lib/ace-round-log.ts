export type AceRoundOutcome = "tie" | "thomas" | "ada"

export type AceRoundLogEntry = {
  thomasPlayerName: string
  adaPlayerName: string
  outcome: AceRoundOutcome
  thomasKills: number
  adaKills: number
  firstAttackerTeam?: "thomas" | "ada"
  key?: string
}

export const MAX_ACE_ROUND_LOG = 20

export function createAceRoundLogEntry(
  thomasPlayer: { name?: string; kills: number },
  adaPlayer: { name?: string; kills: number },
  outcome: AceRoundOutcome,
  firstAttackerTeam?: "thomas" | "ada",
): AceRoundLogEntry {
  return {
    thomasPlayerName: (thomasPlayer.name ?? "").trim() || "이름 없음",
    adaPlayerName: (adaPlayer.name ?? "").trim() || "이름 없음",
    outcome,
    thomasKills: thomasPlayer.kills,
    adaKills: adaPlayer.kills,
    ...(firstAttackerTeam ? { firstAttackerTeam } : {}),
  }
}

export function countAceRoundWins(log: AceRoundLogEntry[]) {
  let thomas = 0
  let ada = 0
  for (const entry of log) {
    if (entry.outcome === "thomas") thomas += 1
    else if (entry.outcome === "ada") ada += 1
  }
  return { thomas, ada }
}

export type AceRoundCaptureBlock = {
  roundNumber: number
  entry: AceRoundLogEntry
}

export function buildAceRoundCaptureBlocks(
  log: AceRoundLogEntry[],
): AceRoundCaptureBlock[] {
  return log.map((entry, index) => ({
    roundNumber: index + 1,
    entry,
  }))
}

export function formatAceRoundScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export function isAceRoundOutcome(value: unknown): value is AceRoundOutcome {
  return value === "tie" || value === "thomas" || value === "ada"
}

export function isAceRoundLogEntry(value: unknown): value is AceRoundLogEntry {
  if (!value || typeof value !== "object") return false
  const entry = value as Partial<AceRoundLogEntry>
  return (
    typeof entry.thomasPlayerName === "string" &&
    entry.thomasPlayerName.length <= 40 &&
    typeof entry.adaPlayerName === "string" &&
    entry.adaPlayerName.length <= 40 &&
    isAceRoundOutcome(entry.outcome) &&
    (entry.thomasKills === undefined ||
      typeof entry.thomasKills === "number") &&
    (entry.adaKills === undefined || typeof entry.adaKills === "number") &&
    (entry.key === undefined ||
      (typeof entry.key === "string" && entry.key.length <= 120)) &&
    (entry.firstAttackerTeam === undefined ||
      entry.firstAttackerTeam === "thomas" ||
      entry.firstAttackerTeam === "ada")
  )
}

export function normalizeAceRoundLog(value: unknown): AceRoundLogEntry[] {
  if (!Array.isArray(value)) return []
  return value
    .filter(isAceRoundLogEntry)
    .slice(0, MAX_ACE_ROUND_LOG)
    .map((entry) => ({
      ...entry,
      thomasKills: entry.thomasKills ?? 0,
      adaKills: entry.adaKills ?? 0,
    }))
}

export function buildAceRoundLogKey(
  thomasId: string,
  adaId: string,
  thomasKills: number,
  adaKills: number,
) {
  return `${thomasId}:${adaId}:${thomasKills}:${adaKills}`
}

export function appendAceRoundLogEntry(
  previous: AceRoundLogEntry[],
  roundKey: string,
  entry: Omit<AceRoundLogEntry, "key">,
): AceRoundLogEntry[] {
  if (previous.some((item) => item.key === roundKey)) return previous
  if (previous.length >= MAX_ACE_ROUND_LOG) return previous
  return [...previous, { ...entry, key: roundKey }]
}

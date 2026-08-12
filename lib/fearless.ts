import {
  KILLERS,
  isKillerId,
  type KillerDefinition,
  type KillerId,
} from "./killer-catalog"

export const MAX_FEARLESS_PICKS = 4
export const MAX_FOUR_V_FOUR_FEARLESS_PICKS = 5

const FEARLESS_PICK_ORDINALS = [
  "첫 번째",
  "두 번째",
  "세 번째",
  "네 번째",
  "다섯 번째",
] as const

/** Human-readable fearless pick slot label (e.g. "첫 번째 살인마 선택"). */
export function formatFearlessPickSlotLabel(slotIndex: number | null): string {
  if (slotIndex === null) return "새 살인마 선택"
  const ordinal = FEARLESS_PICK_ORDINALS[slotIndex]
  return ordinal ? `${ordinal} 살인마 선택` : `${slotIndex + 1}번째 살인마 선택`
}

export type FearlessFilterMode = "hard" | "soft" | "personal"
export type Team = "thomas" | "ada"

export type KillerPick = {
  killerId: string
  playerName: string
}

/**
 * The player fields used by fearless mode. Full scoreboard Player objects are
 * structurally compatible, while this module remains independent from the UI.
 */
export type FearlessPlayer = {
  id: string
  name: string
  killerPicks?: KillerPick[]
}

export type PickEntry = {
  killerId: string
  playerId: string
  playerName: string
  team: Team
  slotIndex: number
}

export type FearlessFilterContext = {
  team?: Team
  playerId?: string
  /** 1v4: soft filters by player instead of team. */
  soloMode?: boolean
}

export type PickerCellState = {
  isBanned: boolean
  visiblePicks: PickEntry[]
}

export type FearlessFilledRowSlot = {
  kind: "filled"
  slotIndex: number
  killerId: string
}

export type FearlessEmptyRowSlot = {
  kind: "empty"
  slotIndex: number
  killerId: null
  /** True for the next open pick slot; false for reserved placeholders. */
  actionable: boolean
  /** Shown once previous slots are filled. */
  visible: boolean
}

export type FearlessRowSlot = FearlessFilledRowSlot | FearlessEmptyRowSlot

export type FearlessKillerSearchItem = Pick<
  KillerDefinition,
  "id" | "englishName" | "koreanName" | "aliases"
>

function isKillerPickRecord(value: unknown): value is KillerPick {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as KillerPick).killerId === "string" &&
    typeof (value as KillerPick).playerName === "string"
  )
}

/** Normalizes legacy string[] or object[] picks into KillerPick[]. */
export function normalizeKillerPicks(
  picks: unknown,
  fallbackName: string,
): KillerPick[] {
  if (!Array.isArray(picks)) return []

  const normalized: KillerPick[] = []
  const seen = new Set<string>()

  for (const entry of picks) {
    if (typeof entry === "string" && isKillerId(entry) && !seen.has(entry)) {
      seen.add(entry)
      normalized.push({ killerId: entry, playerName: fallbackName })
      continue
    }
    if (
      isKillerPickRecord(entry) &&
      isKillerId(entry.killerId) &&
      !seen.has(entry.killerId)
    ) {
      seen.add(entry.killerId)
      normalized.push({
        killerId: entry.killerId,
        playerName: entry.playerName.slice(0, 40),
      })
    }
  }

  return normalized
}

/** Extracts killer IDs from pick records for slot UI rendering. */
export function killerIdsFromPicks(
  picks: readonly KillerPick[] | undefined,
): string[] {
  return (picks ?? []).map((pick) => pick.killerId)
}

function entriesForTeam(
  players: readonly FearlessPlayer[],
  team: Team,
): PickEntry[] {
  return players.flatMap((player) =>
    (player.killerPicks ?? []).map((pick, slotIndex) => ({
      killerId: pick.killerId,
      playerId: player.id,
      playerName: pick.playerName,
      team,
      slotIndex,
    })),
  )
}

/** Flattens Thomas first, then Ada, preserving player and pick order. */
export function flattenFearlessPicks(
  thomas: readonly FearlessPlayer[],
  ada: readonly FearlessPlayer[],
): PickEntry[] {
  return [
    ...entriesForTeam(thomas, "thomas"),
    ...entriesForTeam(ada, "ada"),
  ]
}

export function filterVisiblePicks(
  entries: readonly PickEntry[],
  mode: FearlessFilterMode,
  context: FearlessFilterContext = {},
): PickEntry[] {
  if (mode === "hard") return [...entries]
  if (mode === "soft") {
    if (context.soloMode) {
      return context.playerId
        ? entries.filter((entry) => entry.playerId === context.playerId)
        : []
    }
    return context.team
      ? entries.filter((entry) => entry.team === context.team)
      : []
  }
  return context.playerId
    ? entries.filter((entry) => entry.playerId === context.playerId)
    : []
}

/**
 * Ban state is derived independently from pick filtering, so a killer may be
 * both banned and visibly picked.
 */
export function getPickerCellState(
  killerId: string,
  visiblePicks: readonly PickEntry[],
  killerBans: readonly string[],
): PickerCellState {
  return {
    isBanned: killerBans.includes(killerId),
    visiblePicks: visiblePicks.filter((entry) => entry.killerId === killerId),
  }
}

/**
 * True when this player already owns the killer in another slot.
 * Different players may still share the same killer.
 */
export function playerOwnsKillerPick(
  player: FearlessPlayer,
  killerId: string,
  exceptSlotIndex: number | null = null,
): boolean {
  const picks = player.killerPicks ?? []
  return picks.some(
    (pick, index) =>
      pick.killerId === killerId &&
      (exceptSlotIndex === null || index !== exceptSlotIndex),
  )
}

/**
 * Appends when slotIndex is null and replaces an existing pick otherwise.
 * Invalid IDs/indices, appends beyond the pick limit, and same-player
 * duplicate killers are no-ops. Cross-player duplicates remain allowed.
 */
export function setPlayerKillerPick<T extends FearlessPlayer>(
  player: T,
  killerId: string,
  slotIndex: number | null,
  maxPicks: number = MAX_FEARLESS_PICKS,
  playerName: string = player.name,
): T {
  if (!isKillerId(killerId)) return player

  const picks = player.killerPicks ?? []
  const pickLimit = Math.max(1, maxPicks)
  const storedName = playerName.slice(0, 40)
  const newPick: KillerPick = { killerId, playerName: storedName }

  if (slotIndex === null || slotIndex === picks.length) {
    if (picks.length >= pickLimit) return player
    if (playerOwnsKillerPick(player, killerId)) return player
    return { ...player, killerPicks: [...picks, newPick] }
  }

  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= picks.length
  ) {
    return player
  }

  if (picks[slotIndex]?.killerId === killerId) return player
  if (playerOwnsKillerPick(player, killerId, slotIndex)) return player

  const nextPicks = [...picks]
  nextPicks[slotIndex] = newPick
  return { ...player, killerPicks: nextPicks }
}

/** Removes exactly one existing slot; invalid indices are no-ops. */
export function cancelPlayerKillerPick<T extends FearlessPlayer>(
  player: T,
  slotIndex: number,
): T {
  const picks = player.killerPicks ?? []
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= picks.length
  ) {
    return player
  }

  const nextPicks = [...picks]
  nextPicks.splice(slotIndex, 1)
  return {
    ...player,
    ...(nextPicks.length > 0
      ? { killerPicks: nextPicks }
      : { killerPicks: [] }),
  }
}

/**
 * Toggles a catalog killer and also normalizes the result to unique catalog
 * IDs. Existing order is preserved.
 */
export function toggleKillerBan(
  killerBans: readonly string[],
  killerId: string,
): KillerId[] {
  const normalized = [...new Set(killerBans.filter(isKillerId))]
  if (!isKillerId(killerId)) return normalized
  if (normalized.includes(killerId)) {
    return normalized.filter((id) => id !== killerId)
  }
  return [...normalized, killerId]
}

function isOrphanPickOwner(
  player: FearlessPlayer,
  committedName: string,
): boolean {
  const picks = player.killerPicks ?? []
  if (picks.length === 0) return false
  if (player.name.trim()) return false
  return picks.some((pick) => pick.playerName.trim() === committedName)
}

function shouldSwapWithActiveDuplicate(
  target: FearlessPlayer,
  committedName: string,
): boolean {
  const picks = target.killerPicks ?? []
  if (picks.length === 0) return false
  return picks.some((pick) => pick.playerName.trim() !== committedName)
}

function swapPlayerKillerRecords<T extends FearlessPlayer>(
  roster: readonly T[],
  primaryPlayerId: string,
  partnerPlayerId: string,
  partnerName: string,
): T[] {
  const primary = roster.find((player) => player.id === primaryPlayerId)
  const partner = roster.find((player) => player.id === partnerPlayerId)
  if (!primary || !partner) return [...roster]

  const primaryPicks = primary.killerPicks ?? []
  const partnerPicks = partner.killerPicks ?? []

  return roster.map((player) => {
    if (player.id === primaryPlayerId) {
      return { ...player, killerPicks: [...partnerPicks] }
    }
    if (player.id === partnerPlayerId) {
      return { ...player, killerPicks: [...primaryPicks], name: partnerName }
    }
    return player
  })
}

/**
 * When a name is cleared, move picks to another slot that already owns that name.
 */
function migrateKillerPicksOnNameClear<T extends FearlessPlayer>(
  roster: readonly T[],
  clearedPlayerId: string,
): T[] {
  const source = roster.find((player) => player.id === clearedPlayerId)
  if (!source) return [...roster]

  const picks = source.killerPicks ?? []
  if (picks.length === 0) return [...roster]

  const destination = roster.find(
    (player) =>
      player.id !== clearedPlayerId &&
      player.name.trim() &&
      picks.some((pick) => pick.playerName.trim() === player.name.trim()),
  )
  if (!destination) return [...roster]

  return swapPlayerKillerRecords(roster, destination.id, clearedPlayerId, "")
}

/**
 * On name commit, swaps killer picks between the target slot and an orphan
 * slot (empty name, picks tagged with the committed name) elsewhere in roster.
 * Clearing a name moves picks to a slot that already has the same name.
 * The displaced name on the target slot moves to the partner slot with its picks.
 */
export function migrateKillerPicksOnNameCommit<T extends FearlessPlayer>(
  roster: readonly T[],
  targetPlayerId: string,
  committedName: string,
): T[] {
  const trimmed = committedName.trim()
  if (!trimmed) {
    return migrateKillerPicksOnNameClear(roster, targetPlayerId)
  }

  const target = roster.find((player) => player.id === targetPlayerId)
  if (!target) return [...roster]

  const orphan = roster.find(
    (player) =>
      player.id !== targetPlayerId && isOrphanPickOwner(player, trimmed),
  )
  if (orphan) {
    return swapPlayerKillerRecords(
      roster,
      targetPlayerId,
      orphan.id,
      target.name,
    )
  }

  const activeDuplicate = roster.find(
    (player) =>
      player.id !== targetPlayerId && player.name.trim() === trimmed,
  )
  if (activeDuplicate && shouldSwapWithActiveDuplicate(target, trimmed)) {
    return swapPlayerKillerRecords(
      roster,
      targetPlayerId,
      activeDuplicate.id,
      "",
    )
  }

  return [...roster]
}

const KOREAN_INITIALS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const

const KOREAN_JUNG = [
  "ㅏ",
  "ㅐ",
  "ㅑ",
  "ㅒ",
  "ㅓ",
  "ㅔ",
  "ㅕ",
  "ㅖ",
  "ㅗ",
  "ㅘ",
  "ㅙ",
  "ㅚ",
  "ㅛ",
  "ㅜ",
  "ㅝ",
  "ㅞ",
  "ㅟ",
  "ㅠ",
  "ㅡ",
  "ㅢ",
  "ㅣ",
] as const

const KOREAN_JONG = [
  "",
  "ㄱ",
  "ㄲ",
  "ㄳ",
  "ㄴ",
  "ㄵ",
  "ㄶ",
  "ㄷ",
  "ㄹ",
  "ㄺ",
  "ㄻ",
  "ㄼ",
  "ㄽ",
  "ㄾ",
  "ㄿ",
  "ㅀ",
  "ㅁ",
  "ㅂ",
  "ㅄ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const

const SEARCH_WHITESPACE_RE =
  /[\s\u00A0\u1680\u2000-\u200B\u202F\u205F\u3000\uFEFF]+/g

/** Removes whitespace so "착한 아이" and "착한아이" match the same query. */
export function stripSearchWhitespace(value: string): string {
  return value.replace(SEARCH_WHITESPACE_RE, "")
}

/**
 * Removes spacing/punctuation so differently formatted names compare equally.
 * NFC deliberately preserves compatibility jamo such as ㄱ used in queries.
 */
export function normalizeFearlessSearchText(value: string): string {
  return stripSearchWhitespace(
    value.trim().toLowerCase().normalize("NFC"),
  ).replace(/[\p{P}\p{S}]+/gu, "")
}

/** Decomposes Hangul into jamo so IME states like "너ㅅ" still match "너스". */
export function hangulToSearchJamo(value: string): string {
  let jamo = ""
  for (const character of normalizeFearlessSearchText(value)) {
    const codePoint = character.charCodeAt(0)
    if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
      const base = codePoint - 0xac00
      const cho = Math.floor(base / 588)
      const jung = Math.floor((base % 588) / 28)
      const jong = base % 28
      jamo += KOREAN_INITIALS[cho] + KOREAN_JUNG[jung] + KOREAN_JONG[jong]
      continue
    }
    if (/^[ㄱ-ㅎㅏ-ㅣ]$/.test(character)) {
      jamo += character
      continue
    }
    jamo += character
  }
  return jamo
}

function killerMatchesQuery(
  killer: FearlessKillerSearchItem,
  normalizedQuery: string,
  jamoQuery: string,
  initialsQuery: boolean,
): boolean {
  const searchableValues = [
    killer.id,
    killer.englishName,
    killer.koreanName,
    ...killer.aliases,
  ]

  if (
    searchableValues.some((value) => {
      const normalizedValue = normalizeFearlessSearchText(value)
      if (normalizedValue.includes(normalizedQuery)) return true
      if (jamoQuery && hangulToSearchJamo(value).includes(jamoQuery)) return true
      return false
    })
  ) {
    return true
  }

  return (
    initialsQuery &&
    getKoreanInitials(killer.koreanName).includes(normalizedQuery)
  )
}

export function getKoreanInitials(value: string): string {
  let initials = ""
  for (const character of normalizeFearlessSearchText(value)) {
    const codePoint = character.charCodeAt(0)
    if (codePoint >= 0xac00 && codePoint <= 0xd7a3) {
      initials += KOREAN_INITIALS[Math.floor((codePoint - 0xac00) / 588)]
    } else if (/^[ㄱ-ㅎ]$/.test(character)) {
      initials += character
    }
  }
  return initials
}

function isInitialsQuery(query: string): boolean {
  return query.length > 0 && /^[ㄱ-ㅎ]+$/.test(query)
}

export function searchKillers(query: string): KillerDefinition[]
export function searchKillers<T extends FearlessKillerSearchItem>(
  query: string,
  catalog: readonly T[],
): T[]
export function searchKillers(
  query: string,
  catalog: readonly FearlessKillerSearchItem[] = KILLERS,
): FearlessKillerSearchItem[] {
  const normalizedQuery = normalizeFearlessSearchText(query)
  if (!normalizedQuery) return [...catalog]

  const jamoQuery = hangulToSearchJamo(query)
  const initialsQuery = isInitialsQuery(normalizedQuery)
  return catalog.filter((killer) =>
    killerMatchesQuery(killer, normalizedQuery, jamoQuery, initialsQuery),
  )
}

function isPickArray(
  value: FearlessPlayer | readonly KillerPick[] | readonly string[],
): value is readonly KillerPick[] | readonly string[] {
  return Array.isArray(value)
}

/**
 * Returns row slots. Filled slots are always visible; empty slots stay hidden
 * until the previous slot is filled, then the next empty slot is revealed.
 */
export function getFearlessRowSlots(
  playerOrPicks: FearlessPlayer | readonly KillerPick[] | readonly string[],
  maxSlots: number = MAX_FEARLESS_PICKS,
): FearlessRowSlot[] {
  const picks: readonly string[] = isPickArray(playerOrPicks)
    ? playerOrPicks.map((entry) =>
        typeof entry === "string" ? entry : entry.killerId,
      )
    : killerIdsFromPicks(playerOrPicks.killerPicks)
  const slotCount = Math.max(1, maxSlots)

  return Array.from({ length: slotCount }, (_, slotIndex) => {
    const killerId = picks[slotIndex]
    if (killerId) {
      return {
        kind: "filled" as const,
        slotIndex,
        killerId,
      }
    }

    return {
      kind: "empty" as const,
      slotIndex,
      killerId: null,
      actionable: slotIndex === picks.length,
      visible: slotIndex <= picks.length,
    }
  })
}

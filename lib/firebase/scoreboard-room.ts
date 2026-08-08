"use client"

import type { Player } from "@/components/player-row"
import type { AceModalStep, AceSlotSpinPlan } from "@/lib/ace-modal-sync"
import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  serverTimestamp,
  set,
  update,
  type Database,
  type Unsubscribe,
} from "firebase/database"

export const ROOM_TTL_MS = 60 * 60 * 1000
export const HOST_DISCONNECT_GRACE_MS = 60 * 60 * 1000
export const HOST_SESSION_KEY = "dbd-scoreboard-host-room-v1"
export const VIEWER_SESSION_KEY = "dbd-scoreboard-viewer-room-v1"
export const MODE_SWITCH_SESSION_KEY = "dbd-sync-mode-switch"

export type AceSyncState = {
  isActive: boolean
  hasCompleted: boolean
  thomasId: string | null
  adaId: string | null
  thomasBackup: Player | null
  adaBackup: Player | null
  firstAttackerBackup: string | null
  winnerTeam: "thomas" | "ada" | null
  winnersMap: Record<string, "win" | "lose">
  showProceedButton: boolean
  showRematchPrompt: boolean
  setupStep: AceModalStep
  setupSelectedThomasId: string | null
  setupSelectedAdaId: string | null
  setupSlotThomasIdx: number
  setupSlotAdaIdx: number
  setupSlotRolling: boolean
  setupSlotFinished: boolean
  setupSlotExcludedIds: string[]
  setupSlotSpinToken: number
  setupSlotSpinPlan: AceSlotSpinPlan | null
}

export const CLOSED_ACE_SETUP: Pick<
  AceSyncState,
  | "setupStep"
  | "setupSelectedThomasId"
  | "setupSelectedAdaId"
  | "setupSlotThomasIdx"
  | "setupSlotAdaIdx"
  | "setupSlotRolling"
  | "setupSlotFinished"
  | "setupSlotExcludedIds"
  | "setupSlotSpinToken"
  | "setupSlotSpinPlan"
> = {
  setupStep: null,
  setupSelectedThomasId: null,
  setupSelectedAdaId: null,
  setupSlotThomasIdx: 0,
  setupSlotAdaIdx: 0,
  setupSlotRolling: false,
  setupSlotFinished: false,
  setupSlotExcludedIds: [],
  setupSlotSpinToken: 0,
  setupSlotSpinPlan: null,
}

export type ScoreboardGameMode = "4v4" | "5p"

export const SCOREBOARD_GAME_PATHS: Record<ScoreboardGameMode, string> = {
  "4v4": "/4v4",
  "5p": "/1v4",
}

const DEFAULT_FOUR_V_FOUR_PLAYERS = (team: "thomas" | "ada"): Player[] =>
  Array.from({ length: 4 }, (_, index) => ({
    id: `${team}-${index + 1}`,
    name: "",
    kills: 0,
    played: false,
  }))

const DEFAULT_FIVE_PLAYER_ROSTER = (): Player[] =>
  Array.from({ length: 5 }, (_, index) => ({
    id: String(index + 1),
    name: "",
    kills: 0,
    played: false,
    killer: "",
  }))

export function createDefaultScoreboardState(
  gameMode: ScoreboardGameMode,
): ScoreboardSyncState {
  if (gameMode === "5p") {
    return {
      mode: "5p",
      players: DEFAULT_FIVE_PLAYER_ROSTER(),
      receivingConfig: [5, 8, 10, 12, 15],
      givingConfig: [15, 12, 10, 8, 5],
    }
  }

  return {
    mode: "4v4",
    thomas: DEFAULT_FOUR_V_FOUR_PLAYERS("thomas"),
    ada: DEFAULT_FOUR_V_FOUR_PLAYERS("ada"),
    thomasName: "",
    adaName: "",
    firstAttackerId: null,
    ace: {
      isActive: false,
      hasCompleted: false,
      thomasId: null,
      adaId: null,
      thomasBackup: null,
      adaBackup: null,
      firstAttackerBackup: null,
      winnerTeam: null,
      winnersMap: {},
      showProceedButton: false,
      showRematchPrompt: false,
      ...CLOSED_ACE_SETUP,
    },
  }
}

export type FourVFourSyncState = {
  mode: "4v4"
  thomas: Player[]
  ada: Player[]
  thomasName: string
  adaName: string
  firstAttackerId: string | null
  ace: AceSyncState
}

export type FivePlayerSyncState = {
  mode: "5p"
  players: Player[]
  receivingConfig: number[]
  givingConfig: number[]
}

export type ScoreboardSyncState = FourVFourSyncState | FivePlayerSyncState

export type ScoreboardRoom = {
  version: 1
  ownerUid: string
  status: "active"
  createdAt: number
  updatedAt: number
  expiresAt: number
  scoreboard: ScoreboardSyncState
  hostConnections?: Record<string, true>
  hostDisconnectedAt?: number
}

type WireAceState = {
  isActive: boolean
  hasCompleted: boolean
  showProceedButton: boolean
  showRematchPrompt?: boolean
  setupStep?: AceModalStep
  setupSelectedThomasId?: string
  setupSelectedAdaId?: string
  setupSlotThomasIdx?: number
  setupSlotAdaIdx?: number
  setupSlotRolling?: boolean
  setupSlotFinished?: boolean
  setupSlotExcludedIds?: Record<string, true>
  setupSlotSpinToken?: number
  setupSlotSpinPlan?: AceSlotSpinPlan
  thomasId?: string
  adaId?: string
  firstAttackerBackup?: string
  winnerTeam?: "thomas" | "ada"
  winnersMap?: Record<string, "win" | "lose">
  thomasBackup?: Player
  adaBackup?: Player
}

type FourVFourWireState = Omit<
  FourVFourSyncState,
  "thomas" | "ada" | "ace" | "firstAttackerId" | "mode"
> & {
  mode: "4v4"
  thomas: Player[] | null
  ada: Player[] | null
  thomasCount: number
  adaCount: number
  ace: WireAceState
  firstAttackerId?: string
}

type FivePlayerWireState = {
  mode: "5p"
  playerCount: number
  players: Player[] | null
  receivingConfig: number[]
  givingConfig: number[]
}

type ScoreboardWireState = FourVFourWireState | FivePlayerWireState

export type StoredRoomSession = {
  token: string
  expiresAt: number
  gameMode: ScoreboardGameMode
}

const VALID_KILLS = new Set([0, 1, 2, 3, 3.5, 4])

function isPlayer(value: unknown): value is Player {
  if (!value || typeof value !== "object") return false
  const player = value as Partial<Player>
  return (
    typeof player.id === "string" &&
    player.id.length > 0 &&
    player.id.length <= 80 &&
    typeof player.name === "string" &&
    player.name.length <= 40 &&
    typeof player.kills === "number" &&
    VALID_KILLS.has(player.kills) &&
    typeof player.played === "boolean" &&
    (player.killer === undefined ||
      (typeof player.killer === "string" && player.killer.length <= 30))
  )
}

function isNullableString(value: unknown, maxLength = 80) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.length <= maxLength)
  )
}

function isAceState(value: unknown): value is AceSyncState {
  if (!value || typeof value !== "object") return false
  const ace = value as Partial<AceSyncState>
  const validWinners =
    ace.winnersMap !== null &&
    typeof ace.winnersMap === "object" &&
    Object.values(ace.winnersMap ?? {}).every(
      (result) => result === "win" || result === "lose",
    )

  return (
    typeof ace.isActive === "boolean" &&
    typeof ace.hasCompleted === "boolean" &&
    isNullableString(ace.thomasId) &&
    isNullableString(ace.adaId) &&
    (ace.thomasBackup === null ||
      ace.thomasBackup === undefined ||
      isPlayer(ace.thomasBackup)) &&
    (ace.adaBackup === null ||
      ace.adaBackup === undefined ||
      isPlayer(ace.adaBackup)) &&
    isNullableString(ace.firstAttackerBackup) &&
    (ace.winnerTeam === null ||
      ace.winnerTeam === undefined ||
      ace.winnerTeam === "thomas" ||
      ace.winnerTeam === "ada") &&
    validWinners &&
    typeof ace.showProceedButton === "boolean" &&
    (ace.showRematchPrompt === undefined ||
      typeof ace.showRematchPrompt === "boolean") &&
    (ace.setupStep === undefined ||
      ace.setupStep === null ||
      ace.setupStep === "prompt" ||
      ace.setupStep === "method_select" ||
      ace.setupStep === "manual_select" ||
      ace.setupStep === "random_slot") &&
    isNullableString(ace.setupSelectedThomasId) &&
    isNullableString(ace.setupSelectedAdaId) &&
    (ace.setupSlotThomasIdx === undefined ||
      (typeof ace.setupSlotThomasIdx === "number" &&
        ace.setupSlotThomasIdx >= 0 &&
        ace.setupSlotThomasIdx <= 3)) &&
    (ace.setupSlotAdaIdx === undefined ||
      (typeof ace.setupSlotAdaIdx === "number" &&
        ace.setupSlotAdaIdx >= 0 &&
        ace.setupSlotAdaIdx <= 3)) &&
    (ace.setupSlotRolling === undefined ||
      typeof ace.setupSlotRolling === "boolean") &&
    (ace.setupSlotFinished === undefined ||
      typeof ace.setupSlotFinished === "boolean") &&
    (ace.setupSlotExcludedIds === undefined ||
      (Array.isArray(ace.setupSlotExcludedIds) &&
        ace.setupSlotExcludedIds.length <= 8 &&
        ace.setupSlotExcludedIds.every(
          (id) => typeof id === "string" && id.length > 0 && id.length <= 80,
        ))) &&
    (ace.setupSlotSpinToken === undefined ||
      (typeof ace.setupSlotSpinToken === "number" &&
        ace.setupSlotSpinToken >= 0)) &&
    (ace.setupSlotSpinPlan === undefined ||
      ace.setupSlotSpinPlan === null ||
      isSlotSpinPlan(ace.setupSlotSpinPlan))
  )
}

function isSlotSpinPlan(value: unknown): value is AceSlotSpinPlan {
  if (!value || typeof value !== "object") return false
  const plan = value as Partial<AceSlotSpinPlan>
  return (
    typeof plan.targetThomasIdx === "number" &&
    plan.targetThomasIdx >= 0 &&
    plan.targetThomasIdx <= 3 &&
    typeof plan.targetAdaIdx === "number" &&
    plan.targetAdaIdx >= 0 &&
    plan.targetAdaIdx <= 3 &&
    typeof plan.thomasMaxSteps === "number" &&
    plan.thomasMaxSteps >= 0 &&
    plan.thomasMaxSteps <= 200 &&
    typeof plan.adaMaxSteps === "number" &&
    plan.adaMaxSteps >= 0 &&
    plan.adaMaxSteps <= 200 &&
    typeof plan.startThomasActiveIdx === "number" &&
    plan.startThomasActiveIdx >= 0 &&
    plan.startThomasActiveIdx <= 3 &&
    typeof plan.startAdaActiveIdx === "number" &&
    plan.startAdaActiveIdx >= 0 &&
    plan.startAdaActiveIdx <= 3 &&
    typeof plan.spinToken === "number" &&
    plan.spinToken >= 0
  )
}

function excludedIdsFromWire(
  value: Record<string, true> | string[] | undefined,
) {
  if (!value) return []
  if (Array.isArray(value)) return value
  return Object.keys(value)
}

function excludedIdsToWire(ids: string[]) {
  if (ids.length === 0) return undefined
  return Object.fromEntries(ids.map((id) => [id, true as const]))
}

const VALID_INTEGER_KILLS = new Set([0, 1, 2, 3, 4])

function isIntegerPlayer(value: unknown): value is Player {
  if (!isPlayer(value)) return false
  return VALID_INTEGER_KILLS.has(value.kills)
}

function isPinballConfig(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 5 &&
    value.every(
      (entry) =>
        typeof entry === "number" &&
        Number.isInteger(entry) &&
        entry >= 0 &&
        entry <= 99,
    )
  )
}

function isFourVFourSyncState(
  value: unknown,
): value is FourVFourSyncState {
  if (!value || typeof value !== "object") return false
  const state = value as Partial<FourVFourSyncState>
  return (
    state.mode === "4v4" &&
    Array.isArray(state.thomas) &&
    state.thomas.length <= 4 &&
    state.thomas.every(isPlayer) &&
    Array.isArray(state.ada) &&
    state.ada.length <= 4 &&
    state.ada.every(isPlayer) &&
    typeof state.thomasName === "string" &&
    state.thomasName.length <= 24 &&
    typeof state.adaName === "string" &&
    state.adaName.length <= 24 &&
    isNullableString(state.firstAttackerId) &&
    isAceState(state.ace)
  )
}

function isFivePlayerSyncState(
  value: unknown,
): value is FivePlayerSyncState {
  if (!value || typeof value !== "object") return false
  const state = value as Partial<FivePlayerSyncState>
  return (
    state.mode === "5p" &&
    Array.isArray(state.players) &&
    state.players.length <= 5 &&
    state.players.every(isIntegerPlayer) &&
    isPinballConfig(state.receivingConfig) &&
    isPinballConfig(state.givingConfig)
  )
}

export function isScoreboardSyncState(
  value: unknown,
): value is ScoreboardSyncState {
  return isFourVFourSyncState(value) || isFivePlayerSyncState(value)
}

function normalizePlayer(player: Player): Player {
  return {
    id: player.id.slice(0, 80),
    name: player.name.slice(0, 40),
    kills: VALID_KILLS.has(player.kills) ? player.kills : 0,
    played: player.played,
    killer: (player.killer ?? "").slice(0, 30),
  }
}

export function normalizeFourVFourState(
  state: FourVFourSyncState,
): FourVFourSyncState {
  return {
    mode: "4v4",
    thomas: state.thomas.slice(0, 4).map(normalizePlayer),
    ada: state.ada.slice(0, 4).map(normalizePlayer),
    thomasName: state.thomasName.slice(0, 24),
    adaName: state.adaName.slice(0, 24),
    firstAttackerId: state.firstAttackerId,
    ace: {
      ...state.ace,
      thomasBackup: state.ace.thomasBackup
        ? normalizePlayer(state.ace.thomasBackup)
        : null,
      adaBackup: state.ace.adaBackup
        ? normalizePlayer(state.ace.adaBackup)
        : null,
    },
  }
}

export function normalizeFivePlayerState(
  state: FivePlayerSyncState,
): FivePlayerSyncState {
  const normalizeIntegerPlayer = (player: Player): Player => {
    const normalized = normalizePlayer(player)
    return {
      ...normalized,
      kills: VALID_INTEGER_KILLS.has(normalized.kills)
        ? normalized.kills
        : 0,
    }
  }

  const clampConfig = (config: number[]) =>
    [0, 1, 2, 3, 4].map((index) => {
      const value = config[index]
      if (typeof value !== "number" || !Number.isFinite(value)) return 0
      return Math.min(99, Math.max(0, Math.round(value)))
    })

  return {
    mode: "5p",
    players: state.players.slice(0, 5).map(normalizeIntegerPlayer),
    receivingConfig: clampConfig(state.receivingConfig),
    givingConfig: clampConfig(state.givingConfig),
  }
}

export function normalizeScoreboardState(
  state: ScoreboardSyncState,
): ScoreboardSyncState {
  if (state.mode === "5p") return normalizeFivePlayerState(state)
  return normalizeFourVFourState(state)
}

function toWireAce(ace: AceSyncState): WireAceState {
  const wire: WireAceState = {
    isActive: ace.isActive,
    hasCompleted: ace.hasCompleted,
    showProceedButton: ace.showProceedButton,
    showRematchPrompt: ace.showRematchPrompt,
  }

  if (ace.setupStep) {
    wire.setupStep = ace.setupStep
    if (ace.setupSelectedThomasId) {
      wire.setupSelectedThomasId = ace.setupSelectedThomasId
    }
    if (ace.setupSelectedAdaId) {
      wire.setupSelectedAdaId = ace.setupSelectedAdaId
    }
    wire.setupSlotThomasIdx = ace.setupSlotThomasIdx
    wire.setupSlotAdaIdx = ace.setupSlotAdaIdx
    wire.setupSlotRolling = ace.setupSlotRolling
    wire.setupSlotFinished = ace.setupSlotFinished
    const excludedWire = excludedIdsToWire(ace.setupSlotExcludedIds)
    if (excludedWire) wire.setupSlotExcludedIds = excludedWire
    if (ace.setupSlotSpinToken > 0) {
      wire.setupSlotSpinToken = ace.setupSlotSpinToken
    }
    if (ace.setupSlotSpinPlan) {
      wire.setupSlotSpinPlan = ace.setupSlotSpinPlan
    }
  }

  if (ace.thomasId) wire.thomasId = ace.thomasId
  if (ace.adaId) wire.adaId = ace.adaId
  if (ace.firstAttackerBackup) wire.firstAttackerBackup = ace.firstAttackerBackup
  if (ace.winnerTeam) wire.winnerTeam = ace.winnerTeam
  if (ace.thomasBackup) wire.thomasBackup = normalizePlayer(ace.thomasBackup)
  if (ace.adaBackup) wire.adaBackup = normalizePlayer(ace.adaBackup)
  if (Object.keys(ace.winnersMap).length > 0) wire.winnersMap = ace.winnersMap

  return wire
}

function toWireFourVFourState(state: FourVFourSyncState): FourVFourWireState {
  const normalized = normalizeFourVFourState(state)
  const wire: FourVFourWireState = {
    mode: "4v4",
    thomasName: normalized.thomasName,
    adaName: normalized.adaName,
    thomas: normalized.thomas.length > 0 ? normalized.thomas : null,
    ada: normalized.ada.length > 0 ? normalized.ada : null,
    thomasCount: normalized.thomas.length,
    adaCount: normalized.ada.length,
    ace: toWireAce(normalized.ace),
  }

  if (normalized.firstAttackerId) {
    wire.firstAttackerId = normalized.firstAttackerId
  }

  return wire
}

function toWireFivePlayerState(state: FivePlayerSyncState): FivePlayerWireState {
  const normalized = normalizeFivePlayerState(state)
  return {
    mode: "5p",
    playerCount: normalized.players.length,
    players: normalized.players.length > 0 ? normalized.players : null,
    receivingConfig: normalized.receivingConfig,
    givingConfig: normalized.givingConfig,
  }
}

function toWireState(state: ScoreboardSyncState): ScoreboardWireState {
  if (state.mode === "5p") return toWireFivePlayerState(state)
  return toWireFourVFourState(state)
}

function fromWireFourVFourState(
  wire: Partial<FourVFourWireState>,
): FourVFourSyncState | null {
  const candidate: FourVFourSyncState = {
    mode: "4v4",
    thomas: Array.isArray(wire.thomas) ? wire.thomas : [],
    ada: Array.isArray(wire.ada) ? wire.ada : [],
    thomasName: wire.thomasName ?? "",
    adaName: wire.adaName ?? "",
    firstAttackerId: wire.firstAttackerId ?? null,
    ace: {
      isActive: wire.ace?.isActive ?? false,
      hasCompleted: wire.ace?.hasCompleted ?? false,
      thomasId: wire.ace?.thomasId ?? null,
      adaId: wire.ace?.adaId ?? null,
      thomasBackup: wire.ace?.thomasBackup ?? null,
      adaBackup: wire.ace?.adaBackup ?? null,
      firstAttackerBackup: wire.ace?.firstAttackerBackup ?? null,
      winnerTeam: wire.ace?.winnerTeam ?? null,
      winnersMap: wire.ace?.winnersMap ?? {},
      showProceedButton: wire.ace?.showProceedButton ?? false,
      showRematchPrompt: wire.ace?.showRematchPrompt ?? false,
      ...CLOSED_ACE_SETUP,
      ...(wire.ace?.setupStep
        ? {
            setupStep: wire.ace.setupStep,
            setupSelectedThomasId: wire.ace.setupSelectedThomasId ?? null,
            setupSelectedAdaId: wire.ace.setupSelectedAdaId ?? null,
            setupSlotThomasIdx: wire.ace.setupSlotThomasIdx ?? 0,
            setupSlotAdaIdx: wire.ace.setupSlotAdaIdx ?? 0,
            setupSlotRolling: wire.ace.setupSlotRolling ?? false,
            setupSlotFinished: wire.ace.setupSlotFinished ?? false,
            setupSlotExcludedIds: excludedIdsFromWire(
              wire.ace.setupSlotExcludedIds,
            ),
            setupSlotSpinToken: wire.ace.setupSlotSpinToken ?? 0,
            setupSlotSpinPlan: wire.ace.setupSlotSpinPlan ?? null,
          }
        : {}),
    },
  }

  if (
    wire.thomasCount !== candidate.thomas.length ||
    wire.adaCount !== candidate.ada.length ||
    !isFourVFourSyncState(candidate)
  ) {
    return null
  }
  return candidate
}

function fromWireFivePlayerState(
  wire: Partial<FivePlayerWireState>,
): FivePlayerSyncState | null {
  const players = Array.isArray(wire.players) ? wire.players : []
  const candidate: FivePlayerSyncState = {
    mode: "5p",
    players,
    receivingConfig: Array.isArray(wire.receivingConfig)
      ? wire.receivingConfig
      : [],
    givingConfig: Array.isArray(wire.givingConfig) ? wire.givingConfig : [],
  }

  if (wire.playerCount !== candidate.players.length || !isFivePlayerSyncState(candidate)) {
    return null
  }
  return candidate
}

function fromWireState(value: unknown): ScoreboardSyncState | null {
  if (!value || typeof value !== "object") return null
  const wire = value as Partial<ScoreboardWireState>
  if (wire.mode === "5p") return fromWireFivePlayerState(wire)
  if (wire.mode === "4v4" || "thomasCount" in wire) {
    return fromWireFourVFourState(wire as Partial<FourVFourWireState>)
  }
  return null
}

export function generateRoomToken(byteLength = 24) {
  const bytes = new Uint8Array(byteLength)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

export function buildInviteUrl(token: string, gameMode: ScoreboardGameMode) {
  return `${window.location.origin}${SCOREBOARD_GAME_PATHS[gameMode]}#room=${encodeURIComponent(token)}`
}

export function buildDiscordInviteMessage(url: string) {
  return `[치즈 바이 데이라이트 | 점수판 연동하기](${url})`
}

export function consumeInviteToken(gameMode: ScoreboardGameMode) {
  const match = window.location.hash.match(/^#room=([a-f0-9]{48,128})$/i)
  if (!match) return null

  window.history.replaceState(
    window.history.state,
    "",
    SCOREBOARD_GAME_PATHS[gameMode],
  )
  return match[1].toLowerCase()
}

export function loadRoomSession(
  storage: Storage,
  key: string,
): StoredRoomSession | null {
  try {
    const raw = storage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<StoredRoomSession>
    if (
      typeof parsed.token !== "string" ||
      !/^[a-f0-9]{48,128}$/i.test(parsed.token) ||
      typeof parsed.expiresAt !== "number" ||
      parsed.expiresAt <= Date.now() ||
      (parsed.gameMode !== undefined &&
        parsed.gameMode !== "4v4" &&
        parsed.gameMode !== "5p")
    ) {
      storage.removeItem(key)
      return null
    }
    return {
      token: parsed.token.toLowerCase(),
      expiresAt: parsed.expiresAt,
      gameMode: parsed.gameMode ?? "4v4",
    }
  } catch {
    storage.removeItem(key)
    return null
  }
}

export function saveRoomSession(
  storage: Storage,
  key: string,
  session: StoredRoomSession,
) {
  storage.setItem(key, JSON.stringify(session))
}

export function roomPath(token: string) {
  return `scoreboardRooms/${token}`
}

const SERVER_TIME_OFFSET_CACHE_MS = 30_000
let cachedServerTimeOffset: number | null = null
let cachedServerTimeOffsetAt = 0

function cacheServerTimeOffset(offset: number) {
  cachedServerTimeOffset = offset
  cachedServerTimeOffsetAt = Date.now()
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs)
    promise.then(
      (value) => {
        window.clearTimeout(timeoutId)
        resolve(value)
      },
      (error: unknown) => {
        window.clearTimeout(timeoutId)
        reject(error)
      },
    )
  })
}

export type FirebaseSessionReady = {
  serverTimeOffset: number
}

/**
 * WebSocket 연결이 열리면 바로 진행한다. serverTimeOffset은 병렬로 수집하되,
 * 일부 환경에서 값이 늦게 오면 0으로 대체한다(연동 자체를 막지 않음).
 */
export function prepareFirebaseSession(
  database: Database,
  timeoutMs = 20_000,
): Promise<FirebaseSessionReady> {
  return new Promise((resolve, reject) => {
    const connectedRef = ref(database, ".info/connected")
    const offsetRef = ref(database, ".info/serverTimeOffset")
    let timeoutId: number | undefined
    let connected = false
    let offset = 0
    let settled = false
    let unsubscribeConnected: (() => void) | undefined
    let unsubscribeOffset: (() => void) | undefined

    const cleanupListeners = () => {
      unsubscribeConnected?.()
      unsubscribeOffset?.()
    }

    const finish = () => {
      if (settled || !connected) return
      settled = true
      if (timeoutId !== undefined) window.clearTimeout(timeoutId)
      cleanupListeners()
      cacheServerTimeOffset(offset)
      resolve({ serverTimeOffset: offset })
    }

    unsubscribeConnected = onValue(
      connectedRef,
      (snapshot) => {
        if (snapshot.val() !== true) return
        connected = true
        finish()
      },
      (error) => {
        if (settled) return
        settled = true
        if (timeoutId !== undefined) window.clearTimeout(timeoutId)
        cleanupListeners()
        reject(error)
      },
    )

    unsubscribeOffset = onValue(offsetRef, (snapshot) => {
      const value = snapshot.val()
      if (typeof value === "number") {
        offset = value
        if (connected) finish()
      }
    })

    timeoutId = window.setTimeout(() => {
      if (settled) return
      if (connected) {
        finish()
        return
      }
      settled = true
      cleanupListeners()
      reject(
        new Error(
          "Firebase 서버 연결 시간이 초과되었습니다. Realtime Database가 생성됐는지, Anonymous 로그인이 켜져 있는지 확인해 주세요.",
        ),
      )
    }, timeoutMs)
  })
}

/** @deprecated prepareFirebaseSession 사용 */
export function waitForFirebaseConnection(
  database: Database,
  timeoutMs = 20_000,
): Promise<void> {
  return prepareFirebaseSession(database, timeoutMs).then(() => undefined)
}

export function getServerTimeOffset(
  database: Database,
  timeoutMs = 2_000,
): Promise<number> {
  if (
    cachedServerTimeOffset !== null &&
    Date.now() - cachedServerTimeOffsetAt < SERVER_TIME_OFFSET_CACHE_MS
  ) {
    return Promise.resolve(cachedServerTimeOffset)
  }

  return withTimeout(
    new Promise<number>((resolve, reject) => {
      const offsetRef = ref(database, ".info/serverTimeOffset")
      let unsubscribe = () => {}
      unsubscribe = onValue(
        offsetRef,
        (snapshot) => {
          unsubscribe()
          const value = snapshot.val()
          const nextOffset = typeof value === "number" ? value : 0
          cacheServerTimeOffset(nextOffset)
          resolve(nextOffset)
        },
        (error) => {
          unsubscribe()
          reject(error)
        },
      )
    }),
    timeoutMs,
    "offset-timeout",
  ).catch(() => 0)
}

async function getServerNow(database: Database) {
  return Date.now() + (await getServerTimeOffset(database))
}

export async function createScoreboardRoom(
  database: Database,
  ownerUid: string,
  token: string,
  scoreboard: ScoreboardSyncState,
  serverNow?: number,
) {
  const now = serverNow ?? (await getServerNow(database))
  const expiresAt = now + ROOM_TTL_MS
  await set(ref(database, roomPath(token)), {
    version: 1,
    ownerUid,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    scoreboard: toWireState(scoreboard),
  })
  return expiresAt
}

export async function resumeScoreboardRoom(
  database: Database,
  ownerUid: string,
  token: string,
  scoreboard: ScoreboardSyncState,
) {
  const roomRef = ref(database, roomPath(token))
  const snapshot = await get(roomRef)
  const room = snapshot.val() as Partial<ScoreboardRoom> | null
  const serverNow = await getServerNow(database)
  if (
    !room ||
    room.ownerUid !== ownerUid ||
    room.status !== "active"
  ) {
    return null
  }

  const expiresAt = serverNow + ROOM_TTL_MS
  await update(roomRef, {
    scoreboard: toWireState(scoreboard),
    updatedAt: serverNow,
    expiresAt,
  })
  return expiresAt
}

export async function writeScoreboardState(
  database: Database,
  token: string,
  scoreboard: ScoreboardSyncState,
) {
  const serverNow = await getServerNow(database)
  const expiresAt = serverNow + ROOM_TTL_MS
  await update(ref(database, roomPath(token)), {
    scoreboard: toWireState(scoreboard),
    updatedAt: serverNow,
    expiresAt,
  })
  return expiresAt
}

export async function deleteScoreboardRoom(
  database: Database,
  token: string,
) {
  await remove(ref(database, roomPath(token)))
}

export function subscribeToScoreboardRoom(
  database: Database,
  token: string,
  onRoom: (room: ScoreboardRoom | null) => void,
  onError: (error: Error) => void,
): Unsubscribe {
  return onValue(
    ref(database, roomPath(token)),
    (snapshot) => {
      const value = snapshot.val() as
        | (Omit<ScoreboardRoom, "scoreboard"> & {
            scoreboard?: ScoreboardWireState
          })
        | null
      const scoreboard = fromWireState(value?.scoreboard)
      if (
        !value ||
        value.version !== 1 ||
        value.status !== "active" ||
        typeof value.expiresAt !== "number" ||
        !scoreboard
      ) {
        onRoom(null)
        return
      }
      onRoom({ ...value, scoreboard })
    },
    (error) => onError(error),
  )
}

export function subscribeToFirebaseConnection(
  database: Database,
  onConnectionChange: (connected: boolean) => void,
) {
  return onValue(ref(database, ".info/connected"), (snapshot) => {
    onConnectionChange(snapshot.val() === true)
  })
}

export async function registerHostPresence(
  database: Database,
  token: string,
) {
  // 탭 takeover 경계에서 이전 onDisconnect와 새 연결이 같은 슬롯을 건드리지
  // 않도록 96비트 연결 ID를 사용한다.
  const connectionId = generateRoomToken(12)
  const currentRoomRef = ref(database, roomPath(token))
  const disconnect = onDisconnect(currentRoomRef)
  await withTimeout(
    disconnect.update({
      [`hostConnections/${connectionId}`]: null,
      hostDisconnectedAt: serverTimestamp(),
    }),
    15_000,
    "방 연결 등록 시간이 초과되었습니다. 네트워크 연결을 확인해 주세요.",
  )
  await update(currentRoomRef, {
    [`hostConnections/${connectionId}`]: true,
    hostDisconnectedAt: null,
  })

  return async () => {
    await disconnect.cancel()
    await update(currentRoomRef, {
      [`hostConnections/${connectionId}`]: null,
      hostDisconnectedAt: serverTimestamp(),
    })
  }
}

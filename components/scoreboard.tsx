"use client"

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from "react"
import { flushSync } from "react-dom"
import { AceMatchModal } from "@/components/ace-match-modal"
import { AuctionOrderModal } from "@/components/auction-order-modal"
import { CoinTossWidget } from "@/components/coin-toss-widget"
import {
  aceModalSyncToSetup,
  aceSetupToModalSync,
  buildExcludedIdsFromList,
  buildNextAceRematchExcludedIds,
  mergeAceDrawExcludedIds,
  DEFAULT_ACE_MODAL_SYNC,
  type AceModalSyncState,
} from "@/lib/ace-modal-sync"
import { buildAceMatchNotice } from "@/lib/ace-match-warning"
import {
  computeCold,
  toValid4v4Step,
  type ColdState,
  type SecondaryCondition,
} from "@/lib/cold-warning"
import { AceMatchOverlay } from "@/components/ace-match-overlay"
import { HoldButton } from "@/components/hold-button"
import { KillerPicker, type KillerPickerContext } from "@/components/killer-picker"
import { KillerPickSlots } from "@/components/killer-pick-slots"
import { MAX_KILLS, PlayerRow, type Player } from "@/components/player-row"
import { AppVersionCorner } from "@/components/app-version"
import { ScoreboardSyncPanel } from "@/components/scoreboard-sync-panel"
import { ZoomCompensated } from "@/components/zoom-compensated"
import { UtilityUiToggle } from "@/components/utility-ui-toggle"
import { SyncStatusCompactLabel } from "@/components/sync-status-compact-label"
import { TeamScore } from "@/components/team-score"
import { ViewerLinkExpiredNotice } from "@/components/viewer-link-expired-notice"
import { WinnerOverlay } from "@/components/winner-overlay"
import { X } from "lucide-react"
import {
  isPlayerEnteredOutOfOrder,
  getFirstOutOfOrderPlayerId,
  DRAG_HINT_SEEN_4V4_KEY,
} from "@/lib/scoreboard-order-hint"
import { useScoreboardRoom } from "@/hooks/use-scoreboard-room"
import { useAutoDismiss, RESET_MENU_IDLE_MS } from "@/hooks/use-auto-dismiss"
import { useDismissOnOutsideInteraction } from "@/hooks/use-dismiss-on-outside-interaction"
import { useUtilityUiHidden } from "@/hooks/use-utility-ui-hidden"
import type { FourVFourSyncState, ScoreboardSyncState } from "@/lib/firebase/scoreboard-room"
import {
  CLOSED_ACE_SETUP,
  MODE_SWITCH_SESSION_KEY,
  VIEWER_SESSION_KEY,
  loadRoomSession,
  normalizeFourVFourPlayer,
  normalizeKillerBans,
} from "@/lib/firebase/scoreboard-room"
import {
  consumeViewerSessionEndedNotice,
  type ViewerSessionEndReason,
} from "@/lib/viewer-session-notice"
import { buildScoreAnimationPatch } from "@/lib/player-score-animation"
import {
  appendAceRoundLogEntry,
  buildAceRoundLogKey,
  createAceRoundLogEntry,
  normalizeAceRoundLog,
  type AceRoundLogEntry,
} from "@/lib/ace-round-log"
import {
  cancelPlayerKillerPick,
  flattenFearlessPicks,
  MAX_FOUR_V_FOUR_FEARLESS_PICKS,
  setPlayerKillerPick,
  toggleKillerBan,
} from "@/lib/fearless"
import {
  applyFourVFourNameCommit,
  clearPlayerRosterField,
} from "@/lib/roster-name-commit"
import {
  clearPickerSelection,
  createInitialPickerUi,
  nextPickerFeedback,
  nextPickerSelection,
  type PickerFeedbackKind,
  type PickerUiSyncState,
} from "@/lib/picker-ui-sync"
import { cn } from "@/lib/utils"
import {
  RESET_CONFIRM_NO,
  RESET_CONFIRM_PANEL,
  RESET_CONFIRM_TEXT,
  RESET_CONFIRM_YES,
  RESET_ROSTER_KILLER_BTN,
} from "@/lib/scoreboard-reset-ui"
import { motion } from "motion/react"
import { useRouter } from "next/navigation"

type Team = "thomas" | "ada"

const INITIAL_THOMAS: Player[] = [
  { id: "thomas-1", name: "", kills: 0, played: false },
  { id: "thomas-2", name: "", kills: 0, played: false },
  { id: "thomas-3", name: "", kills: 0, played: false },
  { id: "thomas-4", name: "", kills: 0, played: false },
]
const INITIAL_ADA: Player[] = [
  { id: "ada-1", name: "", kills: 0, played: false },
  { id: "ada-2", name: "", kills: 0, played: false },
  { id: "ada-3", name: "", kills: 0, played: false },
  { id: "ada-4", name: "", kills: 0, played: false },
]
const SCORE_BEAT_MS = 355
const SCORE_BEAT_DOWN_MS = 40  // 점수 감소 시 빠르게 주르륵
const MAX_PLAYERS_PER_TEAM = 4
const LS_KEY = "dbd-scoreboard-v1"
const GUIDE_SEEN_4V4_KEY = "dbd-fearless-guide-seen-4v4"
const ACE_REDO_HINT_SEEN_KEY = "dbd-ace-redo-hint-seen"
const EXPIRATION_TIME_MS = 3 * 60 * 60 * 1000 // 마지막 조작 기준 3시간 만료

const teamScore = (players: Player[]) => players.reduce((s, p) => s + p.kills, 0)

function clearPlayerKillers(player: Player): Player {
  const next = { ...player, killerPicks: [] }
  delete next.killer
  return next
}

/** 에결 종료 시 4v4 점수만 복원하고, 에결 중 기록한 살인마 픽 등은 유지한다. */
function restoreAcePlayerScores(backup: Player, current: Player): Player {
  return { ...current, kills: backup.kills, played: backup.played }
}

function applyAceFourVFourRestore(
  thomasBackup: Player | null,
  adaBackup: Player | null,
  firstAttackerBackup: string | null,
  setThomas: Dispatch<SetStateAction<Player[]>>,
  setAda: Dispatch<SetStateAction<Player[]>>,
  setFirstAttackerId: Dispatch<SetStateAction<string | null>>,
) {
  if (thomasBackup) {
    setThomas((prev) =>
      prev.map((p) =>
        p.id === thomasBackup.id
          ? restoreAcePlayerScores(thomasBackup, p)
          : p,
      ),
    )
  }
  if (adaBackup) {
    setAda((prev) =>
      prev.map((p) =>
        p.id === adaBackup.id ? restoreAcePlayerScores(adaBackup, p) : p,
      ),
    )
  }
  if (firstAttackerBackup !== null) {
    setFirstAttackerId(firstAttackerBackup)
  }
}

function aceMatchHasAnyScoring(
  thomas: Player[],
  ada: Player[],
  aceThomasId: string | null,
  aceAdaId: string | null,
): boolean {
  if (!aceThomasId || !aceAdaId) return false
  const tAce = thomas.find((player) => player.id === aceThomasId)
  const aAce = ada.find((player) => player.id === aceAdaId)
  if (!tAce || !aAce) return false
  return tAce.played || aAce.played || tAce.kills > 0 || aAce.kills > 0
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/** 마지막 남은 플레이어가 뒤지고 있던 점수를 역전해 정규 종료로 이긴 경우 */
function detectComebackWin(
  thomas: Player[],
  ada: Player[],
  lastScoredPlayerId: string | null,
): boolean {
  if (!lastScoredPlayerId) return false

  const allPlayed = thomas.every((p) => p.played) && ada.every((p) => p.played)
  if (!allPlayed) return false

  const thomasPlayer = thomas.find((p) => p.id === lastScoredPlayerId)
  const adaPlayer = ada.find((p) => p.id === lastScoredPlayerId)
  const lastPlayer = thomasPlayer ?? adaPlayer
  if (!lastPlayer?.played) return false

  const playerTeam: Team = thomasPlayer ? "thomas" : "ada"
  const thomasScore = teamScore(thomas)
  const adaScore = teamScore(ada)
  if (thomasScore === adaScore) return false

  const winnerTeam: Team = thomasScore > adaScore ? "thomas" : "ada"
  if (playerTeam !== winnerTeam) return false

  const myScoreAfter = playerTeam === "thomas" ? thomasScore : adaScore
  const oppScore = playerTeam === "thomas" ? adaScore : thomasScore
  const myScoreBefore = myScoreAfter - lastPlayer.kills

  return myScoreBefore < oppScore
}



/** 선공 선수가 로스터 1번이 아닐 때, 해당 팀 출전 순서를 선공 기준으로 회전 */
function orderTeamRosterForFirstAttacker(
  roster: Player[],
  firstAttackerId: string | null,
): Player[] {
  if (!firstAttackerId) return roster
  const index = roster.findIndex((player) => player.id === firstAttackerId)
  if (index <= 0) return roster
  return [...roster.slice(index), ...roster.slice(0, index)]
}

/**
 * 로스터 순서·선공 기준 이상적 교대 출전 순서 (A1→B1→A2→B2…).
 * 순서를 건너뛴 입력이 있어도, 미출전 중 시퀀스상 가장 앞 선수를 다음 차례로 잡는다.
 */
function buildIdealPlayOrder(
  thomas: Player[],
  ada: Player[],
  firstAttackTeam: Team | null,
  firstAttackerId: string | null,
): Array<{ playerId: string; team: Team }> {
  const firstTeam = firstAttackTeam ?? "thomas"
  const secondTeam: Team = firstTeam === "thomas" ? "ada" : "thomas"
  const firstRosterRaw = firstTeam === "thomas" ? thomas : ada
  const secondRoster = secondTeam === "thomas" ? thomas : ada
  const firstRoster = orderTeamRosterForFirstAttacker(
    firstRosterRaw,
    firstAttackerId && firstRosterRaw.some((player) => player.id === firstAttackerId)
      ? firstAttackerId
      : null,
  )

  const maxLen = Math.max(firstRoster.length, secondRoster.length)
  const sequence: Array<{ playerId: string; team: Team }> = []
  for (let index = 0; index < maxLen; index += 1) {
    if (index < firstRoster.length) {
      sequence.push({ playerId: firstRoster[index].id, team: firstTeam })
    }
    if (index < secondRoster.length) {
      sequence.push({ playerId: secondRoster[index].id, team: secondTeam })
    }
  }
  return sequence
}

function getNextExpectedPlayer(
  thomas: Player[],
  ada: Player[],
  firstAttackTeam: Team | null,
  firstAttackerId: string | null,
): { playerId: string; team: Team } | null {
  const hasAnyPlayed =
    thomas.some((player) => player.played) || ada.some((player) => player.played)
  if (!firstAttackTeam && !hasAnyPlayed) return null

  const playedById = new Map(
    [...thomas, ...ada].map((player) => [player.id, player.played]),
  )
  for (const slot of buildIdealPlayOrder(
    thomas,
    ada,
    firstAttackTeam,
    firstAttackerId,
  )) {
    if (!playedById.get(slot.playerId)) return slot
  }
  return null
}

/** 에이스 결정전 등 — 총 출전 횟수 홀짝으로 차례 팀을 판단 (기존 방식) */
function computeTurnByPlayCount(
  thomas: Player[],
  ada: Player[],
  firstAttackTeam: Team | null,
): Team | null {
  const thomasPlayed = thomas.filter((player) => player.played).length
  const adaPlayed = ada.filter((player) => player.played).length
  const totalPlayed = thomasPlayed + adaPlayed
  if (totalPlayed === 0) return firstAttackTeam

  const firstTeam = firstAttackTeam ?? "thomas"
  const otherTeam: Team = firstTeam === "thomas" ? "ada" : "thomas"
  const nextTeam = totalPlayed % 2 === 0 ? firstTeam : otherTeam

  const nextRemaining =
    nextTeam === "thomas"
      ? thomas.filter((player) => !player.played).length
      : ada.filter((player) => !player.played).length
  if (nextRemaining === 0) {
    const otherRemaining =
      nextTeam === "thomas"
        ? ada.filter((player) => !player.played).length
        : thomas.filter((player) => !player.played).length
    return otherRemaining > 0 ? otherTeam : null
  }
  return nextTeam
}



function resolveShouldShowAceProceedDock(
  isAceMatchMode: boolean,
  thomas: Player[],
  ada: Player[],
  thomasName: string,
  adaName: string,
  firstAttackerId: string | null,
  hasCompletedAceMatch: boolean,
  showAcePromptModal: boolean,
  showAceRematchPrompt: boolean,
): boolean {
  if (
    isAceMatchMode ||
    hasCompletedAceMatch ||
    showAcePromptModal ||
    showAceRematchPrompt
  ) {
    return false
  }

  const firstAttackTeam: Team | null = !firstAttackerId
    ? null
    : thomas.some((player) => player.id === firstAttackerId)
      ? "thomas"
      : ada.some((player) => player.id === firstAttackerId)
        ? "ada"
        : null
  const turn =
    getNextExpectedPlayer(
      thomas,
      ada,
      firstAttackTeam,
      firstAttackerId,
    )?.team ?? null
  const cold = computeCold(thomas, ada, turn, thomasName, adaName)
  return cold.status === "gameover" && cold.winnerName === "tie"
}

/** Counts step-by-step (+1 or -1) while preserving decimal offset if starting with .5.
 *  Increases at SCORE_BEAT_MS; decreases rapidly at SCORE_BEAT_DOWN_MS. */
function useCountUp(target: number) {
  const [display, setDisplay] = useState(target)

  useEffect(() => {
    if (display === target) return

    const decreasing = display > target
    const step = decreasing ? SCORE_BEAT_DOWN_MS : SCORE_BEAT_MS

    const id = window.setTimeout(() => {
      setDisplay((current) => {
        if (current < target) {
          return current + 1 <= target ? current + 1 : target
        }
        return current - 1 >= target ? current - 1 : target
      })
    }, step)

    return () => window.clearTimeout(id)
  }, [display, target])

  return display
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<FourVFourSyncState> & {
      updatedAt?: number
    }
    if (parsed.updatedAt && Date.now() - parsed.updatedAt > EXPIRATION_TIME_MS) {
      localStorage.removeItem(LS_KEY)
      return null
    }
    return {
      ...parsed,
      fearlessEnabled: true,
      thomas: Array.isArray(parsed.thomas)
        ? parsed.thomas.map(normalizeFourVFourPlayer)
        : parsed.thomas,
      ada: Array.isArray(parsed.ada)
        ? parsed.ada.map(normalizeFourVFourPlayer)
        : parsed.ada,
      killerBans: normalizeKillerBans(parsed.killerBans),
      ace: parsed.ace
        ? {
            ...parsed.ace,
            thomasBackup: parsed.ace.thomasBackup
              ? normalizeFourVFourPlayer(parsed.ace.thomasBackup)
              : null,
            adaBackup: parsed.ace.adaBackup
              ? normalizeFourVFourPlayer(parsed.ace.adaBackup)
              : null,
          }
        : parsed.ace,
    }
  } catch {
    return null
  }
}

function resolveFirstAttackerId(
  firstAttackerId: string | null,
  thomas: Player[],
  ada: Player[],
): string | null {
  if (!firstAttackerId) return null
  const rosterIds = new Set([...thomas, ...ada].map((player) => player.id))
  return rosterIds.has(firstAttackerId) ? firstAttackerId : null
}

export function Scoreboard() {
  const router = useRouter()
  // SSR/CSR hydration mismatch 방지: 초기값은 항상 서버와 동일한 기본값으로 시작하고,
  // 마운트 후 useEffect에서 localStorage 값을 불러와 상태에 반영한다.
  const [thomas, setThomas] = useState<Player[]>(INITIAL_THOMAS)
  const [ada, setAda] = useState<Player[]>(INITIAL_ADA)
  const [thomasName, setThomasName] = useState("A")
  const [adaName, setAdaName] = useState("B")
  const [killerBans, setKillerBans] = useState<string[]>([])
  const [fearlessEnabled, setFearlessEnabled] = useState(true)
  const [pickerContext, setPickerContext] =
    useState<KillerPickerContext | null>(null)
  const [pickerUi, setPickerUi] = useState<PickerUiSyncState>(() =>
    createInitialPickerUi(),
  )
  const teamNameLinked = useRef<Record<Team, boolean>>({ thomas: false, ada: false })
  const playerId = useRef(0)
  const [removeMode, setRemoveMode] = useState<Team | null>(null)

  // animation trigger counter per player id
  const [anim, setAnim] = useState<Record<string, number>>({})
  // previous kills snapshot per player id — used to animate only newly added skulls
  const [prevKillsMap, setPrevKillsMap] = useState<Record<string, number>>({})
  const animRef = useRef(anim)
  const prevKillsRef = useRef(prevKillsMap)
  const thomasRef = useRef(thomas)
  const adaRef = useRef(ada)
  const remotePlayersRef = useRef<{ thomas: Player[]; ada: Player[] } | null>(
    null,
  )
  /** gameover 시 이전 winnerName — 점수 수정으로 무승부로 바뀌었는지 감지 */
  const prevGameoverWinnerRef = useRef<string | "tie" | null | undefined>(
    undefined,
  )
  const aceOutcomeAnnouncedKeyRef = useRef<string | null>(null)
  const aceAnnouncedKillsRef = useRef<{ thomas: number; ada: number } | null>(
    null,
  )

  useEffect(() => {
    animRef.current = anim
  }, [anim])

  useEffect(() => {
    prevKillsRef.current = prevKillsMap
  }, [prevKillsMap])

  useLayoutEffect(() => {
    thomasRef.current = thomas
    adaRef.current = ada
  }, [thomas, ada])

  const [leftBump, setLeftBump] = useState(0)
  const [rightBump, setRightBump] = useState(0)
  // 선공: first player (any team) to take their turn
  const [firstAttackerId, setFirstAttackerId] = useState<string | null>(null)
  // 점수 초기화 확인 프롬프트
  const [showResetMenu, setShowResetMenu] = useState(false)
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  // 살인마 초기화 확인 프롬프트
  const [showKillerResetConfirm, setShowKillerResetConfirm] = useState(false)
  const [showRosterResetConfirm, setShowRosterResetConfirm] = useState(false)
  // 모두 초기화 확인 프롬프트
  const [showFullResetConfirm, setShowFullResetConfirm] = useState(false)
  // 경매순서 정하기
  const [showAuctionModal, setShowAuctionModal] = useState(false)
  const [auctionDraftThomas, setAuctionDraftThomas] = useState("")
  const [auctionDraftAda, setAuctionDraftAda] = useState("")
  const [auctionWinnerTeam, setAuctionWinnerTeam] = useState<Team | null>(null)
  // 설명서 메뉴
  const [showGuideMenu, setShowGuideMenu] = useState(false)
  const [showGuide, setShowGuide] = useState<"basic" | "fearless" | null>(
    null,
  )
  // 우승 결과 오버레이 닫힘 여부
  const [overlayDismissed, setOverlayDismissed] = useState(false)
  const [overlayOutcomeKey, setOverlayOutcomeKey] = useState(0)
  // 모드 전환 확인 프롬프트
  const [showModeSwitchConfirm, setShowModeSwitchConfirm] = useState(false)

  // Ace Match States
  const [isAceMatchMode, setIsAceMatchMode] = useState(false)
  const [showAcePromptModal, setShowAcePromptModal] = useState(false)
  const [hasCompletedAceMatch, setHasCompletedAceMatch] = useState(false)
  const [aceThomasId, setAceThomasId] = useState<string | null>(null)
  const [aceAdaId, setAceAdaId] = useState<string | null>(null)
  const [aceThomasBackup, setAceThomasBackup] = useState<Player | null>(null)
  const [aceAdaBackup, setAceAdaBackup] = useState<Player | null>(null)
  const [aceFirstAttackerBackup, setAceFirstAttackerBackup] = useState<string | null>(null)
  const [aceWinnerTeam, setAceWinnerTeam] = useState<Team | null>(null)
  const [aceWinnersMap, setAceWinnersMap] = useState<Record<string, "win" | "lose">>({})
  const [aceRoundLog, setAceRoundLog] = useState<AceRoundLogEntry[]>([])
  const [aceVictoryOverlay, setAceVictoryOverlay] = useState<{
    winnerTeamName: string
    acePlayerName: string
    teamColor: "thomas" | "ada"
  } | null>(null)
  const [showAceRematchPrompt, setShowAceRematchPrompt] = useState(false)
  const [showAceProceedButton, setShowAceProceedButton] = useState(false)
  const [aceModalInitialStep, setAceModalInitialStep] = useState<"prompt" | "method_select">("prompt")
  const [aceModalStep, setAceModalStep] = useState<
    | "prompt"
    | "method_select"
    | "manual_select"
    | "random_slot"
    | "matched_balance_team_pick"
    | "matched_balance_slot"
  >("prompt")
  const [aceModalSync, setAceModalSync] = useState<AceModalSyncState>(
    DEFAULT_ACE_MODAL_SYNC,
  )
  const [viewerAceModalSync, setViewerAceModalSync] =
    useState<AceModalSyncState | null>(null)
  const [aceRematchExcludedIds, setAceRematchExcludedIds] = useState<string[]>(
    [],
  )
  const [aceModalOpenKey, setAceModalOpenKey] = useState(0)

  const [isLoaded, setIsLoaded] = useState(false)
  const [viewerSessionEndReason, setViewerSessionEndReason] =
    useState<ViewerSessionEndReason | null>(null)
  const [lastScoredKills, setLastScoredKills] = useState<number | null>(null)
  const [lastScoredPlayerId, setLastScoredPlayerId] =
    useState<string | null>(null)

  useEffect(() => {
    const reason = consumeViewerSessionEndedNotice()
    if (reason) setViewerSessionEndReason(reason)
  }, [])

  const syncState = useMemo<ScoreboardSyncState>(
    () => ({
      mode: "4v4",
      thomas,
      ada,
      killerBans,
      fearlessEnabled,
      thomasName,
      adaName,
      firstAttackerId,
      ace: {
        isActive: isAceMatchMode,
        hasCompleted: hasCompletedAceMatch,
        thomasId: aceThomasId,
        adaId: aceAdaId,
        thomasBackup: aceThomasBackup,
        adaBackup: aceAdaBackup,
        firstAttackerBackup: aceFirstAttackerBackup,
        winnerTeam: aceWinnerTeam,
        winnersMap: aceWinnersMap,
        roundLog: aceRoundLog,
        showProceedButton: resolveShouldShowAceProceedDock(
          isAceMatchMode,
          thomas,
          ada,
          thomasName,
          adaName,
          firstAttackerId,
          hasCompletedAceMatch,
          showAcePromptModal,
          showAceRematchPrompt,
        ),
        showRematchPrompt: showAceRematchPrompt,
        ...(showAcePromptModal
          ? aceModalSyncToSetup(aceModalSync)
          : CLOSED_ACE_SETUP),
      },
      pickerUi,
    }),
    [
      aceAdaBackup,
      aceAdaId,
      aceFirstAttackerBackup,
      aceModalSync,
      aceRoundLog,
      aceThomasBackup,
      aceThomasId,
      aceWinnerTeam,
      aceWinnersMap,
      ada,
      adaName,
      firstAttackerId,
      hasCompletedAceMatch,
      isAceMatchMode,
      killerBans,
      fearlessEnabled,
      pickerUi,
      showAceRematchPrompt,
      showAcePromptModal,
      thomas,
      thomasName,
    ],
  )

  const applyRemoteState = useCallback((remote: ScoreboardSyncState) => {
    if (remote.mode !== "4v4") return

    const previous = remotePlayersRef.current
    if (previous) {
      const previousById = new Map(
        [...previous.thomas, ...previous.ada].map((player) => [player.id, player]),
      )
      for (const next of [...remote.thomas, ...remote.ada]) {
        const prev = previousById.get(next.id)
        if (prev && !prev.played && next.played) {
          setLastScoredPlayerId(next.id)
          setLastScoredKills(next.kills)
        }
      }

      const patch = buildScoreAnimationPatch(
        [...previous.thomas, ...previous.ada],
        [...remote.thomas, ...remote.ada],
        animRef.current,
        prevKillsRef.current,
        "four-v-four",
      )
      animRef.current = patch.anim
      prevKillsRef.current = patch.prevKillsMap
      setAnim(patch.anim)
      setPrevKillsMap(patch.prevKillsMap)
    } else {
      animRef.current = {}
      prevKillsRef.current = {}
      setAnim({})
      setPrevKillsMap({})
    }

    remotePlayersRef.current = {
      thomas: remote.thomas,
      ada: remote.ada,
    }
    setThomas(remote.thomas)
    setAda(remote.ada)
    setKillerBans(remote.killerBans)
    setFearlessEnabled(remote.fearlessEnabled)
    setPickerUi(remote.pickerUi)
    setThomasName(remote.thomasName)
    setAdaName(remote.adaName)
    setFirstAttackerId(
      resolveFirstAttackerId(
        remote.firstAttackerId,
        remote.thomas,
        remote.ada,
      ),
    )
    setIsAceMatchMode(remote.ace.isActive)
    setHasCompletedAceMatch(remote.ace.hasCompleted)
    setAceThomasId(remote.ace.thomasId)
    setAceAdaId(remote.ace.adaId)
    setAceThomasBackup(remote.ace.thomasBackup)
    setAceAdaBackup(remote.ace.adaBackup)
    setAceFirstAttackerBackup(remote.ace.firstAttackerBackup)
    setAceWinnerTeam(remote.ace.winnerTeam)
    setAceWinnersMap(remote.ace.winnersMap)
    setAceRoundLog(normalizeAceRoundLog(remote.ace.roundLog))
    setShowAceProceedButton(remote.ace.showProceedButton)
    setShowAceRematchPrompt(remote.ace.showRematchPrompt)
    setViewerAceModalSync(aceSetupToModalSync(remote.ace))
    setRemoveMode(null)
  }, [])

  useEffect(() => {
    if (!showAcePromptModal) {
      setAceModalSync(DEFAULT_ACE_MODAL_SYNC)
      return
    }
    setAceModalSync({
      ...DEFAULT_ACE_MODAL_SYNC,
      step: aceModalInitialStep,
      excludedIds: buildExcludedIdsFromList(aceRematchExcludedIds),
    })
  }, [aceModalInitialStep, aceRematchExcludedIds, showAcePromptModal])

  const sync = useScoreboardRoom({
    gameMode: "4v4",
    enabled: isLoaded,
    state: syncState,
    onRemoteState: applyRemoteState,
  })
  const isViewer = sync.role === "viewer"
  const allPicks = useMemo(
    () => flattenFearlessPicks(thomas, ada),
    [thomas, ada],
  )
  const activePickerContext = useMemo<KillerPickerContext | null>(() => {
    if (!pickerContext) return null
    if (pickerContext.mode === "catalog") return pickerContext

    const roster = pickerContext.team === "thomas" ? thomas : ada
    const player = roster.find((candidate) => candidate.id === pickerContext.playerId)
    if (!player) return null

    const picks = player.killerPicks ?? []
    if (
      pickerContext.slotIndex !== null &&
      pickerContext.slotIndex > picks.length
    ) {
      return null
    }

    return {
      ...pickerContext,
      playerName: player.name,
      currentKillerId:
        pickerContext.slotIndex !== null &&
        pickerContext.slotIndex < picks.length
          ? picks[pickerContext.slotIndex]?.killerId
          : undefined,
    }
  }, [ada, pickerContext, thomas])
  const viewerPickerTeamCatalogTeamLabel = useMemo(() => {
    if (!isViewer || !activePickerContext || activePickerContext.mode === "catalog") {
      return undefined
    }
    return activePickerContext.team === "thomas"
      ? thomasName.trim() || "토마스"
      : adaName.trim() || "아다"
  }, [activePickerContext, adaName, isViewer, thomasName])
  const { hidden: utilityUiHidden, toggle: toggleUtilityUi } = useUtilityUiHidden()

  useEffect(() => {
    if (pickerContext && !activePickerContext) setPickerContext(null)
  }, [activePickerContext, pickerContext])

  useEffect(() => {
    if (!utilityUiHidden) return
    setShowResetMenu(false)
    setShowResetConfirm(false)
    setShowKillerResetConfirm(false)
    setShowRosterResetConfirm(false)
    setShowFullResetConfirm(false)
    setShowModeSwitchConfirm(false)
  }, [utilityUiHidden])

  useEffect(() => {
    if (!isViewer) remotePlayersRef.current = null
  }, [isViewer])

  // 최초 접속 시 설명서 유도 팝업/글로우 표시 여부
  const [hasSeenGuide, setHasSeenGuide] = useState(true)

  useEffect(() => {
    try {
      const seen = localStorage.getItem(GUIDE_SEEN_4V4_KEY)
      if (!seen) setHasSeenGuide(false)
    } catch {
      // ignore
    }
  }, [])

  function markGuideSeen() {
    if (!hasSeenGuide) {
      setHasSeenGuide(true)
      try {
        localStorage.setItem(GUIDE_SEEN_4V4_KEY, "true")
      } catch {
        // ignore
      }
    }
  }

  const [hasSeenAceRedoHint, setHasSeenAceRedoHint] = useState(true)

  useEffect(() => {
    try {
      const seen = localStorage.getItem(ACE_REDO_HINT_SEEN_KEY)
      if (!seen) setHasSeenAceRedoHint(false)
    } catch {
      // ignore
    }
  }, [])

  function dismissAceRedoHint() {
    setHasSeenAceRedoHint(true)
    try {
      localStorage.setItem(ACE_REDO_HINT_SEEN_KEY, "true")
    } catch {
      // ignore
    }
  }

  const [hasSeenDragHint, setHasSeenDragHint] = useState(true)

  useEffect(() => {
    try {
      const seen = localStorage.getItem(DRAG_HINT_SEEN_4V4_KEY)
      if (!seen) setHasSeenDragHint(false)
    } catch {
      // ignore
    }
  }, [])

  function dismissDragHint() {
    if (!hasSeenDragHint) {
      setHasSeenDragHint(true)
      try {
        localStorage.setItem(DRAG_HINT_SEEN_4V4_KEY, "true")
      } catch {
        // ignore
      }
    }
  }

  function closeAllGuideUI() {
    setShowGuideMenu(false)
    setShowGuide(null)
  }

  const handleOpenGuide = () => {
    closeAllResetUI()
    setShowModeSwitchConfirm(false)
    if (!hasSeenGuide) {
      markGuideSeen()
      setShowGuideMenu(false)
      setShowGuide("fearless")
      return
    }
    setShowGuideMenu((wasOpen) => !wasOpen)
  }

  const openGuideView = (type: "basic" | "fearless") => {
    setShowGuideMenu(false)
    setShowGuide(type)
    markGuideSeen()
  }

  // 마운트 후 localStorage에서 저장된 점수 복원 (hydration 이후에만 실행)
  useEffect(() => {
    try {
      if (sessionStorage.getItem(MODE_SWITCH_SESSION_KEY)) {
        sessionStorage.removeItem(MODE_SWITCH_SESSION_KEY)
        setIsLoaded(true)
        return
      }
    } catch {
      // ignore
    }

    // 시청자는 Firebase 원격 상태만 따르도록 로컬 solo 저장값을 복원하지 않는다.
    const viewerSession = loadRoomSession(sessionStorage, VIEWER_SESSION_KEY)
    if (viewerSession?.gameMode === "4v4") {
      setIsLoaded(true)
      return
    }

    const saved = loadFromStorage()
    if (saved) {
      if (Array.isArray(saved.thomas)) setThomas(saved.thomas)
      if (Array.isArray(saved.ada)) setAda(saved.ada)
      teamNameLinked.current = {
        thomas: Boolean(saved.thomas?.[0]?.name?.trim()),
        ada: Boolean(saved.ada?.[0]?.name?.trim()),
      }
      setKillerBans(saved.killerBans)
      setFearlessEnabled(true)
      if (saved.thomasName) setThomasName(saved.thomasName)
      if (saved.adaName) setAdaName(saved.adaName)
      if (saved.firstAttackerId !== undefined) setFirstAttackerId(saved.firstAttackerId)
      if (saved.ace) {
        setIsAceMatchMode(saved.ace.isActive)
        setHasCompletedAceMatch(saved.ace.hasCompleted)
        setAceThomasId(saved.ace.thomasId)
        setAceAdaId(saved.ace.adaId)
        setAceThomasBackup(saved.ace.thomasBackup)
        setAceAdaBackup(saved.ace.adaBackup)
        setAceFirstAttackerBackup(saved.ace.firstAttackerBackup)
        setAceWinnerTeam(saved.ace.winnerTeam)
        setAceWinnersMap(saved.ace.winnersMap)
        setAceRoundLog(normalizeAceRoundLog(saved.ace.roundLog))
        setShowAceProceedButton(saved.ace.showProceedButton)
      }
    }
    setIsLoaded(true)
  }, [])

  // localStorage 자동 저장 — 복원이 완료(isLoaded === true)된 이후에만 동기화
  useEffect(() => {
    if (!isLoaded || isViewer) return
    try {
      const now = Date.now()
      localStorage.setItem(
        LS_KEY,
        JSON.stringify({ ...syncState, updatedAt: now })
      )
      localStorage.setItem("dbd-last-mode", "4v4")
      localStorage.setItem("dbd-last-mode-time", now.toString())
    } catch {
      // 저장 실패 시 무시
    }
  }, [isLoaded, isViewer, syncState])

  // "다음 플레이어" 계산: 로스터·선공 기준 이상적 교대 순서에서 미출전 선수 중 가장 앞을 찾는다.
  const firstAttackTeam: Team | null = useMemo(() => {
    if (!firstAttackerId) return null
    if (thomas.some((p) => p.id === firstAttackerId)) return "thomas"
    if (ada.some((p) => p.id === firstAttackerId)) return "ada"
    return null
  }, [firstAttackerId, thomas, ada])

  const nextExpectedPlayer = useMemo(
    () =>
      isAceMatchMode
        ? null
        : getNextExpectedPlayer(thomas, ada, firstAttackTeam, firstAttackerId),
    [thomas, ada, firstAttackTeam, firstAttackerId, isAceMatchMode],
  )

  const turn: Team | null = useMemo(() => {
    if (isAceMatchMode) {
      return computeTurnByPlayCount(thomas, ada, firstAttackTeam)
    }
    return nextExpectedPlayer?.team ?? null
  }, [isAceMatchMode, thomas, ada, firstAttackTeam, nextExpectedPlayer])

  const leftTarget = useMemo(() => {
    if (isAceMatchMode && aceThomasId) {
      const p = thomas.find((item) => item.id === aceThomasId)
      return p && p.played ? p.kills : 0
    }
    return teamScore(thomas)
  }, [thomas, isAceMatchMode, aceThomasId])

  const rightTarget = useMemo(() => {
    if (isAceMatchMode && aceAdaId) {
      const p = ada.find((item) => item.id === aceAdaId)
      return p && p.played ? p.kills : 0
    }
    return teamScore(ada)
  }, [ada, isAceMatchMode, aceAdaId])

  const displayThomas = useMemo(() => {
    if (isAceMatchMode && aceThomasId) {
      const ace = thomas.find((p) => p.id === aceThomasId)
      if (ace) {
        return [ace, ...thomas.filter((p) => p.id !== aceThomasId)]
      }
    }
    return thomas
  }, [thomas, isAceMatchMode, aceThomasId])

  const displayAda = useMemo(() => {
    if (isAceMatchMode && aceAdaId) {
      const ace = ada.find((p) => p.id === aceAdaId)
      if (ace) {
        return [ace, ...ada.filter((p) => p.id !== aceAdaId)]
      }
    }
    return ada
  }, [ada, isAceMatchMode, aceAdaId])

  const leftScore = useCountUp(leftTarget)
  const rightScore = useCountUp(rightTarget)

  const cold = useMemo(
    () => computeCold(thomas, ada, turn, thomasName, adaName),
    [thomas, ada, turn, thomasName, adaName],
  )

  const diff = leftTarget - rightTarget
  const bothTeamsPlayed = thomas.some((p) => p.played) && ada.some((p) => p.played)
  const isGameOver = cold.status === "cold" || cold.status === "gameover"

  const isTie = isGameOver && diff === 0
  const close = (!isGameOver || isTie) && Math.abs(diff) <= 2
  const orangeLit = isGameOver ? (isTie || diff > 0) : bothTeamsPlayed && (close || diff > 0)
  const blueLit = isGameOver ? (isTie || diff < 0) : bothTeamsPlayed && (close || diff < 0)

  const bothAcePlayed = useMemo(() => {
    if (!isAceMatchMode || !aceThomasId || !aceAdaId) return false
    const tAce = thomas.find((p) => p.id === aceThomasId)
    const aAce = ada.find((p) => p.id === aceAdaId)
    return Boolean(tAce?.played && aAce?.played)
  }, [isAceMatchMode, aceThomasId, aceAdaId, thomas, ada])

  // Ace match: keep clutch FX until decided; then dim the loser like 4v4 defeat.
  // After exiting ace match back to 4v4, keep dimming the ace-losing team.
  const isAceResolved = isAceMatchMode && bothAcePlayed
  const isAceTie = isAceResolved && diff === 0
  const isAceWinnerDecided = isAceResolved && diff !== 0
  const showAceMatchDock =
    isAceMatchMode && !showAceRematchPrompt
  const showAceRedoInDock = showAceMatchDock && !bothAcePlayed && !aceVictoryOverlay
  const showAceExitInDock =
    showAceMatchDock && (!bothAcePlayed || isAceWinnerDecided)
  const showAceOutcomeOnMain =
    !isAceMatchMode && hasCompletedAceMatch && aceWinnerTeam !== null
  const shouldShowAceProceedDock = useMemo(
    () =>
      resolveShouldShowAceProceedDock(
        isAceMatchMode,
        thomas,
        ada,
        thomasName,
        adaName,
        firstAttackerId,
        hasCompletedAceMatch,
        showAcePromptModal,
        showAceRematchPrompt,
      ),
    [
      isAceMatchMode,
      thomas,
      ada,
      thomasName,
      adaName,
      firstAttackerId,
      hasCompletedAceMatch,
      showAcePromptModal,
      showAceRematchPrompt,
    ],
  )
  const isGameOverDisplay = isAceMatchMode
    ? isAceResolved
    : showAceOutcomeOnMain
      ? true
      : isGameOver
  const orangeLitDisplay = isAceMatchMode
    ? isAceResolved
      ? isAceTie || diff > 0
      : true
    : showAceOutcomeOnMain
      ? aceWinnerTeam === "thomas"
      : orangeLit
  const blueLitDisplay = isAceMatchMode
    ? isAceResolved
      ? isAceTie || diff < 0
      : true
    : showAceOutcomeOnMain
      ? aceWinnerTeam === "ada"
      : blueLit
  const closeDisplay = isAceMatchMode
    ? !isAceWinnerDecided
    : showAceOutcomeOnMain
      ? false
      : close

  const [showOverlay, setShowOverlay] = useState(false)

  const isComebackWin = useMemo(() => {
    if (isAceMatchMode) return false
    if (cold.status !== "gameover" || cold.isCold || cold.winnerName === "tie") return false
    return detectComebackWin(thomas, ada, lastScoredPlayerId)
  }, [cold, thomas, ada, lastScoredPlayerId, isAceMatchMode])

  // 1:1 Ace Match Notification Warning Logic
  const aceMatchWarning = useMemo(() => {
    if (!isAceMatchMode || !aceThomasId || !aceAdaId) return null
    const tPlayer = thomas.find((p) => p.id === aceThomasId)
    const aPlayer = ada.find((p) => p.id === aceAdaId)
    if (!tPlayer || !aPlayer) return null

    const getWarningData = (activeP: Player, targetP: Player, targetTeam: Team) => {
      const targetName = targetP.name.trim() || (targetTeam === "thomas" ? thomasName : adaName)
      const notice = buildAceMatchNotice(activeP.kills)

      return {
        name: targetName,
        team: targetTeam,
        killText: notice.killText,
        suffix: notice.suffix,
      }
    }

    if (tPlayer.played && !aPlayer.played) {
      return getWarningData(tPlayer, aPlayer, "ada")
    }

    if (aPlayer.played && !tPlayer.played) {
      return getWarningData(aPlayer, tPlayer, "thomas")
    }

    return null
  }, [isAceMatchMode, aceThomasId, aceAdaId, thomas, ada, thomasName, adaName])

  // Ace Match Completion Detection (With skull impact animation delay)
  useEffect(() => {
    if (!isAceMatchMode || !aceThomasId || !aceAdaId) return

    const thomasAce = thomas.find((p) => p.id === aceThomasId)
    const adaAce = ada.find((p) => p.id === aceAdaId)
    if (!thomasAce || !adaAce) return

    const bothPlayed = thomasAce.played && adaAce.played

    if (!bothPlayed) {
      aceOutcomeAnnouncedKeyRef.current = null
      aceAnnouncedKillsRef.current = null
      setAceWinnersMap((prev) =>
        prev[aceThomasId] || prev[aceAdaId] ? {} : prev,
      )
      setAceWinnerTeam(null)
      setAceVictoryOverlay(null)
      setShowAceRematchPrompt(false)
      return
    }

    const isTie = thomasAce.kills === adaAce.kills
    const outcomeKey = buildAceRoundLogKey(
      aceThomasId,
      aceAdaId,
      thomasAce.kills,
      adaAce.kills,
    )

    const announcedKills = aceAnnouncedKillsRef.current
    const killsUnchanged =
      announcedKills !== null &&
      announcedKills.thomas === thomasAce.kills &&
      announcedKills.ada === adaAce.kills

    if (killsUnchanged && aceOutcomeAnnouncedKeyRef.current === outcomeKey) {
      if (isTie && showAceRematchPrompt) return
      if (!isTie && aceWinnerTeam !== null) return
    }

    if (isTie && showAceRematchPrompt && killsUnchanged) {
      return
    }

    if (!isTie && showAceRematchPrompt) {
      setShowAceRematchPrompt(false)
    }

    if (isTie) {
      setAceWinnersMap((prev) =>
        prev[aceThomasId] || prev[aceAdaId] ? {} : prev,
      )
      setAceWinnerTeam(null)
      setAceVictoryOverlay(null)
      setHasCompletedAceMatch(false)
    }

    const kills = lastScoredKills ?? 0
    let delayMs = 600
    if (kills === 1) delayMs = 900
    else if (kills === 2) delayMs = 1250
    else if (kills === 3) delayMs = 1650
    else if (kills === 3.5) delayMs = 2100
    else if (kills >= 4) delayMs = 2400

    const timer = setTimeout(() => {
      const roundKey = outcomeKey
      const markAnnounced = () => {
        aceOutcomeAnnouncedKeyRef.current = outcomeKey
        aceAnnouncedKillsRef.current = {
          thomas: thomasAce.kills,
          ada: adaAce.kills,
        }
      }
      const firstAttackerTeam =
        firstAttackerId === aceThomasId
          ? "thomas"
          : firstAttackerId === aceAdaId
            ? "ada"
            : undefined
      const logRound = (outcome: "tie" | "thomas" | "ada") => {
        setAceRoundLog((prev) =>
          appendAceRoundLogEntry(
            prev,
            roundKey,
            createAceRoundLogEntry(
              thomasAce,
              adaAce,
              outcome,
              firstAttackerTeam,
            ),
          ),
        )
      }

      if (thomasAce.kills > adaAce.kills) {
        logRound("thomas")
        setShowAceRematchPrompt(false)
        setAceWinnersMap((prev) => ({
          ...prev,
          [thomasAce.id]: "win",
          [adaAce.id]: "lose",
        }))
        setAceWinnerTeam("thomas")
        setAceVictoryOverlay({
          winnerTeamName: thomasName,
          acePlayerName: thomasAce.name || "에이스",
          teamColor: "thomas",
        })
        markAnnounced()
        // Keep isAceMatchMode true while victory overlay is playing!
      } else if (adaAce.kills > thomasAce.kills) {
        logRound("ada")
        setShowAceRematchPrompt(false)
        setAceWinnersMap((prev) => ({
          ...prev,
          [adaAce.id]: "win",
          [thomasAce.id]: "lose",
        }))
        setAceWinnerTeam("ada")
        setAceVictoryOverlay({
          winnerTeamName: adaName,
          acePlayerName: adaAce.name || "에이스",
          teamColor: "ada",
        })
        markAnnounced()
        // Keep isAceMatchMode true while victory overlay is playing!
      } else {
        logRound("tie")
        setAceWinnersMap({})
        setAceWinnerTeam(null)
        setAceVictoryOverlay(null)
        setHasCompletedAceMatch(false)
        setShowAceRematchPrompt(true)
        markAnnounced()
      }
    }, delayMs)

    return () => clearTimeout(timer)
  }, [isAceMatchMode, aceThomasId, aceAdaId, thomas, ada, thomasName, adaName, lastScoredKills, firstAttackerId, showAceRematchPrompt, aceWinnerTeam])

  const handleAceVictoryDismiss = () => {
    setAceVictoryOverlay(null)
    setHasCompletedAceMatch(true)
  }

  const handleConfirmAceMatch = (
    selectedThomasId: string,
    selectedAdaId: string,
    excludedIds: string[] = [],
  ) => {
    aceOutcomeAnnouncedKeyRef.current = null
    aceAnnouncedKillsRef.current = null
    setShowAcePromptModal(false)
    // Replace (don't merge previous): manual re-includes must stick across rematches.
    setAceRematchExcludedIds(
      buildNextAceRematchExcludedIds(excludedIds, [
        selectedThomasId,
        selectedAdaId,
      ]),
    )
    setShowAceProceedButton(false)
    setHasCompletedAceMatch(true)

    // Save exact 4v4 scores & first attacker before resetting for 1v1 match
    const tOriginal = thomas.find((p) => p.id === selectedThomasId)
    const aOriginal = ada.find((p) => p.id === selectedAdaId)
    if (tOriginal) setAceThomasBackup({ ...tOriginal })
    if (aOriginal) setAceAdaBackup({ ...aOriginal })
    setAceFirstAttackerBackup(firstAttackerId)

    setAceThomasId(selectedThomasId)
    setAceAdaId(selectedAdaId)
    setIsAceMatchMode(true)
    setFirstAttackerId(null) // Reset coin toss / first attacker for Ace match!

    // Reset scores of the 2 selected Ace players to 0 for 1v1 match
    setThomas((prev) =>
      prev.map((p) => (p.id === selectedThomasId ? { ...p, kills: 0, played: false } : p))
    )
    setAda((prev) =>
      prev.map((p) => (p.id === selectedAdaId ? { ...p, kills: 0, played: false } : p))
    )
  }

  const handleExitAceMatch = () => {
    const exitedBeforeAceScoring = !aceMatchHasAnyScoring(
      thomas,
      ada,
      aceThomasId,
      aceAdaId,
    )

    applyAceFourVFourRestore(
      aceThomasBackup,
      aceAdaBackup,
      aceFirstAttackerBackup,
      setThomas,
      setAda,
      setFirstAttackerId,
    )

    setIsAceMatchMode(false)
    setAceThomasId(null)
    setAceAdaId(null)
    setAceThomasBackup(null)
    setAceAdaBackup(null)
    setAceFirstAttackerBackup(null)
    setAceRematchExcludedIds([])

    if (exitedBeforeAceScoring) {
      setHasCompletedAceMatch(false)
      setShowAceProceedButton(true)
    } else {
      setHasCompletedAceMatch(true)
      setShowAceProceedButton(false)
      setOverlayDismissed(true)
      setShowOverlay(false)
    }
  }

  const handleRedoAceMemberSelection = () => {
    aceOutcomeAnnouncedKeyRef.current = null
    aceAnnouncedKillsRef.current = null
    const previousThomasId = aceThomasId
    const previousAdaId = aceAdaId

    applyAceFourVFourRestore(
      aceThomasBackup,
      aceAdaBackup,
      aceFirstAttackerBackup,
      setThomas,
      setAda,
      setFirstAttackerId,
    )

    setIsAceMatchMode(false)
    setAceThomasId(null)
    setAceAdaId(null)
    setAceThomasBackup(null)
    setAceAdaBackup(null)
    setAceFirstAttackerBackup(null)
    setAceRematchExcludedIds((previous) =>
      previous.filter(
        (id) => id !== previousThomasId && id !== previousAdaId,
      ),
    )
    setShowAceRematchPrompt(false)
    setShowAceProceedButton(false)
    setHasCompletedAceMatch(false)
    // Keep the existing 4v4 tie outcome; do not replay the announce overlay.
    setOverlayDismissed(true)
    setShowOverlay(false)
    prevGameoverWinnerRef.current = "tie"
    setAceModalOpenKey((value) => value + 1)
    setAceModalInitialStep("method_select")
    setShowAcePromptModal(true)
  }

  // 점수 수정 등으로 경기 결과가 무승부로 바뀌면 무승부 오버레이·에이스 결정전 안내를 다시 띄운다.
  useEffect(() => {
    if (!isLoaded) return
    if (isAceMatchMode || hasCompletedAceMatch) {
      prevGameoverWinnerRef.current =
        cold.status === "gameover" ? cold.winnerName : null
      return
    }

    const currentWinner =
      cold.status === "gameover" ? cold.winnerName : null
    const prevWinner = prevGameoverWinnerRef.current

    if (prevWinner === undefined) {
      prevGameoverWinnerRef.current = currentWinner
      return
    }

    if (currentWinner === "tie" && prevWinner !== "tie" && prevWinner !== null) {
      setOverlayDismissed(false)
      setShowOverlay(true)
      setShowAceProceedButton(false)
      setShowAcePromptModal(false)
      setOverlayOutcomeKey((value) => value + 1)
    }

    prevGameoverWinnerRef.current = currentWinner
  }, [cold, isAceMatchMode, hasCompletedAceMatch, isLoaded])

  // cold/gameover 발생 시 킬 점수(0~4킬)에 맞는 동적 애니메이션 대기시간 후 우승 오버레이 표시
  // 0킬: 600ms, 1킬: 900ms, 2킬: 1250ms, 3킬: 1650ms, 3.5킬: 2100ms, 4킬: 2400ms (해골이 완전히 박힌 후 여유 있게 재생)
  useEffect(() => {
    if (isAceMatchMode) return
    // 멤버 다시 선택 등으로 이미 에결 모달이 열려 있거나 오버레이를 닫은 상태면 재재생하지 않음
    if (showAcePromptModal || overlayDismissed) return
    if (cold.status === "cold" || cold.status === "gameover") {
      const kills = lastScoredKills ?? 0
      let delayMs = 600
      if (kills === 1) delayMs = 900
      else if (kills === 2) delayMs = 1250
      else if (kills === 3) delayMs = 1650
      else if (kills === 3.5) delayMs = 2100
      else if (kills >= 4) delayMs = 2400

      const timer = setTimeout(() => {
        setShowOverlay(true)
      }, delayMs)
      return () => clearTimeout(timer)
    } else {
      setShowOverlay(false)
      setOverlayDismissed(false)
    }
  }, [
    cold.status,
    lastScoredKills,
    isAceMatchMode,
    showAcePromptModal,
    overlayDismissed,
  ])

  // 현재 turn 팀의 다음 플레이어 ID
  const nextPlayerId = useMemo(() => {
    if (!isAceMatchMode && nextExpectedPlayer) {
      return {
        thomas:
          nextExpectedPlayer.team === "thomas"
            ? nextExpectedPlayer.playerId
            : null,
        ada:
          nextExpectedPlayer.team === "ada"
            ? nextExpectedPlayer.playerId
            : null,
      }
    }

    const resolve = (team: Team): string | null => {
      if (turn !== team) return null
      const roster = team === "thomas" ? thomas : ada
      const unplayed = roster.filter((p) => !p.played)
      if (unplayed.length === 0) return null

      const teamPlayedCount = roster.filter((p) => p.played).length
      if (
        teamPlayedCount === 0 &&
        firstAttackerId &&
        firstAttackTeam === team &&
        roster.some((p) => p.id === firstAttackerId && !p.played)
      ) {
        return firstAttackerId
      }

      return unplayed[0]?.id ?? null
    }

    return {
      thomas: resolve("thomas"),
      ada: resolve("ada"),
    }
  }, [
    turn,
    thomas,
    ada,
    firstAttackerId,
    firstAttackTeam,
    isAceMatchMode,
    nextExpectedPlayer,
  ])

  const dragItem = useRef<{ team: Team; id: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // 점수가 한 명이라도 입력된 경우 셔플 버튼 잠금
  const hasAnyScore = thomas.some((p) => p.played) || ada.some((p) => p.played)

  useEffect(() => {
    if (hasAnyScore) setShowAuctionModal(false)
  }, [hasAnyScore])

  function record(team: Team, playerId: string, newKills: number, animate: boolean) {
    if (isViewer) return
    setLastScoredKills(newKills)
    setLastScoredPlayerId(playerId)
    const roster = team === "thomas" ? thomas : ada
    const setTeam = team === "thomas" ? setThomas : setAda
    const current = roster.find((p) => p.id === playerId)?.kills ?? 0

    setTeam((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, kills: newKills, played: true } : p,
      ),
    )

    if (animate && newKills !== current) {
      // 점수를 다시 선택하면 기존 값과 관계없이 첫 해골부터 전체 애니메이션을 재생한다.
      setPrevKillsMap((prev) => ({ ...prev, [playerId]: 0 }))
      setAnim((a) => ({ ...a, [playerId]: (a[playerId] ?? 0) + 1 }))
    }
    setFirstAttackerId((prev) => prev ?? playerId)
  }

  function handleScore(team: Team, playerId: string, newKills: number) {
    record(team, playerId, newKills, true)
  }

  function handleZeroKill(team: Team, playerId: string) {
    if (team === "thomas") setLeftBump((b) => b + 1)
    else setRightBump((b) => b + 1)
    record(team, playerId, 0, false)
  }

  function handleCancel(team: Team, playerId: string) {
    if (isViewer) return
    // 같은 스코어를 다시 눌러 취소 — kills를 0으로 되돌리고 played를 false로 해제
    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, kills: 0, played: false } : p,
      ),
    )
    setAnim((a) => ({ ...a, [playerId]: 0 }))
    setPrevKillsMap((prev) => { const next = { ...prev }; delete next[playerId]; return next })

    if (isAceMatchMode) {
      const aceThomas = thomas.find((p) => p.id === aceThomasId)
      const aceAda = ada.find((p) => p.id === aceAdaId)
      const isThomasAceCancelled = playerId === aceThomasId
      const isAdaAceCancelled = playerId === aceAdaId

      const thomasAcePlayed = isThomasAceCancelled ? false : (aceThomas?.played ?? false)
      const adaAcePlayed = isAdaAceCancelled ? false : (aceAda?.played ?? false)

      if (!thomasAcePlayed && !adaAcePlayed) {
        setFirstAttackerId(null)
      }
    } else {
      const otherPlayedInThomas = thomas.some((p) => p.id !== playerId && p.played)
      const otherPlayedInAda = ada.some((p) => p.id !== playerId && p.played)
      if (!otherPlayedInThomas && !otherPlayedInAda) {
        setFirstAttackerId(null)
      }
    }
  }

  function reorder(team: Team, fromId: string, toId: string) {
    if (isViewer) return
    if (fromId === toId) return
    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((prev) => {
      const from = prev.findIndex((p) => p.id === fromId)
      const to = prev.findIndex((p) => p.id === toId)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      if (firstAttackTeam === team && next.length > 0 && !hasAnyScore) {
        setFirstAttackerId(next[0].id)
      }
      return next
    })
  }

  function handleDragEnter(team: Team, targetId: string) {
    const item = dragItem.current
    if (!item || item.team !== team) return
    dismissDragHint()
    reorder(team, item.id, targetId)
  }

  function shuffleTeam(team: Team) {
    if (isViewer) return
    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((prev) => {
      const shuffled = [...prev]
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1))
        ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]]
      }
      if (firstAttackTeam === team && shuffled.length > 0 && !hasAnyScore) {
        setFirstAttackerId(shuffled[0].id)
      }
      return shuffled
    })
  }

  function addPlayer(team: Team) {
    if (isViewer) return
    const roster = team === "thomas" ? thomas : ada
    if (roster.length >= MAX_PLAYERS_PER_TEAM) return

    playerId.current += 1
    const player: Player = {
      id: `${team}-${Date.now()}-${playerId.current}`,
      name: "",
      kills: 0,
      played: false,
    }
    const setTeam = team === "thomas" ? setThomas : setAda
    // 팀이 비어있었다면 (첫 팀원 추가), teamNameLinked를 false로 리셋해서
    // 첫 팀원의 이름이 팀명으로 연동될 수 있게 함
    if (roster.length === 0) {
      teamNameLinked.current[team] = false
    }
    setTeam((prev) => [...prev, player])
    setRemoveMode(null)
  }

  function closeKillerPicker() {
    setPickerContext(null)
    if (!isViewer) {
      setPickerUi((current) => clearPickerSelection(current))
    }
  }

  const handlePickerSelectionSync = (killerId: string | null) => {
    setPickerUi((current) => nextPickerSelection(current, killerId))
  }

  const handlePickerFeedbackSync = (
    killerId: string,
    kind: PickerFeedbackKind,
  ) => {
    setPickerUi((current) => nextPickerFeedback(current, killerId, kind))
  }

  function openKillerCatalog() {
    closeAllResetUI()
    closeAllGuideUI()
    setShowModeSwitchConfirm(false)
    setPickerContext({
      mode: "catalog",
      team: "thomas",
      playerId: "__catalog__",
      playerName: "",
      slotIndex: null,
    })
  }

  function openKillerPicker(
    team: Team,
    player: Player,
    slotIndex: number | null,
  ) {
    setPickerContext({
      team,
      playerId: player.id,
      playerName: player.name,
      slotIndex,
      currentKillerId:
        slotIndex === null ? undefined : player.killerPicks?.[slotIndex]?.killerId,
    })
  }

  function handleKillerPick(killerId: string) {
    if (isViewer || !activePickerContext) return
    const { team, playerId, slotIndex } = activePickerContext
    const roster = team === "thomas" ? thomas : ada
    const player = roster.find((candidate) => candidate.id === playerId)
    if (!player) {
      setPickerContext(null)
      return
    }

    const nextPlayer = setPlayerKillerPick(
      player,
      killerId,
      slotIndex,
      MAX_FOUR_V_FOUR_FEARLESS_PICKS,
      player.name,
    )
    if (nextPlayer === player) return

    if (team === "thomas") {
      setThomas((current) => {
        const next = current.map((candidate) =>
          candidate.id === playerId
            ? setPlayerKillerPick(
                candidate,
                killerId,
                slotIndex,
                MAX_FOUR_V_FOUR_FEARLESS_PICKS,
                candidate.name,
              )
            : candidate,
        )
        thomasRef.current = next
        return next
      })
    } else {
      setAda((current) => {
        const next = current.map((candidate) =>
          candidate.id === playerId
            ? setPlayerKillerPick(
                candidate,
                killerId,
                slotIndex,
                MAX_FOUR_V_FOUR_FEARLESS_PICKS,
                candidate.name,
              )
            : candidate,
        )
        adaRef.current = next
        return next
      })
    }
    setPickerContext({
      ...activePickerContext,
      slotIndex: slotIndex ?? (player.killerPicks?.length ?? 0),
      currentKillerId: killerId,
    })
  }

  function handleKillerPickCancel() {
    if (
      isViewer ||
      !activePickerContext ||
      activePickerContext.slotIndex === null
    ) {
      return
    }

    const { team, playerId, slotIndex } = activePickerContext
    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((current) =>
      current.map((player) =>
        player.id === playerId
          ? cancelPlayerKillerPick(player, slotIndex)
          : player,
      ),
    )
    setPickerContext({
      ...activePickerContext,
      slotIndex: null,
      currentKillerId: undefined,
    })
  }

  function handleKillerBanToggle(killerId: string) {
    if (isViewer) return
    setKillerBans((current) => toggleKillerBan(current, killerId))
  }

  const renderRow = (team: Team, p: Player, index: number) => {
    const isThomas = team === "thomas"
    const isAcePlayer = isAceMatchMode && (isThomas ? p.id === aceThomasId : p.id === aceAdaId)
    const isNonAcePlayer = isAceMatchMode && !isAcePlayer

    const nextId = team === "thomas" ? nextPlayerId.thomas : nextPlayerId.ada
    const active = isAceMatchMode
      ? (firstAttackerId || firstAttackTeam ? isAcePlayer && turn === team : false)
      : turn === team && p.id === nextId
    const selgong = firstAttackerId != null && p.id === firstAttackerId
    const tabIdx = isThomas ? index + 1 : 5 + index
    const isLastPlayerOverall = team === "ada" && index === ada.length - 1
    const killerControl = fearlessEnabled ? (
      <KillerPickSlots
        playerName={p.name}
        team={team}
        killerPicks={p.killerPicks ?? []}
        maxSlots={MAX_FOUR_V_FOUR_FEARLESS_PICKS}
        extendOutward
        disabled={removeMode === team}
        readOnly={isViewer}
        onOpen={(slotIndex) => openKillerPicker(team, p, slotIndex)}
      />
    ) : undefined
    const killerChangeHandler = fearlessEnabled
      ? () => {}
      : (killer: string) => updatePlayerKiller(team, p.id, killer)

    if (isNonAcePlayer) {
      return (
        <div key={p.id} className="relative opacity-20 pointer-events-none filter blur-[0.5px]">
          <PlayerRow
            player={p}
            team={team}
            active={false}
            readOnly={true}
            isSelgong={false}
            isGoldSkull={false}
            aceBadge={aceWinnersMap[p.id] ?? null}
            tabIndex={tabIdx}
            animId={anim[p.id] ?? 0}
            prevKills={prevKillsMap[p.id] ?? 0}
            dragging={false}
            killerControl={killerControl}
            onScore={() => {}}
            onZeroKill={() => {}}
            onCancel={() => {}}
            onNameChange={() => {}}
            onNameCommit={() => {}}
            onKillerChange={killerChangeHandler}
            onDragStart={() => {}}
            onDragEnter={() => {}}
            onDragEnd={() => {}}
          />
        </div>
      )
    }

    const isOutOfOrder =
      !hasSeenDragHint &&
      !isViewer &&
      !isAceMatchMode &&
      removeMode !== team &&
      isPlayerEnteredOutOfOrder(team === "thomas" ? thomas : ada, index)

    const firstOutOfOrderThomas =
      !hasSeenDragHint && !isViewer && !isAceMatchMode && removeMode !== "thomas"
        ? getFirstOutOfOrderPlayerId(thomas)
        : null

    const firstOutOfOrderAda =
      !hasSeenDragHint && !isViewer && !isAceMatchMode && removeMode !== "ada"
        ? getFirstOutOfOrderPlayerId(ada)
        : null

    const showDragNotice =
      !hasSeenDragHint &&
      !isViewer &&
      !isAceMatchMode &&
      ((team === "thomas" && removeMode !== "thomas" && p.id === firstOutOfOrderThomas) ||
        (team === "ada" && removeMode !== "ada" && p.id === firstOutOfOrderAda))

    return (
      <div key={p.id} className={cn("relative transition-all duration-300", isAcePlayer && "z-20 scale-[1.02] rounded-lg")}>
        <PlayerRow
          player={p}
          team={team}
          active={active}
          isSelgong={selgong && !p.played}
          isGoldSkull={isAceMatchMode}
          aceBadge={aceWinnersMap[p.id] ?? null}
          tabIndex={tabIdx}
          isDragHighlighted={isOutOfOrder}
          onNameKeyDown={(e) => {
            if (isLastPlayerOverall && e.key === "Tab" && !e.shiftKey) {
              e.preventDefault()
              e.currentTarget.blur()
            }
          }}
          animId={anim[p.id] ?? 0}
          prevKills={prevKillsMap[p.id] ?? 0}
          dragging={draggingId === p.id}
          readOnly={isViewer}
          removeMode={!isViewer && removeMode === team}
          killerControl={killerControl}
          onRemove={() => removePlayer(team, p.id)}
          onScore={(nk) => handleScore(team, p.id, nk)}
          onZeroKill={() => handleZeroKill(team, p.id)}
          onCancel={() => handleCancel(team, p.id)}
          onNameChange={(name) => updatePlayerName(team, p.id, name)}
          onNameCommit={(name, previousName) =>
            commitPlayerNameWithMigration(team, p.id, name, previousName)
          }
          onKillerChange={killerChangeHandler}
          onDragStart={() => {
            dismissDragHint()
            dragItem.current = { team, id: p.id }
            setDraggingId(p.id)
          }}
          onDragEnter={() => handleDragEnter(team, p.id)}
          onDragEnd={() => {
            dragItem.current = null
            setDraggingId(null)
          }}
        />
        {showDragNotice && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className={cn(
              "absolute -top-[35px] z-40 flex items-center gap-2 rounded-md border border-dbd-yellow/90 bg-neutral-950/95 px-2.5 py-1.5 text-sm text-dbd-yellow shadow-lg shadow-black/80 backdrop-blur-md whitespace-nowrap select-none",
              isThomas ? "left-0" : "right-0"
            )}
          >
            <span
              className={cn(
                "absolute -bottom-1.5 size-3 rotate-45 border-b border-r border-dbd-yellow/90 bg-neutral-950",
                isThomas ? "right-[41.5px]" : "left-[41.5px]"
              )}
              aria-hidden="true"
            />
            <span
              className="leading-none"
              style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
            >
              드래그해서 위 아래로 움직일 수 있습니다.
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                dismissDragHint()
              }}
              className="ml-0.5 -mr-0.5 flex size-5 items-center justify-center rounded hover:bg-dbd-yellow/20 text-dbd-yellow/80 hover:text-dbd-yellow transition-colors cursor-pointer"
              aria-label="안내 닫기"
              title="닫기"
            >
              <X className="size-3.5" />
            </button>
          </motion.div>
        )}
        {selgong && removeMode !== team && (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`absolute -top-3 z-20 flex items-center gap-1 whitespace-nowrap rounded border border-black/80 bg-dbd-yellow px-1.5 py-px text-[13px] text-black select-none pointer-events-none ${
              isThomas ? "right-3" : "left-3"
            }`}
            style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
          >
            선공
          </motion.span>
        )}
        {active && !selgong && removeMode !== team && (
          <span
            className={`absolute -top-3 z-10 flex items-center gap-1 whitespace-nowrap rounded bg-neutral-950 px-1.5 py-px text-[13px] text-neutral-200 select-none pointer-events-none ${
              isThomas ? "right-3" : "left-3"
            }`}
            style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
          >
            다음 플레이어
          </span>
        )}
        {aceWinnersMap[p.id] === "win" && (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "absolute -top-3 z-30 flex items-center gap-1 whitespace-nowrap rounded border border-amber-300 bg-dbd-yellow px-1.5 py-px text-[13px] text-black tracking-wider shadow-[0_0_12px_rgba(234,179,8,0.7)] select-none pointer-events-none",
              isThomas ? "right-3" : "left-3"
            )}
            style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
          >
            ACE
          </motion.span>
        )}
      </div>
    )
  }

  function removePlayer(team: Team, playerId: string) {
    if (isViewer) return
    const setTeam = team === "thomas" ? setThomas : setAda
    const roster = team === "thomas" ? thomas : ada
    setTeam((prev) => {
      const next = prev.filter((player) => player.id !== playerId)
      // 모든 팀원이 제거되었을 때만 제거 모드 비활성화
      if (next.length === 0) setRemoveMode(null)
      return next
    })
    setFirstAttackerId((current) => (current === playerId ? null : current))
    setPickerContext((current) =>
      current?.playerId === playerId ? null : current,
    )
    setAnim((current) => {
      const next = { ...current }
      delete next[playerId]
      return next
    })
  }

  function updatePlayerKiller(team: Team, playerId: string, killer: string) {
    if (isViewer) return
    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((current) =>
      current.map((player) =>
        player.id === playerId ? { ...player, killer } : player,
      ),
    )
  }

  function updatePlayerName(team: Team, playerId: string, name: string) {
    if (isViewer) return
    const roster = team === "thomas" ? thomas : ada
    if (team === "thomas") {
      setThomas((prev) => {
        const next = prev.map((player) =>
          player.id === playerId ? { ...player, name } : player,
        )
        thomasRef.current = next
        return next
      })
    } else {
      setAda((prev) => {
        const next = prev.map((player) =>
          player.id === playerId ? { ...player, name } : player,
        )
        adaRef.current = next
        return next
      })
    }

    const cleanName = name.trim()
    if (!teamNameLinked.current[team] && roster[0]?.id === playerId && cleanName) {
      if (team === "thomas") setThomasName(cleanName)
      else setAdaName(cleanName)
    }
  }

  function commitPlayerNameWithMigration(
    team: Team,
    playerId: string,
    name: string,
    previousName: string,
  ) {
    if (isViewer) return

    const cleanName = name.trim()
    const roster = team === "thomas" ? thomas : ada

    if (fearlessEnabled) {
      const snapshotThomas =
        team === "thomas"
          ? thomasRef.current.map((player) =>
              player.id === playerId ? { ...player, name } : player,
            )
          : thomasRef.current
      const snapshotAda =
        team === "ada"
          ? adaRef.current.map((player) =>
              player.id === playerId ? { ...player, name } : player,
            )
          : adaRef.current
      const next = applyFourVFourNameCommit(
        snapshotThomas,
        snapshotAda,
        playerId,
        name,
        previousName,
      )
      thomasRef.current = next.thomas
      adaRef.current = next.ada
      flushSync(() => {
        setThomas(next.thomas)
        setAda(next.ada)
      })
    } else {
      const setTeam = team === "thomas" ? setThomas : setAda
      setTeam((prev) =>
        prev.map((player) =>
          player.id === playerId ? { ...player, name: cleanName } : player,
        ),
      )
    }

    if (!teamNameLinked.current[team] && roster[0]?.id === playerId && cleanName) {
      if (team === "thomas") setThomasName(cleanName)
      else setAdaName(cleanName)
    }

    commitPlayerName(team, playerId, name)
  }

  function commitPlayerName(team: Team, playerId: string, name: string) {
    if (isViewer) return
    const roster = team === "thomas" ? thomas : ada
    const cleanName = name.trim()
    if (teamNameLinked.current[team] || roster[0]?.id !== playerId || !cleanName) return

    teamNameLinked.current[team] = true
    if (team === "thomas") setThomasName(cleanName)
    else setAdaName(cleanName)
  }

  function openAuctionModal() {
    setAuctionDraftThomas(thomas[0]?.name ?? "")
    setAuctionDraftAda(ada[0]?.name ?? "")
    setAuctionWinnerTeam(null)
    setShowAuctionModal(true)
  }

  function syncAuctionThomasName(name: string) {
    setAuctionDraftThomas(name)
    setThomas((prev) =>
      prev.map((player, index) => (index === 0 ? { ...player, name } : player)),
    )
    const cleanName = name.trim()
    if (cleanName) {
      setThomasName(cleanName)
      teamNameLinked.current.thomas = true
    }
  }

  function syncAuctionAdaName(name: string) {
    setAuctionDraftAda(name)
    setAda((prev) =>
      prev.map((player, index) => (index === 0 ? { ...player, name } : player)),
    )
    const cleanName = name.trim()
    if (cleanName) {
      setAdaName(cleanName)
      teamNameLinked.current.ada = true
    }
  }

  function handleAuctionResult(winner: Team, thomasPlayerName: string, adaPlayerName: string) {
    syncAuctionThomasName(thomasPlayerName)
    syncAuctionAdaName(adaPlayerName)
    setAuctionWinnerTeam(winner)
  }

  function closeAllResetUI() {
    setShowResetMenu(false)
    setShowResetConfirm(false)
    setShowKillerResetConfirm(false)
    setShowRosterResetConfirm(false)
    setShowFullResetConfirm(false)
  }

  const resetMenuRef = useRef<HTMLDivElement>(null)
  const resetTriggerRef = useRef<HTMLButtonElement>(null)
  const guideMenuRef = useRef<HTMLDivElement>(null)
  const guideTriggerRef = useRef<HTMLButtonElement>(null)
  const modeSwitchMenuRef = useRef<HTMLDivElement>(null)
  const modeSwitchTriggerRef = useRef<HTMLButtonElement>(null)

  const resetUiOpen =
    showResetMenu ||
    showResetConfirm ||
    showKillerResetConfirm ||
    showRosterResetConfirm ||
    showFullResetConfirm
  const resetUiDismissBind = useAutoDismiss(
    resetUiOpen,
    closeAllResetUI,
    RESET_MENU_IDLE_MS,
  )
  useDismissOnOutsideInteraction(
    resetUiOpen,
    closeAllResetUI,
    resetMenuRef,
    [resetTriggerRef],
  )
  const guideUiOpen = showGuideMenu || showGuide !== null
  useDismissOnOutsideInteraction(
    guideUiOpen,
    closeAllGuideUI,
    guideMenuRef,
    [guideTriggerRef],
  )
  const modeSwitchDismissBind = useAutoDismiss(showModeSwitchConfirm, () => {
    setShowModeSwitchConfirm(false)
  })
  useDismissOnOutsideInteraction(
    showModeSwitchConfirm,
    () => setShowModeSwitchConfirm(false),
    modeSwitchMenuRef,
    [modeSwitchTriggerRef],
  )

  function openResetConfirm(type: "score" | "killer" | "roster" | "full") {
    setShowResetConfirm(type === "score")
    setShowKillerResetConfirm(type === "killer")
    setShowRosterResetConfirm(type === "roster")
    setShowFullResetConfirm(type === "full")
  }

  function resetKillers() {
    if (isViewer) return
    setThomas((prev) => prev.map(clearPlayerKillers))
    setAda((prev) => prev.map(clearPlayerKillers))
    setKillerBans([])
    setPickerContext(null)
    closeAllResetUI()
  }

  function clearAceMatchFlowState() {
    aceOutcomeAnnouncedKeyRef.current = null
    aceAnnouncedKillsRef.current = null
    setOverlayDismissed(false)
    setIsAceMatchMode(false)
    setShowAcePromptModal(false)
    setAceThomasId(null)
    setAceAdaId(null)
    setAceThomasBackup(null)
    setAceAdaBackup(null)
    setAceFirstAttackerBackup(null)
    setAceWinnerTeam(null)
    setAceWinnersMap({})
    setAceRoundLog([])
    setAceVictoryOverlay(null)
    setShowAceRematchPrompt(false)
    setAceRematchExcludedIds([])
    setHasCompletedAceMatch(false)
    setShowAceProceedButton(false)
  }

  function resetRoster() {
    if (isViewer) return
    setThomas((prev) => prev.map((player) => clearPlayerRosterField(player)))
    setAda((prev) => prev.map((player) => clearPlayerRosterField(player)))
    teamNameLinked.current = { thomas: false, ada: false }
    setAnim({})
    setPrevKillsMap({})
    setFirstAttackerId(null)
    setLastScoredKills(null)
    setLastScoredPlayerId(null)
    setAuctionWinnerTeam(null)
    setAuctionDraftThomas("")
    setAuctionDraftAda("")
    clearAceMatchFlowState()
    closeAllResetUI()
  }

  function reset() {
    if (isViewer) return
    setThomas((prev) => prev.map((p) => ({ ...p, kills: 0, played: false })))
    setAda((prev) => prev.map((p) => ({ ...p, kills: 0, played: false })))
    setAnim({})
    setPrevKillsMap({})
    setFirstAttackerId(null)
    setLastScoredKills(null)
    setLastScoredPlayerId(null)
    setAuctionWinnerTeam(null)
    closeAllResetUI()
    clearAceMatchFlowState()
    // localStorage는 useEffect가 상태 변경 후 자동으로 업데이트함
  }

  function handleResetClick() {
    closeAllGuideUI()
    setShowModeSwitchConfirm(false)
    setShowResetConfirm(false)
    setShowKillerResetConfirm(false)
    setShowRosterResetConfirm(false)
    setShowFullResetConfirm(false)
    setShowResetMenu((open) => !open)
  }

  function handleResetConfirm() {
    reset()
  }

  function handleResetCancel() {
    closeAllResetUI()
  }

  function handleKillerResetCancel() {
    closeAllResetUI()
  }

  function fullReset() {
    if (isViewer) return
    setThomas(INITIAL_THOMAS)
    setAda(INITIAL_ADA)
    setKillerBans([])
    setPickerContext(null)
    setThomasName("A")
    setAdaName("B")
    teamNameLinked.current = { thomas: false, ada: false }
    setAnim({})
    setPrevKillsMap({})
    setFirstAttackerId(null)
    setLastScoredKills(null)
    setLastScoredPlayerId(null)
    setAuctionWinnerTeam(null)
    closeAllResetUI()
    clearAceMatchFlowState()
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
  }

  return (
    <main
      className="relative min-h-screen w-full overflow-hidden text-foreground"
      onClick={(e) => {
        const target = e.target as HTMLElement
        if (
          target &&
          !target.closest("input") &&
          !target.closest("button") &&
          !target.closest("textarea")
        ) {
          if (document.activeElement && document.activeElement instanceof HTMLElement) {
            document.activeElement.blur()
          }
        }
        if (removeMode) setRemoveMode(null)
      }}
    >
      {!utilityUiHidden && <AppVersionCorner />}

      <AuctionOrderModal
        open={showAuctionModal}
        thomasPlayerName={auctionDraftThomas}
        adaPlayerName={auctionDraftAda}
        auctionWinner={auctionWinnerTeam}
        onClose={() => setShowAuctionModal(false)}
        onThomasPlayerNameChange={syncAuctionThomasName}
        onAdaPlayerNameChange={syncAuctionAdaName}
        onAuctionResult={handleAuctionResult}
      />

      <div className="relative mx-auto flex min-h-screen max-w-[1440px] flex-col px-3 py-3 pb-12 sm:px-4 md:px-6 md:py-4 md:pb-14">
        {/* editable team titles & floating coin toss widget (normal 4v4) */}
        {!isAceMatchMode && (
          <div className="relative border-b border-foreground/10 pb-4">
            <div className="absolute top-[calc(50%-0.75rem)] left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
              {!isViewer && !hasAnyScore && (
                <button
                  type="button"
                  onClick={openAuctionModal}
                  className="rounded-full border border-violet-500/80 bg-black/85 px-4 py-1.5 text-xs font-normal text-violet-400 backdrop-blur-md transition-all hover:border-violet-400 hover:text-violet-300 active:scale-95"
                  style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
                >
                  경매 순서 결정
                </button>
              )}
              <CoinTossWidget
                thomasName={thomasName}
                adaName={adaName}
                activeTeam={firstAttackTeam}
                disabled={isViewer}
                onTossResult={(winner) => {
                  const roster = winner === "thomas" ? thomas : ada
                  if (roster.length > 0) {
                    setFirstAttackerId(roster[0].id)
                  }
                }}
              />
            </div>
            <div
              className={cn(
                "grid grid-cols-2 gap-4",
                fearlessEnabled && "fearless-team-titles",
              )}
            >
              <h1 className="flex items-center justify-center gap-2 text-3xl md:text-5xl overflow-visible">
                {/* 숨겨진 span으로 실제 렌더 폭을 측정해 input에 적용 */}
                <span className="relative inline-block pr-[0.35em]">
                  <span
                    aria-hidden="true"
                    className="invisible whitespace-pre font-bold text-dbd-orange pr-[0.35em]"
                    style={{ fontFamily: "var(--font-aldrich)" }}
                  >{thomasName || " "}</span>
                  <input
                    value={thomasName}
                    readOnly={isViewer}
                    onChange={(e) => setThomasName(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur() }}
                    aria-label="왼쪽 팀 이름"
                    className={cn("absolute inset-0 w-full bg-transparent text-right font-bold outline-none drop-shadow-[0_3px_12px_color-mix(in_oklch,var(--dbd-orange),transparent_55%)] focus:opacity-80 text-dbd-orange pr-[0.35em]", isViewer && "cursor-default")}
                    style={{ fontFamily: "var(--font-aldrich)" }}
                  />
                </span>
                <span className="select-none font-bold text-white/95" style={{ fontFamily: "var(--font-aldrich)" }}>팀</span>
              </h1>
              <h1 className="flex items-center justify-center gap-2 text-3xl md:text-5xl overflow-visible">
                <span className="relative inline-block pr-[0.35em]">
                  <span
                    aria-hidden="true"
                    className="invisible whitespace-pre font-bold text-dbd-blue pr-[0.35em]"
                    style={{ fontFamily: "var(--font-aldrich)" }}
                  >{adaName || " "}</span>
                  <input
                    value={adaName}
                    readOnly={isViewer}
                    onChange={(e) => setAdaName(e.target.value)}
                    onFocus={(e) => e.currentTarget.select()}
                    onClick={(e) => e.currentTarget.select()}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur() }}
                    aria-label="오른쪽 팀 이름"
                    className={cn("absolute inset-0 w-full bg-transparent text-right font-bold outline-none drop-shadow-[0_3px_12px_color-mix(in_oklch,var(--dbd-blue),transparent_55%)] focus:opacity-80 text-dbd-blue pr-[0.35em]", isViewer && "cursor-default")}
                    style={{ fontFamily: "var(--font-aldrich)" }}
                  />
                </span>
                <span className="select-none font-bold text-white/95" style={{ fontFamily: "var(--font-aldrich)" }}>팀</span>
              </h1>
            </div>
          </div>
        )}

        {/* rosters */}
        {isAceMatchMode ? (
          <motion.div
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            className="ace-match-stage"
          >
            <div className="ace-match-cluster">
              {/* 팀명 행 중앙에 선공 버튼 오버레이 — 팀명 자체 위치는 유지 */}
              <div className="ace-match-titles-row">
                <div className="ace-match-toss">
                  <CoinTossWidget
                    thomasName={thomasName}
                    adaName={adaName}
                    thomasDisplayName={thomas.find((p) => p.id === aceThomasId)?.name.trim() || undefined}
                    adaDisplayName={ada.find((p) => p.id === aceAdaId)?.name.trim() || undefined}
                    activeTeam={firstAttackTeam}
                    disabled={isViewer}
                    onTossResult={(winner) => {
                      const aceId = winner === "thomas" ? aceThomasId : aceAdaId
                      if (aceId) {
                        setFirstAttackerId(aceId)
                      }
                    }}
                  />
                </div>
                <div
                  className={cn(
                    "ace-match-team-titles grid w-full grid-cols-2 gap-4 px-3 sm:px-4 md:px-6",
                    fearlessEnabled && "fearless-team-titles",
                  )}
                >
                  <h1 className="flex items-center justify-center gap-2 text-3xl md:text-5xl overflow-visible">
                    <span className="relative inline-block pr-[0.35em]">
                      <span
                        aria-hidden="true"
                        className="invisible whitespace-pre font-bold text-dbd-orange pr-[0.35em]"
                        style={{ fontFamily: "var(--font-aldrich)" }}
                      >{thomasName || " "}</span>
                      <input
                        value={thomasName}
                        readOnly
                        tabIndex={-1}
                        aria-label="왼쪽 팀 이름"
                        className="absolute inset-0 w-full cursor-default bg-transparent text-right font-bold outline-none drop-shadow-[0_3px_12px_color-mix(in_oklch,var(--dbd-orange),transparent_55%)] text-dbd-orange pr-[0.35em]"
                        style={{ fontFamily: "var(--font-aldrich)" }}
                      />
                    </span>
                    <span className="select-none font-bold text-white/95" style={{ fontFamily: "var(--font-aldrich)" }}>팀</span>
                  </h1>
                  <h1 className="flex items-center justify-center gap-2 text-3xl md:text-5xl overflow-visible">
                    <span className="relative inline-block pr-[0.35em]">
                      <span
                        aria-hidden="true"
                        className="invisible whitespace-pre font-bold text-dbd-blue pr-[0.35em]"
                        style={{ fontFamily: "var(--font-aldrich)" }}
                      >{adaName || " "}</span>
                      <input
                        value={adaName}
                        readOnly
                        tabIndex={-1}
                        aria-label="오른쪽 팀 이름"
                        className="absolute inset-0 w-full cursor-default bg-transparent text-right font-bold outline-none drop-shadow-[0_3px_12px_color-mix(in_oklch,var(--dbd-blue),transparent_55%)] text-dbd-blue pr-[0.35em]"
                        style={{ fontFamily: "var(--font-aldrich)" }}
                      />
                    </span>
                    <span className="select-none font-bold text-white/95" style={{ fontFamily: "var(--font-aldrich)" }}>팀</span>
                  </h1>
                </div>
              </div>

              <div className="ace-match-roster roster-stage grid w-full grid-cols-1 items-center gap-[2.8125rem] px-3 sm:px-4 md:grid-cols-2 md:gap-[4.5rem] md:px-6 lg:gap-[6.75rem]">
                <motion.div
                  initial={{ x: "-100vw", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                  className="flex w-full max-w-[42rem] flex-col justify-self-end"
                >
                  {thomas.find((p) => p.id === aceThomasId) &&
                    renderRow("thomas", thomas.find((p) => p.id === aceThomasId)!, 0)}
                </motion.div>

                <motion.div
                  initial={{ x: "100vw", opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                  className="flex w-full max-w-[42rem] flex-col justify-self-start"
                >
                  {ada.find((p) => p.id === aceAdaId) &&
                    renderRow("ada", ada.find((p) => p.id === aceAdaId)!, 0)}
                </motion.div>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="roster-stage mt-1 grid grid-cols-1 gap-[2.8125rem] md:h-96 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] md:gap-[4.5rem] lg:gap-[6.75rem]">
            <div className="flex w-full min-w-0 max-w-[42rem] flex-col justify-self-end gap-2">
              <div
                className={cn(
                  "fearless-roster-controls fearless-roster-controls-thomas flex items-center gap-1 text-neutral-400",
                  fearlessEnabled && "has-killer-slots",
                )}
              >
                <ShuffleButton teamName={thomasName} onClick={() => shuffleTeam("thomas")} disabled={hasAnyScore || isViewer} />
                <button
                  type="button"
                  onClick={() => addPlayer("thomas")}
                  disabled={isViewer || thomas.length >= MAX_PLAYERS_PER_TEAM}
                  aria-label="왼쪽 팀원 추가"
                  title={thomas.length >= MAX_PLAYERS_PER_TEAM ? "최대 4명까지 추가할 수 있습니다" : "팀원 추가"}
                  className="group size-9 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
                >
                  <img
                    src="/images/addplayer.webp"
                    alt=""
                    draggable={false}
                    className="size-full object-cover transition-[filter] group-hover:brightness-125"
                  />
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setRemoveMode((current) => current === "thomas" ? null : "thomas") }}
                  disabled={isViewer}
                  aria-label="왼쪽 팀원 제거 선택"
                  title={removeMode === "thomas" ? "제거 모드 취소" : "팀원 제거"}
                  aria-pressed={removeMode === "thomas"}
                  className={cn("group size-9 overflow-hidden rounded-sm transition-[transform,filter] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue", removeMode === "thomas" && "drop-shadow-[0_0_8px_var(--dbd-red)]")}
                >
                  <img
                    src="/images/removeplayer.webp"
                    alt=""
                    draggable={false}
                    className={cn("size-full object-cover transition-[filter] group-hover:brightness-125", removeMode === "thomas" && "brightness-125")}
                  />
                </button>
              </div>
              <div className="flex min-h-36 flex-col gap-3" onClick={(event) => {
                if (event.target === event.currentTarget && removeMode === "thomas") setRemoveMode(null)
              }}>
                {displayThomas.length === 0 ? <EmptyRoster disabled={isViewer} onClick={() => removeMode === "thomas" ? setRemoveMode(null) : addPlayer("thomas")} /> : displayThomas.map((p, i) => renderRow("thomas", p, i))}
              </div>
            </div>

            <div className="flex w-full min-w-0 max-w-[42rem] flex-col justify-self-start gap-2">
              <div
                className={cn(
                  "fearless-roster-controls fearless-roster-controls-ada flex items-center justify-end gap-1 text-neutral-400",
                  fearlessEnabled && "has-killer-slots",
                )}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setRemoveMode((current) => current === "ada" ? null : "ada") }}
                  disabled={isViewer}
                  aria-label="오른쪽 팀원 제거 선택"
                  title={removeMode === "ada" ? "제거 모드 취소" : "팀원 제거"}
                  aria-pressed={removeMode === "ada"}
                  className={cn("group size-9 overflow-hidden rounded-sm transition-[transform,filter] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue", removeMode === "ada" && "drop-shadow-[0_0_8px_var(--dbd-red)]")}
                >
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Removeplayer-ExYhz8hM8Tgzqopazw6mq4EtaVtoK4.png"
                    alt=""
                    draggable={false}
                    className={cn("size-full object-cover transition-[filter] group-hover:brightness-125", removeMode === "ada" && "brightness-125")}
                  />
                </button>
                <button
                  type="button"
                  onClick={() => addPlayer("ada")}
                  disabled={isViewer || ada.length >= MAX_PLAYERS_PER_TEAM}
                  aria-label="오른쪽 팀원 추가"
                  title={ada.length >= MAX_PLAYERS_PER_TEAM ? "최대 4명까지 추가할 수 있습니다" : "팀원 추가"}
                  className="group size-9 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
                >
                  <img
                    src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Addplayer-j1Wdqcd9gLokCKfKVrdt96Gu5wBqbM.png"
                    alt=""
                    draggable={false}
                    className="size-full object-cover transition-[filter] group-hover:brightness-125"
                  />
                </button>
                <ShuffleButton teamName={adaName} onClick={() => shuffleTeam("ada")} disabled={hasAnyScore || isViewer} />
              </div>
              <div className="flex min-h-36 flex-col gap-3" onClick={(event) => {
                if (event.target === event.currentTarget && removeMode === "ada") setRemoveMode(null)
              }}>
                {displayAda.length === 0 ? <EmptyRoster disabled={isViewer} onClick={() => removeMode === "ada" ? setRemoveMode(null) : addPlayer("ada")} /> : displayAda.map((p, i) => renderRow("ada", p, i))}
              </div>
            </div>
          </div>
        )}

        {/* center score */}
        <div
          className={cn(
            "score-stage relative flex min-h-48 md:min-h-52 shrink-0 translate-y-3 items-center justify-center overflow-visible pt-4 pb-2",
            isAceMatchMode && "ace-match-score",
          )}
        >
          <TeamScore
            left={leftScore}
            right={rightScore}
            leftBump={leftBump}
            rightBump={rightBump}
            orangeLit={orangeLitDisplay}
            blueLit={blueLitDisplay}
            close={closeDisplay}
            isGameOver={isGameOverDisplay}
          />
        </div>

        {/* cold game warning / result */}
        <div className="cold-game-box mt-9 md:mt-12 mb-3">
          {isAceMatchMode ? (
            aceMatchWarning && (
              <>
                <p className="cold-warning-title">알림</p>
                <div className="cold-warning-text flex flex-col items-center gap-1">
                  <p>
                    <span className={`cold-team-name ${aceMatchWarning.team === "thomas" ? "cold-team-thomas" : "cold-team-ada"}`}>
                      {aceMatchWarning.name}
                    </span>{" "}
                    팀{" "}
                    {"이번 경기에서 "}
                    <span className="cold-kill-count">{aceMatchWarning.killText}</span>
                    {aceMatchWarning.suffix}
                  </p>
                </div>
              </>
            )
          ) : (
            cold.status === "warning" && (
              <>
                {/* 콜드게임 적용 여부에 따라 제목 분기 */}
                <p className="cold-warning-title">
                  {cold.opponentMustSurviveName ? "콜드패 위기" : cold.isGeneral ? "알림" : "콜드패 위기"}
                </p>
                <div className="cold-warning-text flex flex-col items-center gap-1">
                  {/* 상대팀 생존 경고가 있는 경우 우선 표시 (1킬 시 상대 콜드 상황) */}
                  {cold.opponentMustSurviveName ? (
                    <p>
                      <span className={`cold-team-name ${cold.opponentMustSurviveName === thomasName ? "cold-team-thomas" : "cold-team-ada"}`}>
                        {cold.opponentMustSurviveName}
                      </span>{" "}
                      팀{" "}
                      {cold.opponentMustSurviveNextNeed ? (
                        <>
                          {"이번 경기 "}
                          <span className="cold-kill-count">{"전부 생존"}</span>
                          {" 후, 마지막 경기에서 "}
                          <span className="cold-kill-count">
                            {cold.opponentMustSurviveNextNeed >= MAX_KILLS
                              ? "올킬"
                              : `${fmt(cold.opponentMustSurviveNextNeed)}킬 이상`}
                          </span>
                          {cold.opponentMustSurviveNextNeed >= MAX_KILLS ? "을 해야 무승부입니다" : " 해야 무승부입니다"}
                        </>
                      ) : (
                        <>
                          {"이번 경기 "}
                          <span className="cold-kill-count">{"전부 생존"}</span>
                          {"해야 무승부입니다"}
                        </>
                      )}
                    </p>
                  ) : (
                    cold.need > 0 && (
                      <p>
                        <span className={`cold-team-name ${cold.name === thomasName ? "cold-team-thomas" : "cold-team-ada"}`}>
                          {cold.name}
                        </span>{" "}
                        팀{" "}
                        {cold.isEarlyWinNotice
                          ? cold.need >= MAX_KILLS
                            ? (
                              <>
                                {"이번 경기에서 "}
                                <span className="cold-kill-count">{"올킬"}</span>
                                {"하면 콜드게임으로 우승입니다"}
                              </>
                            )
                            : (
                              <>
                                {"이번 경기에서 "}
                                <span className="cold-kill-count">{fmt(cold.need)}킬</span>
                                {" 이상 하면 콜드게임으로 우승입니다"}
                              </>
                            )
                          : cold.isGeneral
                            ? cold.isWinPossible
                              ? cold.need >= MAX_KILLS
                                ? (
                                  <>
                                    {"이번 경기에서 "}
                                    <span className="cold-kill-count">{"올킬"}</span>
                                    {cold.isComebackWinNotice ? " 하면 역전승입니다" : " 하면 우승입니다"}
                                  </>
                                )
                                : (
                                  <>
                                    {"이번 경기에서 "}
                                    <span className="cold-kill-count">{fmt(cold.need)}킬</span>
                                    {cold.isComebackWinNotice ? " 이상 하면 역전승입니다" : " 이상 하면 우승입니다"}
                                  </>
                                )
                              : cold.need >= MAX_KILLS
                                ? (
                                  <>
                                    {"이번 경기에서 "}
                                    <span className="cold-kill-count">{"올킬"}</span>
                                    {"을 해야 무승부입니다"}
                                  </>
                                )
                                : (
                                  <>
                                    {"이번 경기에서 "}
                                    <span className="cold-kill-count">{fmt(cold.need)}킬</span>
                                    {" 이상 해야 무승부입니다"}
                                  </>
                                )
                            : cold.secondaryCondition
                              ? cold.secondaryCondition.type === "survive_all"
                                ? (
                                  <>
                                    {"이번 경기 "}
                                    <span className="cold-kill-count">{"올킬"}</span>
                                    {", 마지막 경기 "}
                                    <span className="cold-kill-count">{"전부 생존"}</span>
                                    {"해야 무승부입니다"}
                                  </>
                                )
                                : cold.secondaryCondition.type === "survive_min"
                                  ? (
                                    <>
                                      {"이번 경기 "}
                                      <span className="cold-kill-count">{"올킬"}</span>
                                      {", 마지막 경기 "}
                                      <span className="cold-kill-count">
                                        {cold.secondaryCondition.minSurvive === 1
                                          ? "1인 이상 생존(상대 올킬 방지)"
                                          : `${cold.secondaryCondition.minSurvive}인 이상 생존(${cold.secondaryCondition.maxAllowedKills}킬 이하 허용)`}
                                      </span>
                                      {"해야 무승부입니다"}
                                    </>
                                  )
                                  : cold.secondaryCondition.type === "survive_and_next_kill"
                                    ? (
                                      <>
                                        {"이번 경기 "}
                                        <span className="cold-kill-count">{"올킬"}</span>
                                        {", 다음 경기 "}
                                        <span className="cold-kill-count">{"전부 생존"}</span>
                                        {" 후"}
                                        <br />
                                        {"마지막 경기에서 "}
                                        <span className="cold-kill-count">
                                          {cold.secondaryCondition.nextNeed >= MAX_KILLS
                                            ? "올킬"
                                            : `${fmt(cold.secondaryCondition.nextNeed)}킬 이상`}
                                        </span>
                                        {cold.secondaryCondition.nextNeed >= MAX_KILLS ? "을 해야 무승부입니다" : " 해야 무승부입니다"}
                                      </>
                                    )
                                    : null
                              : cold.need >= MAX_KILLS
                                ? (
                                  <>
                                    {"이번 경기에서 "}
                                    <span className="cold-kill-count">{"올킬"}</span>
                                    {"을 해야 합니다"}
                                  </>
                                )
                                : (
                                  <>
                                    {"이번 경기에서 "}
                                    <span className="cold-kill-count">{fmt(cold.need)}킬</span>
                                    {" 이상 해야 합니다"}
                                  </>
                                )
                        }
                      </p>
                    )
                  )}
                </div>
              </>
            )
          )}
          {cold.status === "cold" && (
            <>
              <p className="cold-game-title">콜드게임!</p>
              <p className="cold-game-text">
                <span className={`cold-team-name ${cold.name === thomasName ? 'cold-team-thomas' : 'cold-team-ada'}`}>
                  {cold.name}
                </span>{" "}
                팀 역전 불가 — 경기 종료
              </p>
              <p className="cold-game-result">
                <span className={`cold-team-name ${cold.name === thomasName ? 'cold-team-ada text-dbd-blue' : 'cold-team-thomas text-dbd-orange'}`}>
                  {cold.name === thomasName ? adaName : thomasName}
                </span>
                <span className="text-white">팀 우승!</span>
              </p>
            </>
          )}
          {cold.status === "gameover" && (isAceMatchMode ? bothAcePlayed : true) && (
            <>
              <p className="cold-game-title text-dbd-yellow">
                {isAceMatchMode || aceWinnerTeam
                  ? "에이스 결정전 종료"
                  : cold.isCold
                  ? "콜드게임!"
                  : "모든 경기 종료"}
              </p>
              <p className="cold-game-result">
                {isAceMatchMode ? (
                  (() => {
                    const tAce = thomas.find((p) => p.id === aceThomasId)
                    const aAce = ada.find((p) => p.id === aceAdaId)
                    if (tAce && aAce && tAce.kills === aAce.kills) {
                      return <span className="text-dbd-yellow">무승부</span>
                    }
                    const aceWinner = tAce && aAce && tAce.kills > aAce.kills ? thomasName : adaName
                    const isThomasWin = aceWinner === thomasName
                    return (
                      <>
                        <span className={`cold-team-name ${isThomasWin ? 'cold-team-thomas text-dbd-orange' : 'cold-team-ada text-dbd-blue'}`}>
                          {aceWinner}
                        </span>
                        <span className="text-white">팀 승리!</span>
                      </>
                    )
                  })()
                ) : aceWinnerTeam ? (
                  (() => {
                    const winnerName = aceWinnerTeam === "thomas" ? thomasName : adaName
                    const isThomasWin = aceWinnerTeam === "thomas"
                    return (
                      <>
                        <span className={`cold-team-name ${isThomasWin ? 'cold-team-thomas text-dbd-orange' : 'cold-team-ada text-dbd-blue'}`}>
                          {winnerName}
                        </span>
                        <span className="text-white">팀 승리!</span>
                      </>
                    )
                  })()
                ) : cold.winnerName === "tie" ? (
                  <span className="text-white">무승부!</span>
                ) : (
                  <>
                    <span className={`cold-team-name ${cold.winnerName === thomasName ? 'cold-team-thomas text-dbd-orange' : 'cold-team-ada text-dbd-blue'}`}>
                      {cold.winnerName}
                    </span>
                    <span className="text-white">{isComebackWin ? "팀 역전승!" : "팀 우승!"}</span>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        {/* 설명서 모달 — 1v4와 동일한 전체 화면 표시 */}
        {showGuide && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
              onClick={closeAllGuideUI}
            />
            <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-2 sm:p-4">
              <div className="pointer-events-auto relative w-fit max-w-[94vw] overflow-hidden rounded-lg border border-neutral-800 bg-black/90 shadow-2xl">
                <button
                  type="button"
                  onClick={closeAllGuideUI}
                  className="absolute top-4 right-4 z-10 flex size-9 cursor-pointer items-center justify-center rounded-full border border-white/20 bg-black/80 text-lg text-white shadow-lg transition-all hover:bg-neutral-800"
                  aria-label="설명서 닫기"
                >
                  ✕
                </button>
                <img
                  src={
                    showGuide === "basic"
                      ? "/images/guide_4v4.webp"
                      : "/images/guide_fearless.webp"
                  }
                  alt={
                    showGuide === "basic"
                      ? "4v4 기본 설명서"
                      : "피어리스 모드 설명서"
                  }
                  className="block max-h-[94vh] max-w-[94vw] h-auto w-auto object-contain"
                />
              </div>
            </div>
          </>
        )}

        {/* fixed utility controls */}
        <ZoomCompensated
          origin="bottom left"
          className="scoreboard-utility-stack fixed bottom-5 left-4 z-50 text-neutral-300 md:bottom-6 md:left-8"
        >
          {!utilityUiHidden && (
          <div className="scoreboard-utility-stack-top">
          {fearlessEnabled && isViewer && (
            <button
              type="button"
              onClick={openKillerCatalog}
              className="scoreboard-utility-btn scoreboard-utility-btn-neutral"
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              살인마 목록 열기
            </button>
          )}
          {!isViewer && (
            <div className="relative flex w-full flex-col gap-2">
              {fearlessEnabled && (
                <button
                  type="button"
                  onClick={openKillerCatalog}
                  className="scoreboard-utility-btn scoreboard-utility-btn-neutral"
                  style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                >
                  살인마 목록 열기
                </button>
              )}
              <button
                type="button"
                ref={resetTriggerRef}
                onClick={handleResetClick}
                className="scoreboard-utility-btn scoreboard-utility-btn-neutral"
                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
              >
                초기화 메뉴
              </button>

              {showResetMenu && (
                <div
                  ref={resetMenuRef}
                  className="scoreboard-reset-menu"
                  {...resetUiDismissBind}
                >
                  <div className="flex flex-col gap-1.5 rounded border border-neutral-600/70 bg-black/95 p-2 backdrop-blur-sm whitespace-nowrap">
                    <button
                      type="button"
                      onClick={() => openResetConfirm("score")}
                      className="h-8 rounded border border-neutral-400/70 bg-black/80 px-3 text-sm text-white transition-colors hover:bg-white/10"
                      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                    >
                      점수 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => openResetConfirm("roster")}
                      className={RESET_ROSTER_KILLER_BTN}
                      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                    >
                      팀원 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => openResetConfirm("killer")}
                      className={RESET_ROSTER_KILLER_BTN}
                      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                    >
                      살인마 초기화
                    </button>
                    <button
                      type="button"
                      onClick={() => openResetConfirm("full")}
                      className="h-8 rounded border border-red-700/70 bg-black/80 px-3 text-sm text-red-400 transition-colors hover:bg-red-900/20"
                      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                    >
                      모두 초기화
                    </button>
                  </div>

                  {(showResetConfirm || showKillerResetConfirm || showRosterResetConfirm || showFullResetConfirm) && (
                    <div className="flex flex-col gap-1.5 py-2">
                      <div className="flex h-8 items-center">
                        {showResetConfirm && (
                          <div className="flex flex-col gap-2 rounded border border-neutral-400/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
                            <p className="text-xs text-neutral-200">점수를 초기화하시겠습니까?</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={handleResetConfirm}
                                className="rounded border border-neutral-400/70 bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={handleResetCancel}
                                className="rounded border border-neutral-600 bg-black/50 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                아니오
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex h-8 items-center">
                        {showRosterResetConfirm && (
                          <div className={RESET_CONFIRM_PANEL}>
                            <p className={RESET_CONFIRM_TEXT}>
                              팀원 목록과 점수를 초기화하시겠습니까?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={resetRoster}
                                className={RESET_CONFIRM_YES}
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={closeAllResetUI}
                                className={RESET_CONFIRM_NO}
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                아니오
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex h-8 items-center">
                        {showKillerResetConfirm && (
                          <div className={RESET_CONFIRM_PANEL}>
                            <p className={RESET_CONFIRM_TEXT}>
                              살인마 픽/밴 기록을 초기화 하시겠습니까?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={resetKillers}
                                className={RESET_CONFIRM_YES}
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={handleKillerResetCancel}
                                className={RESET_CONFIRM_NO}
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                아니오
                              </button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex h-8 items-center">
                        {showFullResetConfirm && (
                          <div className="flex flex-col gap-2 rounded border border-red-700/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
                            <p className="text-xs text-neutral-200">모두 초기화하시겠습니까?</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={fullReset}
                                className="rounded border border-red-700/70 bg-red-900/20 px-2 py-1 text-xs text-red-400 transition-colors hover:bg-red-900/40"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={closeAllResetUI}
                                className="rounded border border-neutral-600 bg-black/50 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                아니오
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
          </div>
          )}
          <div className="scoreboard-utility-stack-bottom">
          {!utilityUiHidden && (
          <div className="relative flex w-full items-center">
            <FooterBtn
              buttonRef={guideTriggerRef}
              onClick={handleOpenGuide}
              className={cn(
                "scoreboard-utility-btn scoreboard-utility-btn-neutral",
                !hasSeenGuide
                  ? "border-red-700/90 bg-red-950/45 text-red-400 font-bold"
                  : "border-neutral-600 bg-black/50",
              )}
            >
              설명서
            </FooterBtn>

            {showGuideMenu && (
              <div
                ref={guideMenuRef}
                className="absolute left-full bottom-0 z-50 ml-2 flex items-end gap-2"
              >
                <div className="flex flex-col gap-1.5 rounded border border-neutral-600/70 bg-black/95 p-2 backdrop-blur-sm whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => openGuideView("basic")}
                    className="h-8 rounded border border-neutral-400/70 bg-black/80 px-3 text-sm text-white transition-colors hover:bg-white/10"
                    style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                  >
                    기본 설명서
                  </button>
                  <button
                    type="button"
                    onClick={() => openGuideView("fearless")}
                    className="h-8 rounded border border-dbd-yellow/70 bg-black/80 px-3 text-sm text-dbd-yellow transition-colors hover:bg-dbd-yellow/10 hover:text-dbd-yellow"
                    style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                  >
                    피어리스 설명서
                  </button>
                </div>
              </div>
            )}

            {!hasSeenGuide && (
              <div
                className="absolute left-full ml-3 z-50 flex cursor-pointer items-center gap-1.5 rounded-md border border-red-700/85 bg-black/95 px-3.5 py-2 text-sm backdrop-blur-md whitespace-nowrap hover:brightness-125"
                onClick={handleOpenGuide}
                style={{ fontFamily: "var(--font-s-core)", fontWeight: 400 }}
              >
                <span className="text-red-400">피어리스 모드 </span>
                <span className="text-white">설명서를 확인해 보세요!</span>
              </div>
            )}
          </div>
          )}
          <UtilityUiToggle hidden={utilityUiHidden} onToggle={toggleUtilityUi} />
          </div>
        </ZoomCompensated>

        {/* 우승 오버레이 */}
        {showOverlay && !overlayDismissed && !isAceMatchMode && cold.status === "cold" && (
          <WinnerOverlay 
            winnerName={cold.name === thomasName ? adaName : thomasName} 
            teamColor={cold.name === thomasName ? "ada" : "thomas"} 
            isColdGame
            onDismiss={() => setOverlayDismissed(true)} 
          />
        )}
        {showOverlay && !overlayDismissed && !isAceMatchMode && cold.status === "gameover" && (
          <WinnerOverlay
            key={`gameover-${cold.winnerName}-${isComebackWin ? "comeback" : "regular"}-${overlayOutcomeKey}`}
            winnerName={cold.winnerName === "tie" ? "tie" : cold.winnerName}
            teamColor={cold.winnerName === "tie" ? undefined : (cold.winnerName === thomasName ? "thomas" : "ada")}
            isComeback={isComebackWin}
            isColdGame={Boolean(cold.isCold)}
            onDismiss={() => {
              setOverlayDismissed(true)
              if (
                cold.winnerName === "tie" &&
                !hasCompletedAceMatch &&
                !showAcePromptModal
              ) {
                setAceRematchExcludedIds([])
                setAceModalOpenKey((value) => value + 1)
                setAceModalInitialStep("prompt")
                setShowAcePromptModal(true)
              }
            }}
          />
        )}

        {/* 에이스 결정전 선택 모달 */}
        {showAcePromptModal && !isViewer && (
          <AceMatchModal
            key={aceModalOpenKey}
            thomas={thomas}
            ada={ada}
            thomasName={thomasName}
            adaName={adaName}
            initialStep={aceModalInitialStep}
            initialExcludedIds={aceRematchExcludedIds}
            onStepChange={setAceModalStep}
            onSyncState={setAceModalSync}
            onCancel={() => {
              setShowAcePromptModal(false)
              setAceRematchExcludedIds([])
              setAceModalSync(DEFAULT_ACE_MODAL_SYNC)
              setShowAceProceedButton(true)
            }}
            onConfirmAceMatch={handleConfirmAceMatch}
          />
        )}

        {isViewer && viewerAceModalSync && (
          <AceMatchModal
            thomas={thomas}
            ada={ada}
            thomasName={thomasName}
            adaName={adaName}
            readOnly
            syncState={viewerAceModalSync}
            onCancel={() => undefined}
            onConfirmAceMatch={() => undefined}
          />
        )}

        {showAceRematchPrompt && isViewer && (
          <div className="ace-modal-backdrop ace-modal-backdrop--passthrough ace-modal-backdrop--rematch">
            <div className="ace-modal-panel">
              <h2 className="ace-modal-title">에이스 결정전 무승부</h2>
              <p className="ace-modal-body">
                결정전 재경기 여부를
                <br />
                확인하고 있습니다.
              </p>
            </div>
          </div>
        )}

        {/* 에이스 결정전 승리 오버레이 */}
        {aceVictoryOverlay && (
          <AceMatchOverlay
            winnerTeamName={aceVictoryOverlay.winnerTeamName}
            acePlayerName={aceVictoryOverlay.acePlayerName}
            teamColor={aceVictoryOverlay.teamColor}
            onDismiss={handleAceVictoryDismiss}
          />
        )}

        {/* 에이스 결정전 2차 무승부 리매치 팝업 */}
        {showAceRematchPrompt && !isViewer && (
          <div className="ace-modal-backdrop ace-modal-backdrop--rematch">
            <div className="ace-modal-panel ace-modal-panel--rematch">
              <h2 className="ace-modal-title">에이스 결정전 무승부</h2>
              <p className="ace-modal-body ace-modal-body--rematch">
                다시 결정전을 진행하시겠습니까?
              </p>
              <div className="ace-modal-stack">
                <HoldButton
                  onConfirm={() => {
                    setShowAceRematchPrompt(false)
                    setFirstAttackerId(null) // Reset coin toss & hide first attacker badge!
                    if (aceThomasId && aceAdaId) {
                      setThomas((prev) => prev.map((p) => (p.id === aceThomasId ? { ...p, kills: 0, played: false } : p)))
                      setAda((prev) => prev.map((p) => (p.id === aceAdaId ? { ...p, kills: 0, played: false } : p)))
                    }
                  }}
                  fillClassName="bg-neutral-400/30"
                  className="ace-modal-btn ace-modal-btn--muted ace-modal-btn--block"
                >
                  현재 멤버로 재경기 (꾹 누르기)
                </HoldButton>
                <HoldButton
                  onConfirm={() => {
                    const previousAceIds = [aceThomasId, aceAdaId].filter(
                      (id): id is string => Boolean(id),
                    )
                    setShowAceRematchPrompt(false)
                    applyAceFourVFourRestore(
                      aceThomasBackup,
                      aceAdaBackup,
                      aceFirstAttackerBackup,
                      setThomas,
                      setAda,
                      setFirstAttackerId,
                    )

                    setIsAceMatchMode(false)
                    setAceThomasId(null)
                    setAceAdaId(null)
                    setAceThomasBackup(null)
                    setAceAdaBackup(null)
                    setAceFirstAttackerBackup(null)
                    setAceRematchExcludedIds((previous) =>
                      mergeAceDrawExcludedIds(previous, previousAceIds),
                    )
                    setOverlayDismissed(true)
                    setShowOverlay(false)
                    prevGameoverWinnerRef.current = "tie"
                    setAceModalOpenKey((value) => value + 1)
                    setAceModalInitialStep("method_select")
                    setShowAcePromptModal(true)
                  }}
                  fillClassName="bg-neutral-400/30"
                  className="ace-modal-btn ace-modal-btn--muted ace-modal-btn--block"
                >
                  멤버 다시 뽑기 (꾹 누르기)
                </HoldButton>
                <HoldButton
                  onConfirm={() => {
                    setShowAceRematchPrompt(false)
                    handleExitAceMatch()
                  }}
                  fillClassName="bg-red-500/35"
                  className="ace-modal-btn ace-modal-btn--danger ace-modal-btn--block"
                >
                  결정전 종료 (꾹 누르기)
                </HoldButton>
              </div>
            </div>
          </div>
        )}

        {/* 에이스 결정전 진행 중: 멤버 다시 선택 / 종료하기 / 모달 닫힘 상태: 진행하기 버튼 */}
        {!isViewer &&
          (showAceMatchDock && (showAceRedoInDock || showAceExitInDock) ? (
            <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
              {showAceRedoInDock && (
                <div className="relative flex items-center justify-center">
                  <HoldButton
                    onConfirm={handleRedoAceMemberSelection}
                    fillClassName="bg-neutral-400/35"
                    className="ace-dock-btn ace-dock-btn--highlight"
                    style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
                  >
                    멤버 다시 선택 (꾹 누르기)
                  </HoldButton>

                  {!hasSeenAceRedoHint && (
                    <div
                      className="absolute bottom-full left-1/2 z-50 mb-2 flex w-[min(18rem,calc(100vw-2rem))] -translate-x-1/2 flex-col items-center gap-2 text-center select-none sm:bottom-auto sm:left-full sm:mb-0 sm:ml-3 sm:w-[18rem] sm:translate-x-0"
                      style={{ fontFamily: "var(--font-s-core)", fontWeight: 400 }}
                    >
                      <p
                        className="w-full text-sm leading-snug text-white [word-break:keep-all] drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]"
                        style={{ whiteSpace: "normal" }}
                      >
                        멤버 선택 실수를 하셨나요?
                        <br />
                        이전 화면으로 돌아갈 수 있습니다!
                      </p>
                      <button
                        type="button"
                        onClick={dismissAceRedoHint}
                        className="rounded border border-white/50 bg-white/10 px-2.5 py-1 text-xs text-white transition-colors hover:bg-white/20"
                      >
                        닫기
                      </button>
                    </div>
                  )}
                </div>
              )}
              {showAceExitInDock && (
                <HoldButton
                  onConfirm={handleExitAceMatch}
                  fillClassName="bg-red-500/35"
                  className={cn(
                    "ace-dock-btn ace-dock-btn--danger",
                    isAceWinnerDecided && "ace-dock-btn--solid",
                  )}
                  style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
                >
                  에이스 결정전 종료하기 (꾹 누르기)
                </HoldButton>
              )}
            </div>
          ) : (
            shouldShowAceProceedDock && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                <HoldButton
                  onConfirm={() => {
                    setAceRematchExcludedIds([])
                    setAceModalOpenKey((value) => value + 1)
                    setAceModalInitialStep("prompt")
                    setShowAcePromptModal(true)
                  }}
                  fillClassName="bg-dbd-yellow/30"
                  className="ace-dock-btn ace-dock-btn--proceed"
                  style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
                >
                  에이스 결정전 진행하기 (꾹 누르기)
                </HoldButton>
              </div>
            )
          ))}
      </div>

      {viewerSessionEndReason && (
        <ViewerLinkExpiredNotice
          reason={viewerSessionEndReason}
          onDismiss={() => setViewerSessionEndReason(null)}
        />
      )}

      {sync.tabSuperseded && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
          <div
            className="w-full max-w-md rounded-md border border-dbd-yellow/70 bg-neutral-950/95 p-6 text-center shadow-[0_0_40px_rgba(234,179,8,0.2)]"
            style={{ fontFamily: "var(--font-godo)" }}
          >
            <h2 className="text-lg font-bold text-dbd-yellow">
              다른 탭에서 연동 중입니다
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-neutral-300">
              같은 브라우저에서는 가장 최근에 연 탭 하나만 Firebase에
              연결됩니다. 이 탭의 연결은 자동으로 종료되었습니다.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-5 rounded border border-dbd-yellow/70 bg-dbd-yellow/10 px-4 py-2 text-sm text-dbd-yellow transition-colors hover:bg-dbd-yellow/20"
            >
              이 탭에서 다시 연결
            </button>
          </div>
        </div>
      )}

      {/* Mode Switcher Floating Button & Popover */}
      {!utilityUiHidden && (
      <ZoomCompensated
        origin="bottom right"
        className="scoreboard-utility-stack fixed bottom-5 right-4 z-50 md:bottom-6 md:right-8"
      >
        <ScoreboardSyncPanel
          role={sync.role}
          status={sync.status}
          busy={sync.busy}
          inviteUrl={sync.inviteUrl}
          errorMessage={sync.errorMessage}
          onStart={sync.startSharing}
          onStopSharing={sync.stopSharing}
          onStopViewing={sync.stopViewing}
        />
        {!isViewer && (
          <div className="relative w-full">
            <button
              type="button"
              ref={modeSwitchTriggerRef}
              onClick={() => {
                closeAllResetUI()
                closeAllGuideUI()
                setShowModeSwitchConfirm((prev) => !prev)
              }}
              className="scoreboard-utility-btn border border-dbd-yellow/70 bg-black/80 text-dbd-yellow shadow-lg hover:bg-dbd-yellow/10 hover:text-dbd-yellow"
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              5인 내전 모드로 전환
            </button>
            {showModeSwitchConfirm && (
              <div
                ref={modeSwitchMenuRef}
                className="absolute right-full bottom-0 z-50 mr-2 flex flex-col gap-2 rounded border border-dbd-yellow/50 bg-black/95 p-3 whitespace-nowrap shadow-2xl backdrop-blur-sm"
                {...modeSwitchDismissBind}
              >
                <p className="text-xs text-neutral-200">5인 내전 모드로 넘어가시겠습니까?</p>
                <div className="flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModeSwitchConfirm(false)
                      if (sync.role === "host") {
                        void sync.switchGameMode("5p")
                        return
                      }
                      router.push("/1v4")
                    }}
                    className="rounded border border-dbd-yellow/70 bg-dbd-yellow/10 px-2 py-1 text-xs text-dbd-yellow transition-colors hover:bg-dbd-yellow/20 cursor-pointer"
                    style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                  >
                    예
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowModeSwitchConfirm(false)}
                    className="rounded border border-neutral-600 bg-black/50 px-2 py-1 text-xs text-neutral-300 transition-colors hover:border-neutral-400 hover:text-white cursor-pointer"
                    style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                  >
                    아니오
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </ZoomCompensated>
      )}

      {utilityUiHidden && <SyncStatusCompactLabel role={sync.role} />}

      {activePickerContext && fearlessEnabled && (
        <KillerPicker
          open
          context={activePickerContext}
          allPicks={allPicks}
          killerBans={killerBans}
          playerKillerPicks={
            (activePickerContext.team === "thomas" ? thomas : ada).find(
              (player) => player.id === activePickerContext.playerId,
            )?.killerPicks ?? []
          }
          readOnly={isViewer}
          viewerTeamCatalogTeamLabel={viewerPickerTeamCatalogTeamLabel}
          syncedPickerUi={isViewer ? pickerUi : null}
          onSelectionSync={isViewer ? undefined : handlePickerSelectionSync}
          onFeedbackSync={isViewer ? undefined : handlePickerFeedbackSync}
          onPick={handleKillerPick}
          onCancelPick={handleKillerPickCancel}
          onToggleBan={handleKillerBanToggle}
          onClose={closeKillerPicker}
        />
      )}

    </main>
  )
}

function EmptyRoster({ onClick, disabled = false }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex min-h-36 w-full items-center justify-center rounded-md border border-dashed border-neutral-700 bg-black/25 px-4 text-center text-sm leading-relaxed text-neutral-400 transition-colors hover:border-neutral-500 hover:bg-black/40 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue disabled:cursor-default disabled:opacity-60 disabled:hover:border-neutral-700 disabled:hover:bg-black/25 disabled:hover:text-neutral-400"
    >
      + 버튼을 눌러 플레이어를 추가해주세요
    </button>
  )
}

function ShuffleButton({ teamName, onClick, disabled }: { teamName: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={`${teamName} 팀원 무작위 배치`}
      title={disabled ? "점수 초기화 후 섞기가 가능합니다" : "팀원 무작위 배치"}
      className="group size-12 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
    >
      <img
        src="/images/random.webp"
        alt=""
        draggable={false}
        className="size-full object-cover transition-[filter] group-hover:brightness-125"
      />
    </button>
  )
}



function FooterBtn({
  children,
  onClick,
  className,
  buttonRef,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
  buttonRef?: React.RefObject<HTMLButtonElement | null>
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className={cn("scoreboard-utility-btn", className)}
      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
    >
      {children}
    </button>
  )
}

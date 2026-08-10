"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { AceMatchModal } from "@/components/ace-match-modal"
import { AuctionOrderModal } from "@/components/auction-order-modal"
import { CoinTossWidget } from "@/components/coin-toss-widget"
import {
  aceModalSyncToSetup,
  aceSetupToModalSync,
  DEFAULT_ACE_MODAL_SYNC,
  type AceModalSyncState,
} from "@/lib/ace-modal-sync"
import { AceMatchOverlay } from "@/components/ace-match-overlay"
import { HoldButton } from "@/components/hold-button"
import { KillerPicker, type KillerPickerContext } from "@/components/killer-picker"
import { KillerPickSlots } from "@/components/killer-pick-slots"
import { MAX_KILLS, PlayerRow, type Player } from "@/components/player-row"
import { AppVersionCorner } from "@/components/app-version"
import { CopyScoreboardImageButton } from "@/components/copy-scoreboard-image-button"
import { ScoreboardSyncPanel } from "@/components/scoreboard-sync-panel"
import { ZoomCompensated } from "@/components/zoom-compensated"
import { UtilityUiToggle } from "@/components/utility-ui-toggle"
import { SyncStatusCompactLabel } from "@/components/sync-status-compact-label"
import { TeamScore } from "@/components/team-score"
import { ViewerLinkExpiredNotice } from "@/components/viewer-link-expired-notice"
import { WinnerOverlay } from "@/components/winner-overlay"
import { useScoreboardRoom } from "@/hooks/use-scoreboard-room"
import { useAutoDismiss } from "@/hooks/use-auto-dismiss"
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
import { buildCaptureMatchResult } from "@/lib/capture-match-result"
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
  setPlayerKillerPick,
  toggleKillerBan,
} from "@/lib/fearless"
import { cn } from "@/lib/utils"
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
const EXPIRATION_TIME_MS = 60 * 60 * 1000 // 마지막 조작 기준 1시간 만료

const teamScore = (players: Player[]) => players.reduce((s, p) => s + p.kills, 0)

function clearPlayerKillers(player: Player): Player {
  const next = { ...player, killerPicks: [] }
  delete next.killer
  return next
}

function computePreAceTeamScore(
  roster: Player[],
  acePlayerId: string | null,
  aceBackup: Player | null,
) {
  return roster.reduce((sum, player) => {
    if (acePlayerId && aceBackup && player.id === acePlayerId) {
      return sum + aceBackup.kills
    }
    return sum + player.kills
  }, 0)
}
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

type ColdState =
  | { status: "none" }
  | {
      status: "warning"
      name: string
      need: number
      /** 경고 대상 팀 관점에서, 다음 경기에 살아남아야 하는 조건 */
      nextSurviveRequired?: boolean
      /** 경고 대상 팀 관점에서, 다음 경기 이후 또 한 번 최소 필요 킬 */
      nextNeed?: number
      /**
       * 현재 차례 팀이 1킬이라도 하면 상대팀이 콜드게임 확정되는 경우,
       * 상대팀에게 "이번 경기 전부 생존해야 합니다" 경고를 함께 표시한다.
       */
      opponentMustSurviveName?: string
      /**
       * 콜드게임 룰이 적용되지 않는 일반 경고 (남은 경기 없음)
       * — 점수가 높은 팀이 이길 수 있도록 상대팀에게 필요 킬을 안내
       */
      isGeneral?: boolean
      /** isGeneral일 때 올킬로 우승(역전) 가능한지 여부. false면 올킬로 동점만 가능. */
      isWinPossible?: boolean
      /** isGeneral + isWinPossible일 때, 현재 점수가 상대보다 낮아 역전승 문구를 쓸지 */
      isComebackWinNotice?: boolean
      /** 선제 콜드게임 우승 가능 알림 여부 */
      isEarlyWinNotice?: boolean
    }
  | { status: "cold"; name: string }
  | { status: "gameover"; winnerName: string | "tie"; isCold?: boolean }

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

/** 4v4 모드에서 실제 득점 가능한 킬 수 단위: 1, 2, 3, 3.5, 4킬만 올림 계산 */
function toValid4v4Step(rawNeed: number): number {
  if (rawNeed <= 0) return 0
  if (rawNeed <= 1) return 1
  if (rawNeed <= 2) return 2
  if (rawNeed <= 3) return 3
  if (rawNeed <= 3.5) return 3.5
  return 4
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

/**
 * Best/worst-case reachability. Each remaining (un-played) player can still
 * score up to MAX_KILLS. A team is mathematically out ("cold game") once its
 * best possible final total can no longer reach the opponent's *current*
 * score. One step before that, we warn the team currently on the clock about
 * the minimum they must get this match to stay alive.
 */
function computeCold(
  thomas: Player[],
  ada: Player[],
  turn: Team | null,
  thomasName: string,
  adaName: string,
): ColdState {
  // 플레이어가 1명 이하면 경고 없음
  const totalPlayers = thomas.length + ada.length
  if (totalPlayers <= 1) return { status: "none" }

  const ts = teamScore(thomas)
  const as = teamScore(ada)
  const tr = thomas.filter((p) => !p.played).length
  const ar = ada.filter((p) => !p.played).length
  const tMax = ts + tr * MAX_KILLS
  const aMax = as + ar * MAX_KILLS

  // ── 남은 경기 없는 상황: 콜드게임 아닌 정규 경기 종료 ──
  if (tr + ar === 0) {
    if (ts > as) return { status: "gameover", winnerName: thomasName, isCold: false }
    if (as > ts) return { status: "gameover", winnerName: adaName, isCold: false }
    return { status: "gameover", winnerName: "tie", isCold: false }
  }

  // ── 한 팀의 현재 점수가 상대팀의 최대 가능 점수를 초과한 경우: 즉시 콜드게임 우승 ──
  if (as > tMax) return { status: "gameover", winnerName: adaName, isCold: true }
  if (ts > aMax) return { status: "gameover", winnerName: thomasName, isCold: true }

  // 콜드게임 판정: 남은 플레이어가 2명 이상 있을 때만 적용
  // 한 팀에만 1명 남은 마지막 경기 상황에서는 콜드게임 적용 안 함
  const isLastGameOnly = (tr === 1 && ar === 0) || (tr === 0 && ar === 1)
  if (tr + ar > 0 && !isLastGameOnly) {
    if (aMax < ts) return { status: "cold", name: adaName }
    if (tMax < as) return { status: "cold", name: thomasName }
  }

  // ── 이번 경기가 마지막 경기일 때 일반 경고 ──
  // 한 팀에만 1명 남은 경우: 콜드게임 경고 대신 일반 경고로 안내
  if (isLastGameOnly) {
    const myTeam: Team = tr === 1 ? "thomas" : "ada"
    const my = myTeam === "thomas" ? ts : as
    const opp = myTeam === "thomas" ? as : ts
    const myName = myTeam === "thomas" ? thomasName : adaName

    // 이미 앞서고 있으면 경고 없음
    if (my > opp) return { status: "none" }

    // 동점에 필요한 킬 수 (my + tieNeed = opp)
    const tieNeed = toValid4v4Step(opp - my)
    const validSteps = [1, 2, 3, 3.5, 4]
    const winNeedStep = validSteps.find((step) => my + step > opp)
    const canWin = winNeedStep !== undefined

    // 동점조차 불가능한 경우 (올킬로도 동점 못 만듦) → cold 선언
    if (my + MAX_KILLS < opp) {
      return { status: "cold", name: myName }
    }

    // 동점 또는 역전 가능: 일반 경고
    const displayNeed = canWin ? winNeedStep : tieNeed
    return {
      status: "warning",
      name: myName,
      need: displayNeed,
      isGeneral: true,
      isWinPossible: canWin,
      isComebackWinNotice: canWin && my < opp,
    }
  }

  if (turn) {
    const rem = turn === "thomas" ? tr : ar
    if (rem > 0) {
      const my = turn === "thomas" ? ts : as
      const opp = turn === "thomas" ? as : ts
      const oppRem = turn === "thomas" ? ar : tr   // 상대방 남은 플레이어 수
      const myRem = rem                             // 나의 남은 플레이어 수
      const oppName = turn === "thomas" ? adaName : thomasName
      const myName  = turn === "thomas" ? thomasName : adaName

      // ── 상대팀 생존 경고 ──────────────────────────────────────────
      // 현재 차례 팀이 이번 경기에서 1킬이라도 하면 상대가 콜드게임 확정되는지 확인.
      // 즉, (opp + 1) + (oppRem - 1)*MAX_KILLS < my + 1 이면 상대는 이번 경기 전부 생존해야 함.
      // 동등한 조건: 상대의 현재 최대 가능 점수 == 현재 내 점수
      //   → oppMax(현재) == my 이면, 내가 1킬이라도 추가하는 순간 상대 콜드.
      const oppMaxNow = opp + oppRem * MAX_KILLS
      const opponentMustSurviveName = (oppMaxNow === my) ? oppName : undefined

      // ── 현재 차례 팀 경고 ─────────────────────────────────────────
      // 이번 선수가 최소 need킬, 나머지 내 선수들이 모두 MAX_KILLS를 해야 동점
      const rawNeed = opp - my - (myRem - 1) * MAX_KILLS
      const need = toValid4v4Step(rawNeed)
      if (need > 0) {
        const myRemainingAfterThis = myRem - 1
        const myNextCapacity = myRemainingAfterThis * MAX_KILLS
        const oppNextMax = oppRem * MAX_KILLS
        const slack = myNextCapacity - oppNextMax

        if (oppRem === 0) {
          return { status: "warning", name: myName, need, opponentMustSurviveName }
        }

        if (slack > 0) {
          return { status: "warning", name: myName, need, opponentMustSurviveName }
        }

        return {
          status: "warning",
          name: myName,
          need,
          nextSurviveRequired: true,
          opponentMustSurviveName,
        }
      }

      // ── 선제 콜드게임 우승 알림 ────────────────────────────────────
      // 현재 차례 팀에게 방어적 경고(need > 0)가 없는 상황에서,
      // 이번 주자가 일정 킬 수 이상을 올리면 상대의 남은 모든 경기 결과와 무관하게
      // 콜드게임으로 즉시 우승이 확정되는지 체크한다.
      const validSteps = [1, 2, 3, 3.5, 4]
      const earlyWinNeed = validSteps.find((step) => my + step > oppMaxNow)
      if (earlyWinNeed !== undefined) {
        return {
          status: "warning",
          name: myName,
          need: earlyWinNeed,
          isEarlyWinNotice: true,
          isGeneral: true,
          opponentMustSurviveName,
        }
      }

      // 현재 차례 팀에게 경고는 없지만 상대가 생존해야 하는 경우
      if (opponentMustSurviveName) {
        return {
          status: "warning",
          name: opponentMustSurviveName,
          need: 0,
          opponentMustSurviveName,
        }
      }
    }
  }
  return { status: "none" }
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

const RESET_ROSTER_KILLER_BTN =
  "h-8 rounded border border-dbd-yellow/70 bg-black/80 px-3 text-sm text-dbd-yellow transition-colors hover:bg-dbd-yellow/10 hover:text-dbd-yellow"

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
  const teamNameLinked = useRef<Record<Team, boolean>>({ thomas: false, ada: false })
  const playerId = useRef(0)
  const [removeMode, setRemoveMode] = useState<Team | null>(null)

  // animation trigger counter per player id
  const [anim, setAnim] = useState<Record<string, number>>({})
  // previous kills snapshot per player id — used to animate only newly added skulls
  const [prevKillsMap, setPrevKillsMap] = useState<Record<string, number>>({})
  const animRef = useRef(anim)
  const prevKillsRef = useRef(prevKillsMap)
  const remotePlayersRef = useRef<{ thomas: Player[]; ada: Player[] } | null>(
    null,
  )
  /** gameover 시 이전 winnerName — 점수 수정으로 무승부로 바뀌었는지 감지 */
  const prevGameoverWinnerRef = useRef<string | "tie" | null | undefined>(
    undefined,
  )

  useEffect(() => {
    animRef.current = anim
  }, [anim])

  useEffect(() => {
    prevKillsRef.current = prevKillsMap
  }, [prevKillsMap])

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
  const [activeGuide, setActiveGuide] = useState<"basic" | "fearless" | null>(
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
    "prompt" | "method_select" | "manual_select" | "random_slot"
  >("prompt")
  const [aceModalSync, setAceModalSync] = useState<AceModalSyncState>(
    DEFAULT_ACE_MODAL_SYNC,
  )
  const [viewerAceModalSync, setViewerAceModalSync] =
    useState<AceModalSyncState | null>(null)

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
        showProceedButton: showAceProceedButton,
        showRematchPrompt: showAceRematchPrompt,
        ...(showAcePromptModal
          ? aceModalSyncToSetup(aceModalSync)
          : CLOSED_ACE_SETUP),
      },
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
      showAceProceedButton,
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
    })
  }, [aceModalInitialStep, showAcePromptModal])

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
          ? picks[pickerContext.slotIndex]
          : undefined,
    }
  }, [ada, pickerContext, thomas])
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
      const seen = localStorage.getItem("dbd-guide-seen-4v4")
      if (!seen) setHasSeenGuide(false)
    } catch {
      // ignore
    }
  }, [])

  function closeAllGuideUI() {
    setShowGuideMenu(false)
    setActiveGuide(null)
  }

  const handleOpenGuide = () => {
    closeAllResetUI()
    setShowGuideMenu((wasOpen) => {
      if (!wasOpen && !hasSeenGuide) {
        setHasSeenGuide(true)
        try {
          localStorage.setItem("dbd-guide-seen-4v4", "true")
        } catch {
          // ignore
        }
      }
      return !wasOpen
    })
  }

  const openGuideView = (type: "basic" | "fearless") => {
    setActiveGuide(type)
    if (!hasSeenGuide) {
      setHasSeenGuide(true)
      try {
        localStorage.setItem("dbd-guide-seen-4v4", "true")
      } catch {
        // ignore
      }
    }
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
      setKillerBans(saved.killerBans)
      if (typeof saved.fearlessEnabled === "boolean") {
        setFearlessEnabled(saved.fearlessEnabled)
      }
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
  const isGameOverDisplay = isAceMatchMode ? false : isGameOver
  const orangeLitDisplay = isAceMatchMode ? true : orangeLit
  const blueLitDisplay = isAceMatchMode ? true : blueLit
  const closeDisplay = isAceMatchMode ? true : close

  const bothAcePlayed = useMemo(() => {
    if (!isAceMatchMode || !aceThomasId || !aceAdaId) return false
    const tAce = thomas.find((p) => p.id === aceThomasId)
    const aAce = ada.find((p) => p.id === aceAdaId)
    return Boolean(tAce?.played && aAce?.played)
  }, [isAceMatchMode, aceThomasId, aceAdaId, thomas, ada])

  const [showOverlay, setShowOverlay] = useState(false)

  const isComebackWin = useMemo(() => {
    if (isAceMatchMode) return false
    if (cold.status !== "gameover" || cold.isCold || cold.winnerName === "tie") return false
    return detectComebackWin(thomas, ada, lastScoredPlayerId)
  }, [cold, thomas, ada, lastScoredPlayerId, isAceMatchMode])

  const captureMatchResult = useMemo(
    () =>
      buildCaptureMatchResult({
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
      }),
    [
      aceAdaId,
      aceThomasId,
      aceWinnerTeam,
      ada,
      adaName,
      bothAcePlayed,
      cold,
      isAceMatchMode,
      isComebackWin,
      thomas,
      thomasName,
    ],
  )

  const captureUsesPreAceScores =
    aceRoundLog.length > 0 ||
    isAceMatchMode ||
    aceWinnerTeam !== null ||
    aceThomasBackup !== null ||
    aceAdaBackup !== null

  const captureLeftScore = useMemo(() => {
    if (!captureUsesPreAceScores) return teamScore(thomas)
    return computePreAceTeamScore(thomas, aceThomasId, aceThomasBackup)
  }, [
    aceThomasBackup,
    aceThomasId,
    captureUsesPreAceScores,
    thomas,
  ])

  const captureRightScore = useMemo(() => {
    if (!captureUsesPreAceScores) return teamScore(ada)
    return computePreAceTeamScore(ada, aceAdaId, aceAdaBackup)
  }, [aceAdaBackup, aceAdaId, captureUsesPreAceScores, ada])

  const captureMainFirstAttackerId = useMemo(() => {
    if (captureUsesPreAceScores && aceFirstAttackerBackup) {
      return aceFirstAttackerBackup
    }
    return firstAttackerId
  }, [aceFirstAttackerBackup, captureUsesPreAceScores, firstAttackerId])

  // 1:1 Ace Match Notification Warning Logic
  const aceMatchWarning = useMemo(() => {
    if (!isAceMatchMode || !aceThomasId || !aceAdaId) return null
    const tPlayer = thomas.find((p) => p.id === aceThomasId)
    const aPlayer = ada.find((p) => p.id === aceAdaId)
    if (!tPlayer || !aPlayer) return null

    const getWarningData = (activeP: Player, targetP: Player, targetTeam: Team) => {
      const k = activeP.kills
      const targetName = targetP.name.trim() || (targetTeam === "thomas" ? thomasName : adaName)

      if (k < 3) {
        return {
          name: targetName,
          team: targetTeam,
          killText: `${k + 1}킬`,
          suffix: " 이상 해야 우승입니다",
        }
      } else if (k === 3) {
        return {
          name: targetName,
          team: targetTeam,
          killText: "올킬",
          suffix: "을 해야 우승입니다",
        }
      } else {
        return {
          name: targetName,
          team: targetTeam,
          killText: "올킬",
          suffix: "을 해야 동점입니다",
        }
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

    if (thomasAce && adaAce && thomasAce.played && adaAce.played) {
      const kills = lastScoredKills ?? 0
      let delayMs = 600
      if (kills === 1) delayMs = 900
      else if (kills === 2) delayMs = 1250
      else if (kills === 3) delayMs = 1650
      else if (kills === 3.5) delayMs = 2100
      else if (kills >= 4) delayMs = 2400

      const timer = setTimeout(() => {
        const roundKey = buildAceRoundLogKey(
          aceThomasId,
          aceAdaId,
          thomasAce.kills,
          adaAce.kills,
        )
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
          // Keep isAceMatchMode true while victory overlay is playing!
        } else if (adaAce.kills > thomasAce.kills) {
          logRound("ada")
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
          // Keep isAceMatchMode true while victory overlay is playing!
        } else {
          logRound("tie")
          setAceWinnerTeam(null)
          setShowAceRematchPrompt(true)
        }
      }, delayMs)

      return () => clearTimeout(timer)
    }
  }, [isAceMatchMode, aceThomasId, aceAdaId, thomas, ada, thomasName, adaName, lastScoredKills, firstAttackerId])

  const handleAceVictoryDismiss = () => {
    setAceVictoryOverlay(null)
    setHasCompletedAceMatch(true)
  }

  const handleConfirmAceMatch = (selectedThomasId: string, selectedAdaId: string) => {
    setShowAcePromptModal(false)
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
    // Restore original 4v4 scores & first attacker of the 2 Ace players
    if (aceThomasBackup) {
      setThomas((prev) => prev.map((p) => (p.id === aceThomasBackup.id ? { ...aceThomasBackup } : p)))
    }
    if (aceAdaBackup) {
      setAda((prev) => prev.map((p) => (p.id === aceAdaBackup.id ? { ...aceAdaBackup } : p)))
    }
    if (aceFirstAttackerBackup !== null) {
      setFirstAttackerId(aceFirstAttackerBackup)
    }

    setIsAceMatchMode(false)
    setAceThomasId(null)
    setAceAdaId(null)
    setAceThomasBackup(null)
    setAceAdaBackup(null)
    setAceFirstAttackerBackup(null)
    setHasCompletedAceMatch(true)
    setShowAceProceedButton(false)
    setOverlayDismissed(true)
    setShowOverlay(false)
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
  }, [cold.status, lastScoredKills, isAceMatchMode])

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

  function openKillerCatalog() {
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
        slotIndex === null ? undefined : player.killerPicks?.[slotIndex],
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

    const nextPlayer = setPlayerKillerPick(player, killerId, slotIndex)
    if (nextPlayer === player) return

    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((current) =>
      current.map((candidate) =>
        candidate.id === playerId
          ? setPlayerKillerPick(candidate, killerId, slotIndex)
          : candidate,
      ),
    )
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
        disabled={removeMode === team}
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
          onNameCommit={(name) => updatePlayerName(team, p.id, name)}
          onKillerChange={killerChangeHandler}
          onDragStart={() => {
            dragItem.current = { team, id: p.id }
            setDraggingId(p.id)
          }}
          onDragEnter={() => handleDragEnter(team, p.id)}
          onDragEnd={() => {
            dragItem.current = null
            setDraggingId(null)
          }}
        />
        {selgong && removeMode !== team && (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={`absolute -top-3 z-20 flex items-center gap-1 whitespace-nowrap rounded border border-black/80 bg-dbd-yellow px-2.5 py-0.5 text-xs font-black text-black ${
              isThomas ? "right-3" : "left-3"
            }`}
            style={{ fontFamily: "var(--font-godo)", fontWeight: 900 }}
          >
            선공
          </motion.span>
        )}
        {active && !selgong && removeMode !== team && (
          <span
            className={`absolute -top-2.5 z-10 whitespace-nowrap rounded-sm bg-neutral-950/95 px-2 text-xs text-neutral-200 ${
              isThomas ? "right-3" : "left-3"
            }`}
            style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
          >
            다음 플레이어
          </span>
        )}
        {aceWinnersMap[p.id] === "win" && (
          <motion.span
            initial={{ scale: 0.7, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className={cn(
              "absolute -top-3 z-30 flex items-center gap-1 whitespace-nowrap rounded border border-amber-300 bg-dbd-yellow px-2.5 py-0.5 text-xs font-black text-black tracking-wider shadow-[0_0_12px_rgba(234,179,8,0.7)] select-none",
              isThomas ? "right-3" : "left-3"
            )}
            style={{ fontFamily: "var(--font-godo)", fontWeight: 900 }}
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
    const setTeam = team === "thomas" ? setThomas : setAda
    const roster = team === "thomas" ? thomas : ada
    setTeam((prev) => prev.map((player) => player.id === playerId ? { ...player, name } : player))

    const cleanName = name.trim()
    if (!teamNameLinked.current[team] && roster[0]?.id === playerId && cleanName) {
      if (team === "thomas") setThomasName(cleanName)
      else setAdaName(cleanName)
    }
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

  const resetUiOpen =
    showResetMenu ||
    showResetConfirm ||
    showKillerResetConfirm ||
    showRosterResetConfirm ||
    showFullResetConfirm
  const resetUiDismissBind = useAutoDismiss(resetUiOpen, closeAllResetUI)
  const guideMenuDismissBind = useAutoDismiss(showGuideMenu, () => {
    setShowGuideMenu(false)
  })
  const modeSwitchDismissBind = useAutoDismiss(showModeSwitchConfirm, () => {
    setShowModeSwitchConfirm(false)
  })

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
    setHasCompletedAceMatch(false)
    setShowAceProceedButton(false)
  }

  function resetRoster() {
    if (isViewer) return
    setThomas((prev) =>
      prev.map((p) => ({ ...p, name: "", kills: 0, played: false })),
    )
    setAda((prev) =>
      prev.map((p) => ({ ...p, name: "", kills: 0, played: false })),
    )
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
        {/* editable team titles & floating coin toss widget */}
        <div className="relative border-b border-foreground/10 pb-4">
          {!isAceMatchMode && (
            <div className="absolute top-[calc(50%-0.75rem)] left-1/2 z-30 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
              {!isViewer && !hasAnyScore && (
                <button
                  type="button"
                  onClick={openAuctionModal}
                  className="rounded-full border border-violet-500/80 bg-black/85 px-4 py-1.5 text-xs font-black text-violet-400 backdrop-blur-md transition-all hover:border-violet-400 hover:text-violet-300 active:scale-95"
                  style={{ fontFamily: "var(--font-godo)" }}
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
          )}
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

        {/* rosters */}
        {isAceMatchMode ? (
          <motion.div
            initial={{ scaleY: 0, opacity: 0 }}
            animate={{ scaleY: 1, opacity: 1 }}
            transition={{ duration: 0.35, ease: [0.25, 1, 0.5, 1] }}
            className="mt-1 relative w-screen left-1/2 -translate-x-1/2 h-[360px] md:h-[400px] bg-black/95 p-4 md:p-6 shadow-[0_0_60px_rgba(0,0,0,0.95)] flex flex-col items-center justify-center backdrop-blur-md overflow-hidden"
          >
            {/* 에이스 결정전 전용 선공 정하기 버튼 — 높이 고정(h-16)으로 레이아웃 밀림 방지 */}
            <div className="h-16 flex items-center justify-center relative w-full shrink-0 mb-2 overflow-visible">
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

            {/* 양 팀 에이스 2인 이름표 — 양쪽에서 서로를 향해 슬라이딩 및 수직 중앙 정렬 */}
            <div className="w-full max-w-5xl px-2 md:px-4 grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-12 items-center">
              <motion.div
                initial={{ x: "-100vw", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                className="w-full flex flex-col items-center"
              >
                {thomas.find((p) => p.id === aceThomasId) && (
                  <div className="w-full max-w-xl">
                    {renderRow("thomas", thomas.find((p) => p.id === aceThomasId)!, 0)}
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ x: "100vw", opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay: 0.15 }}
                className="w-full flex flex-col items-center"
              >
                {ada.find((p) => p.id === aceAdaId) && (
                  <div className="w-full max-w-xl">
                    {renderRow("ada", ada.find((p) => p.id === aceAdaId)!, 0)}
                  </div>
                )}
              </motion.div>
            </div>
          </motion.div>
        ) : (
          <div className="mt-1 grid grid-cols-1 gap-[2.8125rem] md:h-96 md:grid-cols-2 md:gap-[4.5rem] lg:gap-[6.75rem]">
            <div className="flex w-full max-w-[42rem] flex-col justify-self-end gap-2">
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

            <div className="flex w-full max-w-[42rem] flex-col gap-2">
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
        <div className="relative flex h-48 md:h-52 shrink-0 translate-y-3 items-center justify-center pt-4 pb-2">
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
        <div className="cold-game-box mt-6 md:mt-8 mb-2">
          {isAceMatchMode ? (
            aceMatchWarning && (
              <>
                <p className="cold-warning-title">알림</p>
                <div className="cold-warning-text flex flex-col items-center gap-1">
                  <p>
                    <span className={`cold-team-name ${aceMatchWarning.team === "thomas" ? "cold-team-thomas" : "cold-team-ada"}`}>
                      {aceMatchWarning.name}
                    </span>{" "}
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
                  {cold.opponentMustSurviveName ? "콜드게임 경고" : cold.isGeneral ? "알림" : "콜드게임 경고"}
                </p>
                <div className="cold-warning-text flex flex-col items-center gap-1">
                  {/* 상대팀 생존 경고가 있는 경우 우선 단일 표시 (1킬 시 상대 콜드 상황) */}
                  {cold.opponentMustSurviveName ? (
                    <p>
                      <span className={`cold-team-name ${cold.opponentMustSurviveName === thomasName ? "cold-team-thomas" : "cold-team-ada"}`}>
                        {cold.opponentMustSurviveName}
                      </span>{" "}
                      팀{" "}
                      {"이번 경기 전부 생존해야 합니다"}
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
                                    {"을 해야 동점입니다"}
                                  </>
                                )
                                : (
                                  <>
                                    {"이번 경기에서 "}
                                    <span className="cold-kill-count">{fmt(cold.need)}킬</span>
                                    {" 이상 해야 동점입니다"}
                                  </>
                                )
                            : cold.need >= MAX_KILLS
                              ? (
                                <>
                                  {"이번 경기에서 "}
                                  <span className="cold-kill-count">{"올킬"}</span>
                                  {"을 해야합니다"}
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
              <p className="mt-3 text-2xl font-black text-white drop-shadow-md tracking-widest" style={{ fontFamily: "var(--font-godo)" }}>
                <span className={`cold-team-name ${cold.name === thomasName ? 'cold-team-ada text-dbd-blue' : 'cold-team-thomas text-dbd-orange'}`}>
                  {cold.name === thomasName ? adaName : thomasName}
                </span>{" "}
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
              <p className="mt-3 text-2xl font-black text-white drop-shadow-md tracking-widest" style={{ fontFamily: "var(--font-godo)" }}>
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
                        </span>{" "}
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
                        </span>{" "}
                        <span className="text-white">팀 승리!</span>
                      </>
                    )
                  })()
                ) : cold.winnerName === "tie" ? (
                  <span className="text-dbd-yellow">최종 결과: 무승부!</span>
                ) : (
                  <>
                    <span className={`cold-team-name ${cold.winnerName === thomasName ? 'cold-team-thomas text-dbd-orange' : 'cold-team-ada text-dbd-blue'}`}>
                      {cold.winnerName}
                    </span>{" "}
                    <span className="text-white">{isComebackWin ? "팀 역전승!" : "팀 우승!"}</span>
                  </>
                )}
              </p>
            </>
          )}
        </div>

        {/* 설명서 메뉴 / 뷰어 */}
        {(showGuideMenu || activeGuide) && (
          <div
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={closeAllGuideUI}
          />
        )}

        {/* backdrop for closing prompts on background click */}
        {(showResetMenu || showResetConfirm || showKillerResetConfirm || showRosterResetConfirm || showFullResetConfirm) && (
          <div
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={closeAllResetUI}
          />
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
                onClick={handleResetClick}
                className="scoreboard-utility-btn scoreboard-utility-btn-neutral"
                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
              >
                초기화
              </button>

              {showResetMenu && (
                <div
                  className="absolute left-full top-0 z-50 ml-2 flex items-start gap-2"
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
                          <div className="flex flex-col gap-2 rounded border border-neutral-400/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
                            <p className="text-xs text-neutral-200">
                              팀원 목록과 점수를 초기화하시겠습니까?
                            </p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={resetRoster}
                                className="rounded border border-neutral-400/70 bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20"
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

                      <div className="flex h-8 items-center">
                        {showKillerResetConfirm && (
                          <div className="flex flex-col gap-2 rounded border border-neutral-400/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
                            <p className="text-xs text-neutral-200">살인마 플레이 기록을 초기화하시겠습니까?</p>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={resetKillers}
                                className="rounded border border-neutral-400/70 bg-white/10 px-2 py-1 text-xs text-white transition-colors hover:bg-white/20"
                                style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                              >
                                예
                              </button>
                              <button
                                type="button"
                                onClick={handleKillerResetCancel}
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
              onClick={handleOpenGuide}
              className={cn(
                "scoreboard-utility-btn scoreboard-utility-btn-neutral border-neutral-600 bg-black/50",
                !hasSeenGuide && "border-dbd-yellow/90 text-dbd-yellow bg-dbd-yellow/15 shadow-[0_0_18px_rgba(234,179,8,0.7)] animate-pulse font-bold",
              )}
            >
              설명서
            </FooterBtn>

            {showGuideMenu && (
              <div
                className="absolute left-full bottom-0 z-50 ml-2 flex items-end gap-2"
                {...guideMenuDismissBind}
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

                {activeGuide && (
                  <div className="relative max-h-[min(90vh,42rem)] w-[min(92vw,36rem)] overflow-hidden rounded border border-neutral-500/70 bg-black/95 shadow-[0_18px_60px_rgba(0,0,0,0.65)]">
                    <button
                      type="button"
                      onClick={() => setActiveGuide(null)}
                      className="absolute top-3 right-3 z-10 size-8 flex items-center justify-center rounded border border-neutral-500/60 bg-black/70 text-sm text-white transition-colors hover:bg-black/90"
                      aria-label="설명서 닫기"
                    >
                      ✕
                    </button>
                    {activeGuide === "basic" ? (
                      <img
                        src="/images/guide_4v4.webp"
                        alt="4v4 기본 설명서"
                        className="block h-auto max-h-[min(90vh,42rem)] w-full object-contain object-top"
                      />
                    ) : (
                      <div className="max-h-[min(90vh,42rem)] overflow-y-auto p-4 pr-12 text-sm leading-relaxed text-neutral-200">
                        <h3
                          className="mb-3 text-base text-white"
                          style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
                        >
                          피어리스 모드
                        </h3>
                        <ul className="space-y-2 text-xs text-neutral-300">
                          <li>각 플레이어는 최대 4명의 살인마를 순서대로 픽합니다.</li>
                          <li>같은 플레이어는 중복 픽이 불가능합니다. 팀·플레이어 간 중복은 가능합니다.</li>
                          <li>이름표 옆 슬롯을 눌러 살인마를 선택하고, 검색·필터로 목록을 좁힐 수 있습니다.</li>
                          <li>하드/소프트/개인 필터는 표시용이며, 실제 픽 데이터에는 영향을 주지 않습니다.</li>
                          <li>밴된 살인마도 픽할 수 있으며, 밴 표시와 픽 닉네임이 함께 보입니다.</li>
                          <li>살인마 초기화는 픽·밴을 모두 지웁니다. 팀원 초기화는 픽을 유지합니다.</li>
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {!hasSeenGuide && (
              <motion.div
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: [0, 6, 0] }}
                transition={{ x: { repeat: Infinity, duration: 1.4 }, opacity: { duration: 0.3 } }}
                className="absolute left-full ml-3 z-50 flex items-center gap-1.5 rounded-md border border-dbd-yellow/80 bg-black/95 px-3 py-1.5 text-xs text-dbd-yellow shadow-[0_0_20px_rgba(234,179,8,0.5)] backdrop-blur-md whitespace-nowrap cursor-pointer hover:brightness-125"
                onClick={handleOpenGuide}
                style={{ fontFamily: "var(--font-godo)" }}
              >
                <span className="text-sm">👈</span>
                <span className="font-bold">최초 접속! 사용설명서를 확인해 보세요</span>
              </motion.div>
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
              if (cold.winnerName === "tie" && !hasCompletedAceMatch) {
                setShowAcePromptModal(true)
              }
            }}
          />
        )}

        {/* 에이스 결정전 선택 모달 */}
        {showAcePromptModal && !isViewer && (
          <AceMatchModal
            thomas={thomas}
            ada={ada}
            thomasName={thomasName}
            adaName={adaName}
            initialStep={aceModalInitialStep}
            onStepChange={setAceModalStep}
            onSyncState={setAceModalSync}
            onCancel={() => {
              setShowAcePromptModal(false)
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
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto p-4">
            <div className="w-full max-w-md rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]">
              <h2
                className="text-xl font-bold text-dbd-yellow mb-3"
                style={{ fontFamily: "var(--font-godo)" }}
              >
                에이스 결정전 무승부
              </h2>
              <p
                className="text-sm text-neutral-300 leading-relaxed"
                style={{ fontFamily: "var(--font-godo)" }}
              >
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

        {/* 에이스 결정전 2차 무승부 리매치 팝업 — 흐림/어두움 배경 제거 및 직각 플레이어 이름표 스타일 적용 */}
        {showAceRematchPrompt && !isViewer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-auto p-4">
            <div className="w-full max-w-md rounded-lg border border-neutral-600 bg-black/95 p-6 text-center shadow-[0_0_40px_rgba(0,0,0,0.9)]">
              <h2 className="text-xl font-bold text-dbd-yellow mb-3" style={{ fontFamily: "var(--font-godo)" }}>
                에이스 결정전 무승부
              </h2>
              <p className="text-sm text-neutral-300 mb-6 leading-relaxed">
                다시 결정전을 진행하시겠습니까?
              </p>
              <div className="flex flex-col gap-3">
                <HoldButton
                  onConfirm={() => {
                    setShowAceRematchPrompt(false)
                    setFirstAttackerId(null) // Reset coin toss & hide first attacker badge!
                    if (aceThomasId && aceAdaId) {
                      setThomas((prev) => prev.map((p) => (p.id === aceThomasId ? { ...p, kills: 0, played: false } : p)))
                      setAda((prev) => prev.map((p) => (p.id === aceAdaId ? { ...p, kills: 0, played: false } : p)))
                    }
                  }}
                  className="rounded border border-neutral-600 bg-black/90 py-2.5 text-sm font-bold text-dbd-yellow hover:border-neutral-400 hover:bg-dbd-yellow/20 transition-all"
                >
                  현재 멤버로 재경기 (꾹 누르기)
                </HoldButton>
                <HoldButton
                  onConfirm={() => {
                    setShowAceRematchPrompt(false)
                    // Restore original 4v4 scores & first attacker before Ace match started
                    if (aceThomasBackup) {
                      setThomas((prev) => prev.map((p) => (p.id === aceThomasBackup.id ? { ...aceThomasBackup } : p)))
                    }
                    if (aceAdaBackup) {
                      setAda((prev) => prev.map((p) => (p.id === aceAdaBackup.id ? { ...aceAdaBackup } : p)))
                    }
                    if (aceFirstAttackerBackup !== null) {
                      setFirstAttackerId(aceFirstAttackerBackup)
                    }

                    setIsAceMatchMode(false)
                    setAceThomasId(null)
                    setAceAdaId(null)
                    setAceThomasBackup(null)
                    setAceAdaBackup(null)
                    setAceFirstAttackerBackup(null)
                    setAceModalInitialStep("method_select")
                    setShowAcePromptModal(true)
                  }}
                  className="rounded border border-neutral-600 bg-black/90 py-2.5 text-sm font-bold text-dbd-blue hover:border-neutral-400 hover:bg-dbd-blue/20 transition-all"
                >
                  멤버 다시 뽑기 (꾹 누르기)
                </HoldButton>
                <HoldButton
                  onConfirm={() => {
                    setShowAceRematchPrompt(false)
                    handleExitAceMatch()
                  }}
                  className="rounded border border-neutral-600 bg-neutral-900/90 py-2.5 text-sm font-bold text-neutral-300 hover:border-neutral-400 hover:text-white transition-all"
                >
                  결정전 종료 (꾹 누르기)
                </HoldButton>
              </div>
            </div>
          </div>
        )}

        {/* 에이스 결정전 진행 중: 종료하기 버튼 / 모달 닫힘 상태: 진행하기 버튼 */}
        {!isViewer && (
          isAceMatchMode ? (
            <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
              <HoldButton
                onConfirm={handleExitAceMatch}
                className="rounded border border-red-600/80 bg-black/90 px-6 py-2.5 text-xs font-bold text-red-400 hover:bg-red-950/80 transition-all uppercase tracking-wider"
              >
                에이스 결정전 종료하기 (꾹 누르기)
              </HoldButton>
            </div>
          ) : (
            showAceProceedButton && !showAcePromptModal && (
              <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
                <HoldButton
                  onConfirm={() => {
                    setShowAceProceedButton(false)
                    setAceModalInitialStep("prompt")
                    setShowAcePromptModal(true)
                  }}
                  className="rounded border border-dbd-yellow/90 bg-black/90 px-6 py-2.5 text-xs font-bold text-dbd-yellow hover:bg-dbd-yellow/20 shadow-[0_0_15px_rgba(234,179,8,0.3)] transition-all uppercase tracking-wider"
                >
                  에이스 결정전 진행하기 (꾹 누르기)
                </HoldButton>
              </div>
            )
          )
        )}
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
        <CopyScoreboardImageButton
          thomas={thomas}
          ada={ada}
          thomasName={thomasName}
          adaName={adaName}
          leftScore={captureLeftScore}
          rightScore={captureRightScore}
          matchResult={captureMatchResult}
          aceRoundLog={aceRoundLog}
          mainFirstAttackerId={captureMainFirstAttackerId}
        />
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
              onClick={() => setShowModeSwitchConfirm((prev) => !prev)}
              className="scoreboard-utility-btn border border-dbd-yellow/70 bg-black/80 text-dbd-yellow shadow-lg hover:bg-dbd-yellow/10 hover:text-dbd-yellow"
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              5인 내전 모드로 전환
            </button>
            {showModeSwitchConfirm && (
              <div
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
          onPick={handleKillerPick}
          onCancelPick={handleKillerPickCancel}
          onToggleBan={handleKillerBanToggle}
          onClose={() => setPickerContext(null)}
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



function FooterBtn({ children, onClick, className }: { children: React.ReactNode; onClick?: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("scoreboard-utility-btn", className)}
      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
    >
      {children}
    </button>
  )
}

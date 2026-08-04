"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { MAX_KILLS, PlayerRow, type Player } from "@/components/player-row"
import { TeamScore } from "@/components/team-score"
import { cn } from "@/lib/utils"

type Team = "thomas" | "ada"

const INITIAL_THOMAS: Player[] = []
const INITIAL_ADA: Player[] = []
const SCORE_BEAT_MS = 355
const SCORE_BEAT_DOWN_MS = 40  // 점수 감소 시 빠르게 주르륵
const MAX_PLAYERS_PER_TEAM = 4
const LS_KEY = "dbd-scoreboard-v1"

const teamScore = (players: Player[]) => players.reduce((s, p) => s + p.kills, 0)
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
    }
  | { status: "cold"; name: string }

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

  // ── 남은 경기 없는 상황: 콜드게임 아닌 일반 경고 ──
  // 현재 경기가 마지막(남은 플레이어가 한 명씩 있거나 한 팀에만 한 명 남은 상황)이고
  // 콜드게임 룰이 적용되지 않을 때 — 이번 경기에서 몇 킬 이상 해야 우승 가능한지 안내.
  if (tr + ar === 0 && (ts !== 0 || as !== 0)) {
    // 모든 경기가 끝난 상태: 결과 표시 (이미 cold 체크 전이므로 여기선 동점 상황만 처리)
    return { status: "none" }
  }

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
    const tieNeed = opp - my
    // 우승(초과)에 필요한 킬 수 — 0.5킬 단위가 존재하므로 +0.5
    const winNeed = opp - my + 0.5

    // 동점조차 불가능한 경우 (올킬로도 동점 못 만듦) → cold 선언
    if (tieNeed > MAX_KILLS) {
      return { status: "cold", name: myName }
    }

    // 동점 또는 역전 가능: 일반 경고
    // winNeed <= MAX_KILLS 이면 우승 가능, 아니면 올킬로 동점만 가능
    const canWin = winNeed <= MAX_KILLS
    const displayNeed = canWin ? winNeed : MAX_KILLS
    return {
      status: "warning",
      name: myName,
      need: displayNeed,
      isGeneral: true,
      isWinPossible: canWin,
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
      const need = opp - my - (myRem - 1) * MAX_KILLS
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

/** Counts by whole numbers and reveals a target half-point only as the final step.
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
          const targetWhole = Math.floor(target)
          if (current < targetWhole) return Math.min(Math.floor(current) + 1, targetWhole)
          return target
        }

        const targetCeiling = Math.ceil(target)
        if (current > targetCeiling) return Math.max(Math.ceil(current) - 1, targetCeiling)
        return target
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
    return JSON.parse(raw) as {
      thomas: Player[]
      ada: Player[]
      thomasName: string
      adaName: string
    }
  } catch {
    return null
  }
}

export function Scoreboard() {
  // SSR/CSR hydration mismatch 방지: 초기값은 항상 서버와 동일한 기본값으로 시작하고,
  // 마운트 ��� useEffect에서 localStorage 값을 불러와 상태에 반영한다.
  const [thomas, setThomas] = useState<Player[]>(INITIAL_THOMAS)
  const [ada, setAda] = useState<Player[]>(INITIAL_ADA)
  const [thomasName, setThomasName] = useState("A")
  const [adaName, setAdaName] = useState("B")
  const teamNameLinked = useRef<Record<Team, boolean>>({ thomas: false, ada: false })
  const playerId = useRef(0)
  const [removeMode, setRemoveMode] = useState<Team | null>(null)

  // animation trigger counter per player id
  const [anim, setAnim] = useState<Record<string, number>>({})
  // previous kills snapshot per player id — used to animate only newly added skulls
  const [prevKillsMap, setPrevKillsMap] = useState<Record<string, number>>({})
  // 선공: first player (any team) to take their turn
  const [firstAttackerId, setFirstAttackerId] = useState<string | null>(null)
  // 점수 초기화 확인 프롬프트
  const [showResetConfirm, setShowResetConfirm] = useState(false)
  // 모두 초기화 확인 프롬프트
  const [showFullResetConfirm, setShowFullResetConfirm] = useState(false)
  // 설명서 모달
  const [showGuide, setShowGuide] = useState(false)

  // 마운트 후 localStorage에서 저장된 점수 복원 (hydration 이후에만 실행)
  useEffect(() => {
    const saved = loadFromStorage()
    if (!saved) return
    if (saved.thomas.length > 0) setThomas(saved.thomas)
    if (saved.ada.length > 0) setAda(saved.ada)
    if (saved.thomasName && saved.thomasName !== "-" && saved.thomasName !== "A") setThomasName(saved.thomasName)
    if (saved.adaName && saved.adaName !== "-" && saved.adaName !== "B") setAdaName(saved.adaName)
  }, [])

  // localStorage 자동 저장 — thomas/ada 점수 및 팀 이름 변경 시마다 저장
  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ thomas, ada, thomasName, adaName }))
    } catch {
      // 저장 실패 시 무시
    }
  }, [thomas, ada, thomasName, adaName])

  // "다음 플레이어" 계산: 선공 팀을 기준으로 교대 순서를 파악한다.
  // 선공 팀이 결정되면, 총 플레이 횟수의 홀짝으로 다음 차례 팀을 정한다.
  // 선공 팀이 없으면 (아직 아무도 안 플레이) null 반환.
  const firstAttackTeam: Team | null = useMemo(() => {
    if (!firstAttackerId) return null
    if (thomas.some((p) => p.id === firstAttackerId)) return "thomas"
    if (ada.some((p) => p.id === firstAttackerId)) return "ada"
    return null
  }, [firstAttackerId, thomas, ada])

  const turn: Team | null = useMemo(() => {
    const thomasPlayed = thomas.filter((p) => p.played).length
    const adaPlayed = ada.filter((p) => p.played).length
    const totalPlayed = thomasPlayed + adaPlayed
    if (totalPlayed === 0) return null

    // 선공 팀을 기준으로 홀짝 판단:
    // 총 플레이 횟수가 짝수이면 선공 팀 차례, 홀수이면 상대 팀 차례
    const firstTeam = firstAttackTeam ?? "thomas"
    const otherTeam: Team = firstTeam === "thomas" ? "ada" : "thomas"

    const nextTeam = totalPlayed % 2 === 0 ? firstTeam : otherTeam

    // 해당 팀에 남은 플레이어가 없으면 상대 팀으로 넘긴다
    const nextRemaining = nextTeam === "thomas"
      ? thomas.filter((p) => !p.played).length
      : ada.filter((p) => !p.played).length
    if (nextRemaining === 0) {
      const otherRemaining = nextTeam === "thomas"
        ? ada.filter((p) => !p.played).length
        : thomas.filter((p) => !p.played).length
      return otherRemaining > 0 ? otherTeam : null
    }
    return nextTeam
  }, [thomas, ada, firstAttackTeam])

  const leftTarget = useMemo(() => teamScore(thomas), [thomas])
  const rightTarget = useMemo(() => teamScore(ada), [ada])

  const leftScore = useCountUp(leftTarget)
  const rightScore = useCountUp(rightTarget)

  // Flare logic: close game -> both lit, otherwise only the leader.
  const diff = leftTarget - rightTarget
  const hasScore = leftTarget > 0 || rightTarget > 0
  const close = hasScore && Math.abs(diff) <= 1
  const orangeLit = hasScore && (close || diff > 0)
  const blueLit = hasScore && (close || diff < 0)

  const cold = useMemo(
    () => computeCold(thomas, ada, turn, thomasName, adaName),
    [thomas, ada, turn, thomasName, adaName],
  )

  // 현재 turn 팀에만 "다음 플레이어" 태그를 표시한다.
  const thomasNext = turn === "thomas" ? thomas.findIndex((p) => !p.played) : -1
  const adaNext = turn === "ada" ? ada.findIndex((p) => !p.played) : -1

  const dragItem = useRef<{ team: Team; id: string } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)

  // 점수가 한 명이라도 입력된 경우 셔플 버튼 잠금
  const hasAnyScore = thomas.some((p) => p.played) || ada.some((p) => p.played)

  function record(team: Team, playerId: string, newKills: number, animate: boolean) {
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
    record(team, playerId, 0, false)
  }

  function handleCancel(team: Team, playerId: string) {
    // 같은 스코어를 다시 눌러 취소 — kills를 0으로 되돌리고 played를 false로 해제
    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((prev) =>
      prev.map((p) =>
        p.id === playerId ? { ...p, kills: 0, played: false } : p,
      ),
    )
    setAnim((a) => ({ ...a, [playerId]: 0 }))
    setPrevKillsMap((prev) => { const next = { ...prev }; delete next[playerId]; return next })
    // 선공자가 취소한 경우 선공 표시도 해제
    setFirstAttackerId((prev) => (prev === playerId ? null : prev))
  }

  function reorder(team: Team, fromId: string, toId: string) {
    if (fromId === toId) return
    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((prev) => {
      const from = prev.findIndex((p) => p.id === fromId)
      const to = prev.findIndex((p) => p.id === toId)
      if (from === -1 || to === -1) return prev
      const next = [...prev]
      const [moved] = next.splice(from, 1)
      next.splice(to, 0, moved)
      return next
    })
  }

  function handleDragEnter(team: Team, targetId: string) {
    const item = dragItem.current
    if (!item || item.team !== team) return
    reorder(team, item.id, targetId)
  }

  function shuffleTeam(team: Team) {
    const setTeam = team === "thomas" ? setThomas : setAda
    setTeam((prev) => {
      const shuffled = [...prev]
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const randomIndex = Math.floor(Math.random() * (index + 1))
        ;[shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]]
      }
      return shuffled
    })
  }

  function addPlayer(team: Team) {
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

  function removePlayer(team: Team, playerId: string) {
    const setTeam = team === "thomas" ? setThomas : setAda
    const roster = team === "thomas" ? thomas : ada
    setTeam((prev) => {
      const next = prev.filter((player) => player.id !== playerId)
      // 모든 팀원이 제거되었을 때만 제거 모드 비활성화
      if (next.length === 0) setRemoveMode(null)
      return next
    })
    setFirstAttackerId((current) => (current === playerId ? null : current))
    setAnim((current) => {
      const next = { ...current }
      delete next[playerId]
      return next
    })
  }

  function updatePlayerName(team: Team, playerId: string, name: string) {
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
    const roster = team === "thomas" ? thomas : ada
    const cleanName = name.trim()
    if (teamNameLinked.current[team] || roster[0]?.id !== playerId || !cleanName) return

    teamNameLinked.current[team] = true
    if (team === "thomas") setThomasName(cleanName)
    else setAdaName(cleanName)
  }

  function reset() {
    setThomas((prev) => prev.map((p) => ({ ...p, kills: 0, played: false, killer: "" })))
    setAda((prev) => prev.map((p) => ({ ...p, kills: 0, played: false, killer: "" })))
    setAnim({})
    setPrevKillsMap({})
    setFirstAttackerId(null)
    setShowResetConfirm(false)
    // localStorage는 useEffect가 상태 변경 후 자동으로 업데이트함
  }

  function handleResetClick() {
    // 이미 확인 프롬프트가 열려있으면 닫기, 아니면 열기
    if (showResetConfirm) {
      setShowResetConfirm(false)
    } else {
      setShowFullResetConfirm(false)
      setShowResetConfirm(true)
    }
  }

  function handleResetConfirm() {
    reset()
  }

  function handleResetCancel() {
    setShowResetConfirm(false)
  }

  function fullReset() {
    setThomas(INITIAL_THOMAS)
    setAda(INITIAL_ADA)
    setThomasName("A")
    setAdaName("B")
    setAnim({})
    setPrevKillsMap({})
    setFirstAttackerId(null)
    setShowFullResetConfirm(false)
    try { localStorage.removeItem(LS_KEY) } catch { /* ignore */ }
  }

  const renderRow = (team: Team, p: Player, index: number, nextIndex: number) => {
    const active = turn === team && index === nextIndex && nextIndex !== -1
    const selgong = p.id === firstAttackerId
    const isThomas = team === "thomas"
    return (
      <div key={p.id} className="relative">
        <PlayerRow
          player={p}
          team={team}
          active={active}
          animId={anim[p.id] ?? 0}
          prevKills={prevKillsMap[p.id] ?? 0}
          dragging={draggingId === p.id}
          removeMode={removeMode === team}
          onRemove={() => removePlayer(team, p.id)}
          onScore={(nk) => handleScore(team, p.id, nk)}
          onZeroKill={() => handleZeroKill(team, p.id)}
          onCancel={() => handleCancel(team, p.id)}
          onNameChange={(name) => updatePlayerName(team, p.id, name)}
          onNameCommit={(name) => commitPlayerName(team, p.id, name)}
          onKillerChange={(killer) => {
            const setter = team === "thomas" ? setThomas : setAda
            setter((prev) => prev.map((pl) => pl.id === p.id ? { ...pl, killer } : pl))
          }}
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
          <span
            className={`absolute -top-2.5 z-10 whitespace-nowrap rounded-sm bg-neutral-950/95 px-2 text-xs font-bold text-dbd-yellow ${
              isThomas ? "right-3" : "left-3"
            }`}
            style={{ fontFamily: "var(--font-godo)", fontWeight: 700 }}
          >
            선공
          </span>
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
      </div>
    )
  }

  return (
    <main className="trial-arena relative min-h-screen w-full overflow-hidden text-foreground" onClick={() => { if (removeMode) setRemoveMode(null) }}>
      <div className="arena-fog" aria-hidden="true" />
      <div className="arena-scratches" aria-hidden="true" />
      <div className="arena-axis" aria-hidden="true" />

      <div className="relative mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-5 pb-28 md:px-8 md:py-6 md:pb-28">
        {/* editable team titles */}
        <div className="grid grid-cols-2 gap-4 border-b border-foreground/10 pb-4">
          <h1 className="flex items-center justify-center gap-2 text-3xl md:text-5xl overflow-visible">
            {/* 숨겨진 span으로 실제 렌더 폭을 측정해 input에 적용 */}
            <span className="relative inline-block pr-[0.35em]">
              <span
                aria-hidden="true"
                className="invisible whitespace-pre font-bold italic text-dbd-orange pr-[0.35em]"
                style={{ fontFamily: "var(--font-aldrich)" }}
              >{thomasName || " "}</span>
              <input
                value={thomasName}
                onChange={(e) => setThomasName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur() }}
                aria-label="왼쪽 팀 이름"
                className="absolute inset-0 w-full bg-transparent text-right font-bold italic outline-none drop-shadow-[0_3px_12px_color-mix(in_oklch,var(--dbd-orange),transparent_55%)] focus:opacity-80 text-dbd-orange pr-[0.35em]"
                style={{ fontFamily: "var(--font-aldrich)" }}
              />
            </span>
            <span className="font-bold italic text-white/95" style={{ fontFamily: "var(--font-aldrich)" }}>팀</span>
          </h1>
          <h1 className="flex items-center justify-center gap-2 text-3xl md:text-5xl overflow-visible">
            <span className="relative inline-block pr-[0.35em]">
              <span
                aria-hidden="true"
                className="invisible whitespace-pre font-bold italic text-dbd-blue pr-[0.35em]"
                style={{ fontFamily: "var(--font-aldrich)" }}
              >{adaName || " "}</span>
              <input
                value={adaName}
                onChange={(e) => setAdaName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229) e.currentTarget.blur() }}
                aria-label="오른쪽 팀 이름"
                className="absolute inset-0 w-full bg-transparent text-right font-bold italic outline-none drop-shadow-[0_3px_12px_color-mix(in_oklch,var(--dbd-blue),transparent_55%)] focus:opacity-80 text-dbd-blue pr-[0.35em]"
                style={{ fontFamily: "var(--font-aldrich)" }}
              />
            </span>
            <span className="font-bold italic text-white/95" style={{ fontFamily: "var(--font-aldrich)" }}>팀</span>
          </h1>
        </div>

        {/* rosters */}
        <div className="mt-1 grid grid-cols-1 gap-5 md:h-96 md:grid-cols-2 md:gap-12 lg:gap-20">
          <div className="flex w-full max-w-xl flex-col justify-self-end gap-2">
            <div className="flex items-center gap-1 text-neutral-400">
              <ShuffleButton teamName={thomasName} onClick={() => shuffleTeam("thomas")} disabled={hasAnyScore} />
              <button
                type="button"
                onClick={() => addPlayer("thomas")}
                disabled={thomas.length >= MAX_PLAYERS_PER_TEAM}
                aria-label="왼쪽 팀원 추가"
                title={thomas.length >= MAX_PLAYERS_PER_TEAM ? "최대 4명까지 추가할 수 있습니다" : "팀원 추가"}
                className="group size-9 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
              >
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Addplayer-j1Wdqcd9gLokCKfKVrdt96Gu5wBqbM.png"
                  alt=""
                  draggable={false}
                  className="size-full object-cover transition-[filter] group-hover:brightness-125"
                />
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setRemoveMode((current) => current === "thomas" ? null : "thomas") }}
                aria-label="왼쪽 팀원 제거 선택"
                title={removeMode === "thomas" ? "제거 모드 취소" : "팀원 제거"}
                aria-pressed={removeMode === "thomas"}
                className={cn("group size-9 overflow-hidden rounded-sm transition-[transform,filter] hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue", removeMode === "thomas" && "drop-shadow-[0_0_8px_var(--dbd-red)]")}
              >
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Removeplayer-ExYhz8hM8Tgzqopazw6mq4EtaVtoK4.png"
                  alt=""
                  draggable={false}
                  className={cn("size-full object-cover transition-[filter] group-hover:brightness-125", removeMode === "thomas" && "brightness-125")}
                />
              </button>
            </div>
            <div className="flex min-h-36 flex-col gap-3" onClick={(event) => {
              if (event.target === event.currentTarget && removeMode === "thomas") setRemoveMode(null)
            }}>
              {thomas.length === 0 ? <EmptyRoster onClick={() => removeMode === "thomas" ? setRemoveMode(null) : addPlayer("thomas")} /> : thomas.map((p, i) => renderRow("thomas", p, i, thomasNext))}
            </div>
          </div>

          <div className="flex w-full max-w-xl flex-col gap-2">
            <div className="flex items-center justify-end gap-1 text-neutral-400">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setRemoveMode((current) => current === "ada" ? null : "ada") }}
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
                disabled={ada.length >= MAX_PLAYERS_PER_TEAM}
                aria-label="오른쪽 팀원 추가"
                title={ada.length >= MAX_PLAYERS_PER_TEAM ? "최대 4명까지 추가�� 수 있습니다" : "팀원 추가"}
                className="group size-9 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
              >
                <img
                  src="https://hebbkx1anhila5yf.public.blob.vercel-storage.com/Addplayer-j1Wdqcd9gLokCKfKVrdt96Gu5wBqbM.png"
                  alt=""
                  draggable={false}
                  className="size-full object-cover transition-[filter] group-hover:brightness-125"
                />
              </button>
              <ShuffleButton teamName={adaName} onClick={() => shuffleTeam("ada")} disabled={hasAnyScore} />
            </div>
            <div className="flex min-h-36 flex-col gap-3" onClick={(event) => {
              if (event.target === event.currentTarget && removeMode === "ada") setRemoveMode(null)
            }}>
              {ada.length === 0 ? <EmptyRoster onClick={() => removeMode === "ada" ? setRemoveMode(null) : addPlayer("ada")} /> : ada.map((p, i) => renderRow("ada", p, i, adaNext))}
            </div>
          </div>
        </div>

        {/* center score */}
        <div className="relative flex h-56 shrink-0 translate-y-4 items-center justify-center py-4 md:py-6">
          <TeamScore
            left={leftScore}
            right={rightScore}
            orangeLit={orangeLit}
            blueLit={blueLit}
            close={close}
          />
        </div>

        {/* cold game warning / result */}
        <div className="cold-game-box mb-4">
          {cold.status === "warning" && (
            <>
              {/* 콜드게임 적용 여부에 따라 제목 분기 */}
              <p className="cold-warning-title">
                {cold.isGeneral ? "알림" : "콜드게임 경고"}
              </p>
              <div className="cold-warning-text flex flex-col items-center gap-1">
                {/* 현재 차례 팀 경고 (need > 0인 경우만) */}
                {cold.need > 0 && (
                  <p>
                    <span className={`cold-team-name ${cold.name === thomasName ? "cold-team-thomas" : "cold-team-ada"}`}>
                      {cold.name} 팀
                    </span>{" "}
                    {cold.isGeneral
                      ? cold.isWinPossible
                        ? cold.need >= MAX_KILLS
                          ? (
                            <>
                              {"이번 경기에서 "}
                              <span className="cold-kill-count">{"올킬"}</span>
                              {" 하면 우승"}
                            </>
                          )
                          : (
                            <>
                              {"이번 경기에서 "}
                              <span className="cold-kill-count">{fmt(cold.need)}킬</span>
                              {" 이상 하면 우승"}
                            </>
                          )
                        : (
                          <>
                            {"이번 경기에서 "}
                            <span className="cold-kill-count">{"올킬"}</span>
                            {"을 해야 동점"}
                          </>
                        )
                      : cold.need >= MAX_KILLS
                        ? (
                          <>
                            {"이번 경기에서 "}
                            <span className="cold-kill-count">{"올킬"}</span>
                            {"을 해야 동점"}
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
                )}
                {/* 다음 경기 전부 생존 조건 */}
                {cold.nextSurviveRequired && (
                  <p>
                    {"그리고, 다음 경기 전부 생존해야 동점이 가능합니다"}
                  </p>
                )}
                {/* 상대팀 이번 경기 생존 경고 (현재 차례 팀이 1킬이���도 하면 상대 콜드) */}
                {cold.opponentMustSurviveName && (
                  <p>
                    <span className={`cold-team-name ${cold.opponentMustSurviveName === thomasName ? "cold-team-thomas" : "cold-team-ada"}`}>
                      {cold.opponentMustSurviveName} 팀
                    </span>{" "}
                    {"이번 경기 전부 생존해야 합니다"}
                  </p>
                )}
              </div>
            </>
          )}
          {cold.status === "cold" && (
            <>
                <p className="cold-game-title">콜드게임!</p>
              <p className="cold-game-text">
                <span className={`cold-team-name ${cold.name === thomasName ? 'cold-team-thomas' : 'cold-team-ada'}`}>
                  {cold.name} 팀
                </span>{" "}
                역전 불가 — 경기 종료
              </p>
            </>
          )}
        </div>

        {/* 설명서 모달 */}
        {showGuide && (
          <>
            <div
              className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm"
              onClick={() => setShowGuide(false)}
            />
            <div className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center p-4">
              <div className="pointer-events-auto relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-lg">
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="absolute top-4 right-4 z-10 size-8 flex items-center justify-center rounded bg-black/60 text-white transition-colors hover:bg-black/80"
                  aria-label="Close guide"
                >
                  ✕
                </button>
                <img
                  src="/images/guide.jpg"
                  alt="Game Guide"
                  className="h-auto w-full"
                />
              </div>
            </div>
          </>
        )}

        {/* backdrop for closing prompts on background click */}
        {(showResetConfirm || showFullResetConfirm) && (
          <div
            className="fixed inset-0 z-40 cursor-default bg-transparent"
            onClick={() => {
              setShowResetConfirm(false)
              setShowFullResetConfirm(false)
            }}
          />
        )}

        {/* fixed utility controls */}
        <div className="fixed bottom-5 left-4 z-50 flex flex-col gap-2 text-neutral-300 md:bottom-6 md:left-8">
          <FooterBtn
            onClick={() => {
              setShowResetConfirm(false)
              setShowFullResetConfirm(false)
              setShowGuide(true)
            }}
          >
            설명서
          </FooterBtn>
          {/* 점수 초기화 */}
          <div className="relative">
            <button
              type="button"
              onClick={handleResetClick}
              className="rounded border border-dbd-yellow/70 bg-black/80 px-3 py-1 text-sm text-dbd-yellow backdrop-blur-sm transition-colors hover:bg-dbd-yellow/10"
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              점수 초기화
            </button>
            {showResetConfirm && (
              <div className="absolute left-full bottom-0 ml-2 z-50 flex flex-col gap-2 rounded border border-dbd-yellow/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
                <p className="text-xs text-neutral-200">점수를 초기화하시겠습니까?</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleResetConfirm}
                    className="rounded border border-dbd-yellow/70 bg-dbd-yellow/10 px-2 py-1 text-xs text-dbd-yellow transition-colors hover:bg-dbd-yellow/20"
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
          {/* 모두 초기화 */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                // 이미 확인 프롬프트가 열려있으면 닫기, 아니면 열기
                if (showFullResetConfirm) {
                  setShowFullResetConfirm(false)
                } else {
                  setShowResetConfirm(false)
                  setShowFullResetConfirm(true)
                }
              }}
              className="rounded border border-red-700/70 bg-black/80 px-3 py-1 text-sm text-red-400 backdrop-blur-sm transition-colors hover:bg-red-900/20"
              style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
            >
              모두 초기화
            </button>
            {showFullResetConfirm && (
              <div className="absolute left-full bottom-0 ml-2 z-50 flex flex-col gap-2 rounded border border-red-700/50 bg-black/95 p-3 backdrop-blur-sm whitespace-nowrap">
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
                    onClick={() => setShowFullResetConfirm(false)}
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
      </div>
    </main>
  )
}

function EmptyRoster({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-36 w-full items-center justify-center rounded-md border border-dashed border-neutral-700 bg-black/25 px-4 text-center text-sm leading-relaxed text-neutral-400 transition-colors hover:border-neutral-500 hover:bg-black/40 hover:text-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue"
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
      title={disabled ? "점수 초기화 후 ��기가 가능합니다" : "팀원 무작위 배치"}
      className="group size-12 overflow-hidden rounded-sm transition-transform hover:scale-105 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-dbd-blue disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:scale-100"
    >
      <img
        src="/images/random.png"
        alt=""
        draggable={false}
        className="size-full object-cover transition-[filter] group-hover:brightness-125"
      />
    </button>
  )
}



function FooterBtn({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded border border-neutral-600 bg-black/50 px-3 py-1 text-sm transition-colors hover:border-neutral-400 hover:text-white"
      style={{ fontFamily: "var(--font-godo)", fontWeight: 400 }}
    >
      {children}
    </button>
  )
}

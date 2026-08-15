import { MAX_KILLS, type Player } from "@/components/player-row"

export type Team = "thomas" | "ada"

export const VALID_4V4_STEPS = [1, 2, 3, 3.5, 4] as const

/** 4v4 모드에서 실제 득점 가능한 킬 수 단위: 1, 2, 3, 3.5, 4킬만 올림 계산 */
export function toValid4v4Step(rawNeed: number): number {
  if (rawNeed <= 0) return 0
  if (rawNeed <= 1) return 1
  if (rawNeed <= 2) return 2
  if (rawNeed <= 3) return 3
  if (rawNeed <= 3.5) return 3.5
  return 4
}

export type SecondaryCondition =
  | { type: "survive_all" }
  | { type: "survive_min"; minSurvive: number; maxAllowedKills: number }
  | { type: "survive_and_next_kill"; nextNeed: number }

export type ColdState =
  | { status: "none" }
  | {
      status: "warning"
      name: string
      need: number
      /** 연계 조건 (올킬 후 생존/차기 주자 조건 등) */
      secondaryCondition?: SecondaryCondition
      /** 경고 대상 팀 관점에서, 다음 경기에 살아남아야 하는 조건 (하위 호환 플래그) */
      nextSurviveRequired?: boolean
      /** 경고 대상 팀 관점에서, 다음 경기 이후 또 한 번 최소 필요 킬 (하위 호환 플래그) */
      nextNeed?: number
      /**
       * 현재 차례 팀이 1킬이라도 하면 상대팀이 콜드게임 확정되는 경우,
       * 상대팀에게 "이번 경기 전부 생존해야 합니다" 경고를 함께 표시한다.
       */
      opponentMustSurviveName?: string
      /** 상대팀이 이번 경기 생존 후, 다음 경기에서 필요한 킬수 */
      opponentMustSurviveNextNeed?: number
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

export const teamScore = (players: Player[]) =>
  players.reduce((s, p) => s + p.kills, 0)

export const fmtKills = (n: number) =>
  Number.isInteger(n) ? String(n) : n.toFixed(1)

/**
 * Best/worst-case reachability. Each remaining (un-played) player can still
 * score up to MAX_KILLS. A team is mathematically out ("cold game") once its
 * best possible final total can no longer reach the opponent's *current*
 * score. One step before that, we warn the team currently on the clock about
 * the minimum they must get this match to stay alive, along with secondary conditions.
 */
export function computeCold(
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
    const winNeedStep = VALID_4V4_STEPS.find((step) => my + step > opp)
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
      const opponentMustSurviveNextNeed = opponentMustSurviveName && oppRem > 0 ? 4 : undefined

      // ── 현재 차례 팀 경고 ─────────────────────────────────────────
      // 이번 선수가 최소 need킬, 나머지 내 선수들이 모두 MAX_KILLS를 해야 동점
      const rawNeed = opp - my - (myRem - 1) * MAX_KILLS
      const need = toValid4v4Step(rawNeed)
      if (need > 0) {
        const myRemainingAfterThis = myRem - 1
        const maxAllowedOppKills = (my + need + myRemainingAfterThis * MAX_KILLS) - opp

        let secondaryCondition: SecondaryCondition | undefined

        // 선행 조건이 '올킬(MAX_KILLS)'일 때만 뒤따르는 연계 조건을 산출한다.
        // need < MAX_KILLS인 경우(예: 1~3.5킬)는 실제 경기에서 더 많은 킬을 획득하면
        // 뒤따르는 조건이 달라질 수 있으므로 연계 조건을 붙이지 않고 단순 킬수만 안내한다.
        if (need >= MAX_KILLS) {
          if (oppRem > 0 && myRem === 1) {
            // 우리 팀의 마지막 주자이고 상대 주자가 남아있는 경우
            if (maxAllowedOppKills < 1) {
              secondaryCondition = { type: "survive_all" }
            } else if (maxAllowedOppKills < 2) {
              secondaryCondition = { type: "survive_min", minSurvive: 3, maxAllowedKills: 1 }
            } else if (maxAllowedOppKills < 3) {
              secondaryCondition = { type: "survive_min", minSurvive: 2, maxAllowedKills: 2 }
            } else if (maxAllowedOppKills < 4) {
              secondaryCondition = { type: "survive_min", minSurvive: 1, maxAllowedKills: 3 }
            }
          } else if (oppRem > 0 && myRem > 1) {
            // 양 팀 모두 추가 주자가 남아있는 경우
            if (maxAllowedOppKills < 1) {
              secondaryCondition = { type: "survive_and_next_kill", nextNeed: 4 }
            } else if (maxAllowedOppKills < 2) {
              secondaryCondition = { type: "survive_min", minSurvive: 3, maxAllowedKills: 1 }
            } else if (maxAllowedOppKills < 3) {
              secondaryCondition = { type: "survive_min", minSurvive: 2, maxAllowedKills: 2 }
            } else if (maxAllowedOppKills < 4) {
              secondaryCondition = { type: "survive_min", minSurvive: 1, maxAllowedKills: 3 }
            }
          }
        }

        const nextSurviveRequired =
          secondaryCondition?.type === "survive_all" ||
          secondaryCondition?.type === "survive_and_next_kill"

        return {
          status: "warning",
          name: myName,
          need,
          secondaryCondition,
          nextSurviveRequired,
          opponentMustSurviveName,
          opponentMustSurviveNextNeed,
        }
      }

      // ── 선제 콜드게임 우승 알림 ────────────────────────────────────
      // 현재 차례 팀에게 방어적 경고(need > 0)가 없는 상황에서,
      // 이번 주자가 일정 킬 수 이상을 올리면 상대의 남은 모든 경기 결과와 무관하게
      // 콜드게임으로 즉시 우승이 확정되는지 체크한다.
      const earlyWinNeed = VALID_4V4_STEPS.find((step) => my + step > oppMaxNow)
      if (earlyWinNeed !== undefined) {
        return {
          status: "warning",
          name: myName,
          need: earlyWinNeed,
          isEarlyWinNotice: true,
          isGeneral: true,
          opponentMustSurviveName,
          opponentMustSurviveNextNeed,
        }
      }

      // 현재 차례 팀에게 경고는 없지만 상대가 생존해야 하는 경우
      if (opponentMustSurviveName) {
        return {
          status: "warning",
          name: opponentMustSurviveName,
          need: 0,
          opponentMustSurviveName,
          opponentMustSurviveNextNeed,
        }
      }
    }
  }
  return { status: "none" }
}

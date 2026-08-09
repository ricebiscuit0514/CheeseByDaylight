"use client"

import { forwardRef, type CSSProperties } from "react"
import { SKULLS_PER_PLAYER, type Player } from "@/components/player-row"
import type { CaptureMatchResult } from "@/lib/capture-match-result"
import {
  buildAceRoundCaptureBlocks,
  formatAceRoundScore,
  type AceRoundLogEntry,
} from "@/lib/ace-round-log"

type Team = "thomas" | "ada"

const SKULL_URL = "/images/skull.webp"
const ORANGE = "#f97316"
const BLUE = "#3b82f6"
const YELLOW = "#eab308"
const FONT_GODO = "'Godo', sans-serif"
const FONT_ALDRICH = "'Aldrich', sans-serif"
const PLATE_HEIGHT = "58px"
const NAME_WIDTH = "148px"
const SKULL_SIZE = "38px"
const SCORE_DROP_WITH_RESULT = 68
const SCORE_DROP_WITHOUT_RESULT = 38
const SELGONG_MARKER = "(선)"

function CapturePlayerName({
  name,
  team,
  isFirstAttacker,
  style,
  nameColor,
}: {
  name: string
  team: Team
  isFirstAttacker: boolean
  style: "roster" | "ace"
  nameColor?: string
}) {
  const marker = isFirstAttacker ? (
    <span style={{ color: YELLOW }}>{SELGONG_MARKER}</span>
  ) : null

  const nameEl = (
    <span style={nameColor ? { color: nameColor } : undefined}>{name}</span>
  )

  if (!isFirstAttacker) return nameEl

  const markerFirst =
    style === "roster" ? team === "ada" : team === "thomas"

  if (markerFirst) {
    return (
      <>
        {marker}
        {nameEl}
      </>
    )
  }

  return (
    <>
      {nameEl}
      {marker}
    </>
  )
}

function formatScore(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

function getLeftScoreShift(score: number) {
  const wholePart = formatScore(score).split(".")[0] ?? ""
  if (wholePart.length === 1) return -7
  if (wholePart.length >= 2) return 21
  return -7
}

function getLeftScoreTransform(score: number, dropY: number) {
  return `translate(${getLeftScoreShift(score)}px, ${dropY}px)`
}

function getRightScoreTransform(dropY: number) {
  return `translateY(${dropY}px)`
}

function posForIndex(index: number, isThomas: boolean) {
  return isThomas ? index : SKULLS_PER_PLAYER - 1 - index
}

function fillFor(position: number, kills: number): 0 | 0.5 | 1 {
  if (kills - position >= 1) return 1
  if (kills - position >= 0.5) return 0.5
  return 0
}

function plateClipPath(team: Team): string {
  if (team === "thomas") {
    return "polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 10px 100%, 0 calc(100% - 10px))"
  }
  return "polygon(12px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 12px)"
}

function plateStyle(team: Team): CSSProperties {
  return {
    position: "relative",
    display: "flex",
    flex: 1,
    alignItems: "center",
    gap: "12px",
    height: PLATE_HEIGHT,
    minHeight: PLATE_HEIGHT,
    padding: "0 12px",
    overflow: "hidden",
    border: "1px solid rgba(255,255,255,0.1)",
    borderLeft:
      team === "thomas"
        ? `3px solid rgba(249,115,22,0.72)`
        : "1px solid rgba(255,255,255,0.1)",
    borderRight:
      team === "ada"
        ? `3px solid rgba(59,130,246,0.72)`
        : "1px solid rgba(255,255,255,0.1)",
    background: "rgba(10,10,10,0.96)",
    clipPath: plateClipPath(team),
    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.04)",
  }
}

function PlateGrain() {
  return (
    <span
      aria-hidden
      style={{
        position: "absolute",
        inset: 0,
        opacity: 0.18,
        pointerEvents: "none",
        background:
          "repeating-linear-gradient(167deg, transparent 0 7px, rgba(255,255,255,0.06) 8px, transparent 9px 15px)",
      }}
    />
  )
}

function CaptureSkull({
  fill,
  team,
}: {
  fill: 0 | 0.5 | 1
  team: Team
}) {
  const isThomas = team === "thomas"
  const halfClip =
    fill === 0.5
      ? isThomas
        ? "inset(0 50% 0 0)"
        : "inset(0 0 0 50%)"
      : undefined

  return (
    <span
      style={{
        position: "relative",
        display: "inline-block",
        width: SKULL_SIZE,
        height: SKULL_SIZE,
        flexShrink: 0,
      }}
    >
      <img
        src={SKULL_URL}
        alt=""
        width={38}
        height={38}
        draggable={false}
        style={{
          display: "block",
          width: SKULL_SIZE,
          height: SKULL_SIZE,
          opacity: 0.14,
          filter: "grayscale(1) brightness(0.42)",
        }}
      />
      {fill > 0 && (
        <img
          src={SKULL_URL}
          alt=""
          width={38}
          height={38}
          draggable={false}
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            display: "block",
            width: SKULL_SIZE,
            height: SKULL_SIZE,
            clipPath: halfClip,
            filter: `drop-shadow(0 3px 2px #050505) drop-shadow(0 0 6px ${team === "thomas" ? "rgba(249,115,22,0.5)" : "rgba(59,130,246,0.5)"})`,
          }}
        />
      )}
    </span>
  )
}

function CapturePlayerRow({
  player,
  team,
  isFirstAttacker = false,
}: {
  player: Player
  team: Team
  isFirstAttacker?: boolean
}) {
  const isThomas = team === "thomas"
  const killer = player.killer?.trim() ?? ""
  const playerName = player.name.trim() || "이름 없음"

  const killerBadge = killer ? (
    <span
      style={{
        flexShrink: 0,
        borderRadius: "4px",
        border: "1px solid rgba(234,179,8,0.85)",
        backgroundColor: "rgba(6,6,6,0.95)",
        padding: "4px 8px",
        fontSize: "11px",
        lineHeight: 1,
        color: YELLOW,
        fontFamily: FONT_GODO,
        fontWeight: 400,
        whiteSpace: "nowrap",
      }}
    >
      {killer}
    </span>
  ) : null

  const nameBlock = (
    <span
      style={{
        display: "flex",
        alignItems: "center",
        alignSelf: "stretch",
        width: NAME_WIDTH,
        minWidth: NAME_WIDTH,
        maxWidth: NAME_WIDTH,
        flexShrink: 0,
        fontSize: "16px",
        fontWeight: 700,
        lineHeight: 1,
        letterSpacing: "-0.02em",
        color: "#f5f5f5",
        fontFamily: FONT_GODO,
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        justifyContent: isThomas ? "flex-start" : "flex-end",
        transform: "translateY(-7px)",
      }}
    >
      {isFirstAttacker ? (
        <CapturePlayerName
          name={playerName}
          team={team}
          isFirstAttacker
          style="roster"
        />
      ) : (
        playerName
      )}
    </span>
  )

  const skullBlock = (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "3px",
        flexShrink: 0,
      }}
    >
      {Array.from({ length: SKULLS_PER_PLAYER }).map((_, index) => {
        const position = posForIndex(index, isThomas)
        return (
          <CaptureSkull
            key={index}
            team={team}
            fill={fillFor(position, player.kills)}
          />
        )
      })}
    </div>
  )

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "8px",
        width: "100%",
      }}
    >
      {isThomas && killerBadge}
      <div style={{ ...plateStyle(team), zIndex: 0 }}>
        <PlateGrain />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            display: "flex",
            alignItems: "center",
            flex: 1,
            gap: "12px",
            height: "100%",
            minWidth: 0,
          }}
        >
          {isThomas ? (
            <>
              {nameBlock}
              <div style={{ flex: 1, minWidth: 0 }} aria-hidden />
              {skullBlock}
            </>
          ) : (
            <>
              {skullBlock}
              <div style={{ flex: 1, minWidth: 0 }} aria-hidden />
              {nameBlock}
            </>
          )}
        </div>
      </div>
      {!isThomas && killerBadge}
    </div>
  )
}

type ScoreboardCaptureCardProps = {
  thomas: Player[]
  ada: Player[]
  thomasName: string
  adaName: string
  leftScore: number
  rightScore: number
  matchResult?: CaptureMatchResult | null
  aceRoundLog?: AceRoundLogEntry[]
  mainFirstAttackerId?: string | null
}

export const ScoreboardCaptureCard = forwardRef<
  HTMLDivElement,
  ScoreboardCaptureCardProps
>(function ScoreboardCaptureCard(
  { thomas, ada, thomasName, adaName, leftScore, rightScore, matchResult = null, aceRoundLog = [], mainFirstAttackerId = null },
  ref,
) {
  const leftTeamLabel = thomasName.trim() || "A"
  const rightTeamLabel = adaName.trim() || "B"
  const scoreDropY = matchResult
    ? SCORE_DROP_WITH_RESULT
    : SCORE_DROP_WITHOUT_RESULT
  const aceRoundBlocks = buildAceRoundCaptureBlocks(aceRoundLog)

  return (
    <div
      ref={ref}
      data-scoreboard-capture-root
      style={{
        width: "880px",
        borderRadius: "10px",
        border: "1px solid rgba(255,255,255,0.12)",
        background:
          "linear-gradient(180deg, rgba(14,14,14,1) 0%, rgba(5,5,5,1) 100%)",
        padding: "28px 32px 30px",
        color: "#ffffff",
        fontFamily: FONT_GODO,
        boxShadow:
          "0 0 0 1px rgba(0,0,0,0.8), 0 24px 48px rgba(0,0,0,0.55)",
      }}
    >
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "end",
          gap: "20px",
          marginBottom: matchResult ? "12px" : "18px",
        }}
      >
        <div style={{ textAlign: "right", paddingRight: "12px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "60px",
              fontWeight: 700,
              lineHeight: 0.82,
              color: ORANGE,
              fontFamily: FONT_ALDRICH,
              fontStyle: "italic",
              textShadow: "0 4px 0 rgba(5,5,5,0.95)",
              transform: getLeftScoreTransform(leftScore, scoreDropY),
            }}
          >
            {formatScore(leftScore)}
          </p>
        </div>
        <span
          style={{
            display: "block",
            margin: 0,
            padding: "0 6px",
            fontSize: "22px",
            fontWeight: 700,
            fontStyle: "italic",
            lineHeight: 0.82,
            letterSpacing: "-0.1em",
            color: "#d4d4d4",
            fontFamily: FONT_ALDRICH,
            transform: getRightScoreTransform(scoreDropY),
          }}
        >
          VS
        </span>
        <div style={{ textAlign: "left", paddingLeft: "12px" }}>
          <p
            style={{
              margin: 0,
              fontSize: "60px",
              fontWeight: 700,
              lineHeight: 0.82,
              color: BLUE,
              fontFamily: FONT_ALDRICH,
              fontStyle: "italic",
              textShadow: "0 4px 0 rgba(5,5,5,0.95)",
              transform: getRightScoreTransform(scoreDropY),
            }}
          >
            {formatScore(rightScore)}
          </p>
        </div>
      </div>

      {matchResult?.alignTeam === "center" && (
        <p
          style={{
            margin: "0 0 12px",
            fontSize: 20,
            fontWeight: 700,
            color: YELLOW,
            fontFamily: FONT_GODO,
            letterSpacing: "0.02em",
            textAlign: "center",
          }}
        >
          {matchResult.label}
        </p>
      )}

      {matchResult && matchResult.alignTeam !== "center" && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0 28px",
            marginBottom: "12px",
          }}
        >
          <p
            style={{
              margin: 0,
              minHeight: "28px",
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.4,
              color: YELLOW,
              fontFamily: FONT_GODO,
              letterSpacing: "0.02em",
              textAlign: "left",
            }}
          >
            {matchResult.alignTeam === "thomas" ? matchResult.label : ""}
          </p>
          <p
            style={{
              margin: 0,
              minHeight: "28px",
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.4,
              color: YELLOW,
              fontFamily: FONT_GODO,
              letterSpacing: "0.02em",
              textAlign: "right",
            }}
          >
            {matchResult.alignTeam === "ada" ? matchResult.label : ""}
          </p>
        </div>
      )}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "0 28px",
          marginBottom: "14px",
        }}
      >
        <p
          style={{
            margin: 0,
            fontSize: "21px",
            fontFamily: FONT_GODO,
            fontWeight: 700,
            textAlign: "left",
            letterSpacing: "normal",
          }}
        >
          <span style={{ color: ORANGE }}>{leftTeamLabel}</span>
          <span style={{ color: "rgba(255,255,255,0.45)", marginLeft: "4px" }}>
            팀
          </span>
        </p>
        <p
          style={{
            margin: 0,
            fontSize: "21px",
            fontFamily: FONT_GODO,
            fontWeight: 700,
            textAlign: "right",
            letterSpacing: "normal",
          }}
        >
          <span style={{ color: BLUE }}>{rightTeamLabel}</span>
          <span style={{ color: "rgba(255,255,255,0.45)", marginLeft: "4px" }}>
            팀
          </span>
        </p>
      </div>

      <div
        style={{
          height: "1px",
          marginBottom: "18px",
          background:
            "linear-gradient(90deg, rgba(249,115,22,0.35), rgba(255,255,255,0.12) 50%, rgba(59,130,246,0.35))",
        }}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "14px 28px",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {thomas.length === 0 ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#737373" }}>
              팀원 없음
            </p>
          ) : (
            thomas.map((player) => (
              <CapturePlayerRow
                key={player.id}
                player={player}
                team="thomas"
                isFirstAttacker={mainFirstAttackerId === player.id}
              />
            ))
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
          {ada.length === 0 ? (
            <p style={{ margin: 0, fontSize: "13px", color: "#737373" }}>
              팀원 없음
            </p>
          ) : (
            ada.map((player) => (
              <CapturePlayerRow
                key={player.id}
                player={player}
                team="ada"
                isFirstAttacker={mainFirstAttackerId === player.id}
              />
            ))
          )}
        </div>
      </div>

      {aceRoundBlocks.length > 0 && (
        <div
          style={{
            marginTop: "18px",
            paddingTop: "16px",
            borderTop: "1px solid rgba(255,255,255,0.1)",
            textAlign: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "16px",
            }}
          >
            {aceRoundBlocks.map((block) => (
              <div key={block.entry.key ?? `ace-round-${block.roundNumber}`}>
                <p
                  style={{
                    margin: "0 0 6px",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: YELLOW,
                    fontFamily: FONT_GODO,
                    letterSpacing: "0.02em",
                  }}
                >
                  에이스 결정전 ({block.roundNumber}경기)
                </p>
                <p
                  style={{
                    margin: "0 0 8px",
                    fontSize: "15px",
                    fontWeight: 700,
                    fontFamily: FONT_GODO,
                    lineHeight: 1.4,
                    color: "#ffffff",
                  }}
                >
                  {formatAceRoundScore(block.entry.thomasKills)}
                  <span
                    style={{ color: "rgba(255,255,255,0.45)", margin: "0 6px" }}
                  >
                    vs
                  </span>
                  {formatAceRoundScore(block.entry.adaKills)}
                </p>
                <p
                  style={{
                    margin: 0,
                    fontSize: "16px",
                    lineHeight: 1.45,
                    fontFamily: FONT_GODO,
                    fontWeight: 700,
                  }}
                >
                  <span>
                    <CapturePlayerName
                      name={block.entry.thomasPlayerName}
                      team="thomas"
                      isFirstAttacker={block.entry.firstAttackerTeam === "thomas"}
                      style="ace"
                      nameColor={ORANGE}
                    />
                  </span>
                  <span
                    style={{ color: "rgba(255,255,255,0.45)", margin: "0 6px" }}
                  >
                    vs
                  </span>
                  <span>
                    <CapturePlayerName
                      name={block.entry.adaPlayerName}
                      team="ada"
                      isFirstAttacker={block.entry.firstAttackerTeam === "ada"}
                      style="ace"
                      nameColor={BLUE}
                    />
                  </span>
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
})

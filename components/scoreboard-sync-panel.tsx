"use client"

import { useEffect, useRef, useState } from "react"
import { Copy, Link2, Unplug, Wifi } from "lucide-react"
import { useAutoDismiss } from "@/hooks/use-auto-dismiss"
import { useDismissOnOutsideInteraction } from "@/hooks/use-dismiss-on-outside-interaction"
import { cn } from "@/lib/utils"
import { buildDiscordInviteMessage } from "@/lib/firebase/scoreboard-room"
import type {
  ScoreboardRoomRole,
  ScoreboardRoomStatus,
} from "@/hooks/use-scoreboard-room"

const DISCORD_BUTTON =
  "border-[#5865F2] bg-[#5865F2] font-bold text-white hover:border-[#4752C4] hover:bg-[#4752C4]"
const DISCORD_BUTTON_COPIED =
  "border-[#4752C4] bg-[#5865F2] font-bold text-white"
const CHZZK_GREEN_BUTTON =
  "border-emerald-500/80 text-emerald-300 hover:bg-emerald-950/40"
const CHZZK_GREEN_GUIDE =
  "border-emerald-500/80 text-emerald-300"
const CHZZK_GREEN_PANEL =
  "border-emerald-500/50 bg-black/95 shadow-[0_0_24px_rgba(16,185,129,0.12)]"
const CHZZK_GREEN_ACCENT = "text-emerald-300"
const CHZZK_GREEN_ACTION =
  "border-emerald-500/80 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
const DEFAULT_GUIDE_KEY = "dbd-sync-guide-seen-4v4"

type ScoreboardSyncPanelProps = {
  role: ScoreboardRoomRole
  status: ScoreboardRoomStatus
  busy: boolean
  inviteUrl: string | null
  errorMessage: string | null
  guideStorageKey?: string
  onStart: () => void
  onStopSharing: () => void
  onStopViewing: () => void
}

const STATUS_COPY: Record<
  ScoreboardRoomStatus,
  { label: string; dot: string; text: string }
> = {
  idle: {
    label: "연동하지 않음",
    dot: "bg-neutral-500",
    text: "text-neutral-400",
  },
  connecting: {
    label: "연결 준비 중",
    dot: "bg-emerald-400 animate-pulse",
    text: "text-emerald-300",
  },
  connected: {
    label: "연결됨",
    dot: "bg-emerald-400 shadow-[0_0_8px_rgb(52,211,153)]",
    text: "text-emerald-300",
  },
  "host-away": {
    label: "방장 재접속 대기 중",
    dot: "bg-amber-400 animate-pulse",
    text: "text-amber-300",
  },
  offline: {
    label: "네트워크 연결 대기 중",
    dot: "bg-red-500 animate-pulse",
    text: "text-red-300",
  },
  expired: {
    label: "종료되었거나 만료된 방",
    dot: "bg-red-600",
    text: "text-red-400",
  },
  error: {
    label: "연결 오류",
    dot: "bg-red-600",
    text: "text-red-400",
  },
}

export function ScoreboardSyncPanel({
  role,
  status,
  busy,
  inviteUrl,
  errorMessage,
  guideStorageKey = DEFAULT_GUIDE_KEY,
  onStart,
  onStopSharing,
  onStopViewing,
}: ScoreboardSyncPanelProps) {
  const [open, setOpen] = useState(false)
  const [copiedTarget, setCopiedTarget] = useState<"discord" | "url" | null>(
    null,
  )
  const [copyFailedTarget, setCopyFailedTarget] = useState<
    "discord" | "url" | null
  >(null)
  const [confirmStop, setConfirmStop] = useState(false)
  const [hasSeenGuide, setHasSeenGuide] = useState(true)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const guideTriggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    try {
      if (!localStorage.getItem(guideStorageKey)) setHasSeenGuide(false)
    } catch {
      // localStorage를 사용할 수 없는 환경에서는 안내를 반복하지 않는다.
    }
  }, [guideStorageKey])

  useEffect(() => {
    if (role === "viewer") setOpen(false)
  }, [role])

  const closePanel = () => {
    setOpen(false)
    setConfirmStop(false)
  }

  const syncPanelDismissBind = useAutoDismiss(open || confirmStop, closePanel)
  useDismissOnOutsideInteraction(open || confirmStop, closePanel, panelRef, [
    triggerRef,
    guideTriggerRef,
  ])

  const openPanel = () => {
    setOpen((current) => !current)
    setConfirmStop(false)
    if (!hasSeenGuide) {
      setHasSeenGuide(true)
      try {
        localStorage.setItem(guideStorageKey, "true")
      } catch {
        // ignore
      }
    }
  }

  const copyText = async (text: string, target: "discord" | "url") => {
    let success = false
    try {
      await navigator.clipboard.writeText(text)
      success = true
    } catch {
      const textarea = document.createElement("textarea")
      textarea.value = text
      textarea.style.position = "fixed"
      textarea.style.opacity = "0"
      document.body.appendChild(textarea)
      textarea.select()
      success = document.execCommand("copy")
      textarea.remove()
    }
    if (!success) {
      setCopyFailedTarget(target)
      window.setTimeout(() => setCopyFailedTarget(null), 1500)
      return
    }
    setCopiedTarget(target)
    window.setTimeout(() => setCopiedTarget(null), 1500)
  }

  const copyDiscordInvite = async () => {
    if (!inviteUrl) return
    await copyText(buildDiscordInviteMessage(inviteUrl), "discord")
  }

  const copyInviteUrl = async () => {
    if (!inviteUrl) return
    await copyText(inviteUrl, "url")
  }

  if (role === "viewer") {
    return (
      <div className="mb-1 flex w-full flex-col gap-1">
        <div
          className="scoreboard-utility-btn border border-red-800/70 bg-black/90 px-3 py-2 text-right shadow-lg whitespace-normal"
          style={{ fontFamily: "var(--font-godo)" }}
        >
          <p className="text-xs font-bold text-red-300">
            다른 진행자의 점수판을 보는 중
          </p>
          <p className="mt-0.5 text-[11px] text-neutral-400">
            점수판 조작이 제한됩니다.
          </p>
          <div className="mt-0.5 flex justify-end">
            <StatusLine status={status} />
          </div>
          {errorMessage && (
            <p className="mt-1 max-w-72 text-[10px] text-red-400">
              {errorMessage}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onStopViewing}
          className="scoreboard-utility-btn flex items-center justify-center gap-2 border border-red-600/80 bg-red-950/90 text-sm font-bold text-red-300 shadow-lg transition-colors hover:bg-red-900 hover:text-red-200"
          style={{ fontFamily: "var(--font-godo)" }}
        >
          <Unplug size={15} />
          <span>연결 종료</span>
        </button>
      </div>
    )
  }

  const hostButtonLabel =
    status === "connecting" ? "공유 준비 중..." : "점수판 공유 중"

  return (
    <div className="relative flex w-full flex-col">
      {!hasSeenGuide && (
        <button
          type="button"
          ref={guideTriggerRef}
          onClick={openPanel}
          className={cn(
            "fixed bottom-36 left-4 right-4 z-50 rounded-md border bg-black/95 px-3.5 py-2.5 text-center text-sm backdrop-blur-md hover:brightness-125 sm:absolute sm:bottom-auto sm:left-auto sm:right-full sm:top-1/2 sm:mr-3 sm:w-max sm:-translate-y-1/2 sm:whitespace-nowrap sm:px-3.5 sm:py-2",
            CHZZK_GREEN_GUIDE,
          )}
          style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
        >
          진행자의 점수판과 연동하여 같은 화면을 보며 플레이하세요!
        </button>
      )}

      <button
        type="button"
        ref={triggerRef}
        onClick={openPanel}
        aria-expanded={open}
        className={cn(
          "scoreboard-utility-btn flex items-center justify-center gap-2 shadow-lg",
          role === "host"
            ? "border border-emerald-500 bg-emerald-500 font-bold text-white shadow-[0_0_16px_rgba(16,185,129,0.45)] hover:border-emerald-400 hover:bg-emerald-400 hover:text-white"
            : cn("border bg-black/85", CHZZK_GREEN_BUTTON),
        )}
        style={{ fontFamily: "var(--font-godo)" }}
      >
        {role === "host" ? <Wifi size={15} /> : <Link2 size={15} />}
        <span>
          {role === "host" ? hostButtonLabel : "점수판 연동 설정"}
        </span>
      </button>

      {open && (
          <div
            ref={panelRef}
            className={cn(
              "fixed bottom-20 left-4 right-4 z-50 flex max-h-[calc(100dvh-6rem)] flex-col gap-3 overflow-y-auto rounded-md border p-4 text-left shadow-2xl backdrop-blur-md sm:absolute sm:bottom-0 sm:right-full sm:top-auto sm:left-auto sm:mr-2 sm:w-80 sm:max-h-[min(32rem,calc(100dvh-4rem))]",
              CHZZK_GREEN_PANEL,
            )}
            {...syncPanelDismissBind}
          >
          <div>
            <div className="flex items-center justify-between gap-3">
              <p
                className={cn("text-sm font-bold", CHZZK_GREEN_ACCENT)}
                style={{ fontFamily: "var(--font-godo)" }}
              >
                실시간 점수판 연동
              </p>
              <StatusLine status={status} />
            </div>
            <p
              className="mt-1 text-xs leading-relaxed text-neutral-300"
              style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
            >
              진행자를 맡으실 경우, 시작하기 버튼을 누른 뒤, 주소를 복사하세요.
            </p>
            <p
              className="mt-1.5 text-xs leading-relaxed text-amber-300/90"
              style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
            >
              주소는 함께 경기하는 스트리머에게만 공유해 주세요.
            </p>
            <p
              className="mt-1 text-xs leading-relaxed text-neutral-400"
              style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
            >
              상대 스트리머가 주소로 접속하면 같은 점수판을 볼 수 있으며, 점수
              조작은 제한됩니다.
            </p>
          </div>

          {errorMessage && (
            <p
              className="rounded border border-red-900/80 bg-red-950/30 px-3 py-2 text-xs leading-relaxed text-red-300"
              style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
            >
              {errorMessage}
            </p>
          )}

          {role === "local" ? (
            <button
              type="button"
              onClick={onStart}
              disabled={busy}
              className={cn(
                "rounded border px-4 py-2 text-sm font-bold transition-colors disabled:cursor-wait disabled:opacity-50",
                CHZZK_GREEN_ACTION,
              )}
              style={{ fontFamily: "var(--font-godo)" }}
            >
              {busy ? "연동 준비 중..." : "연동 시작하기"}
            </button>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={copyDiscordInvite}
                  disabled={!inviteUrl || busy}
                  className={cn(
                    "flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded border px-2.5 py-2 text-xs transition-colors disabled:cursor-wait disabled:opacity-50",
                    copiedTarget === "discord"
                      ? DISCORD_BUTTON_COPIED
                      : copyFailedTarget === "discord"
                        ? "border-red-700 bg-red-950/30 font-bold text-red-300"
                        : DISCORD_BUTTON,
                  )}
                  style={{ fontFamily: "var(--font-godo)" }}
                >
                  <Copy size={14} className="shrink-0" />
                  <span className="truncate">
                    {copiedTarget === "discord"
                      ? "✓ 복사완료!"
                      : copyFailedTarget === "discord"
                        ? "복사 실패"
                        : "디스코드용 주소 복사"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={copyInviteUrl}
                  disabled={!inviteUrl || busy}
                  className={cn(
                    "flex shrink-0 items-center justify-center gap-1.5 rounded border px-3 py-2 text-xs transition-colors disabled:cursor-wait disabled:opacity-50",
                    copiedTarget === "url"
                      ? "border-emerald-500 bg-emerald-500/20 font-bold text-emerald-300"
                      : copyFailedTarget === "url"
                        ? "border-red-700 bg-red-950/30 font-bold text-red-300"
                        : "border-neutral-600 bg-black/80 text-neutral-300 hover:border-neutral-400 hover:text-white",
                  )}
                  style={{ fontFamily: "var(--font-godo)" }}
                >
                  <Copy size={14} className="shrink-0" />
                  <span>
                    {copiedTarget === "url"
                      ? "✓ 복사완료!"
                      : copyFailedTarget === "url"
                        ? "복사 실패"
                        : "주소 복사"}
                  </span>
                </button>
              </div>

              {confirmStop ? (
                <ConfirmRow
                  message="참가자의 연결도 함께 종료됩니다."
                  confirmLabel="연동 종료"
                  danger
                  onConfirm={() => {
                    setConfirmStop(false)
                    onStopSharing()
                  }}
                  onCancel={() => setConfirmStop(false)}
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmStop(true)}
                  disabled={busy}
                  className="rounded border border-red-900/70 bg-black/60 px-3 py-1.5 text-xs text-red-400 transition-colors hover:bg-red-950/40 disabled:opacity-50"
                >
                  점수판 연동 종료
                </button>
              )}
            </>
          )}
          </div>
      )}
    </div>
  )
}

function StatusLine({ status }: { status: ScoreboardRoomStatus }) {
  const copy = STATUS_COPY[status]
  return (
    <div
      className="flex shrink-0 items-center gap-1.5 text-[11px]"
      style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
    >
      <span className="text-neutral-500">연결 상태:</span>
      <span className={cn("size-2 rounded-full", copy.dot)} aria-hidden />
      <span className={copy.text}>{copy.label}</span>
    </div>
  )
}

function ConfirmRow({
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: {
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <div className="rounded border border-neutral-700 bg-neutral-950/90 p-2">
      <p
        className="text-[11px] text-neutral-300"
        style={{ fontFamily: "var(--font-s-core)", fontWeight: 500 }}
      >
        {message}
      </p>
      <div className="mt-2 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded border border-neutral-700 px-2 py-1 text-[11px] text-neutral-400 hover:text-white"
        >
          취소
        </button>
        <button
          type="button"
          onClick={onConfirm}
          className={cn(
            "rounded border px-2 py-1 text-[11px]",
            danger
              ? "border-red-700 bg-red-950/40 text-red-300"
              : "border-emerald-500/70 bg-emerald-500/10 text-emerald-300",
          )}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  )
}

"use client"

import type { ViewerSessionEndReason } from "@/lib/viewer-session-notice"

type ViewerLinkExpiredNoticeProps = {
  reason?: ViewerSessionEndReason
  onDismiss: () => void
}

export function ViewerLinkExpiredNotice({
  reason = "expired",
  onDismiss,
}: ViewerLinkExpiredNoticeProps) {
  const isHostDisconnected = reason === "host-disconnected"

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm">
      <div
        className="w-full max-w-md rounded-md border border-red-800/70 bg-neutral-950/95 p-6 text-center shadow-[0_0_40px_rgba(127,29,29,0.25)]"
        style={{ fontFamily: "var(--font-godo)" }}
      >
        <h2 className="text-lg font-bold text-red-300">
          {isHostDisconnected ? "방장 연결이 끊겼습니다" : "연동에 실패했습니다"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-neutral-300">
          {isHostDisconnected ? (
            "방장이 다시 연결되면 같은 초대 주소로 다시 접속해 주세요."
          ) : (
            <>
              만료되었거나 종료된 주소로 접속해 점수판에 연결할 수 없습니다.
              <br />
              진행자에게 새 연동 주소를 요청해 주세요.
            </>
          )}
        </p>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-5 rounded border border-red-700/70 bg-red-950/40 px-4 py-2 text-sm text-red-200 transition-colors hover:bg-red-900/50"
        >
          확인
        </button>
      </div>
    </div>
  )
}

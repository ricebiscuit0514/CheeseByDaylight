export const VIEWER_EXPIRED_NOTICE_KEY = "dbd-viewer-expired-notice"
export const VIEWER_HOST_DISCONNECTED_NOTICE_KEY =
  "dbd-viewer-host-disconnected-notice"

export type ViewerSessionEndReason = "expired" | "host-disconnected"

export function markViewerLinkExpired() {
  markViewerSessionEnded("expired")
}

export function markViewerHostDisconnected() {
  markViewerSessionEnded("host-disconnected")
}

export function markViewerSessionEnded(reason: ViewerSessionEndReason) {
  try {
    sessionStorage.removeItem(VIEWER_EXPIRED_NOTICE_KEY)
    sessionStorage.removeItem(VIEWER_HOST_DISCONNECTED_NOTICE_KEY)
    sessionStorage.setItem(
      reason === "host-disconnected"
        ? VIEWER_HOST_DISCONNECTED_NOTICE_KEY
        : VIEWER_EXPIRED_NOTICE_KEY,
      "1",
    )
  } catch {
    // ignore
  }
}

export function consumeViewerSessionEndedNotice(): ViewerSessionEndReason | null {
  try {
    if (sessionStorage.getItem(VIEWER_HOST_DISCONNECTED_NOTICE_KEY)) {
      sessionStorage.removeItem(VIEWER_HOST_DISCONNECTED_NOTICE_KEY)
      return "host-disconnected"
    }
    if (sessionStorage.getItem(VIEWER_EXPIRED_NOTICE_KEY)) {
      sessionStorage.removeItem(VIEWER_EXPIRED_NOTICE_KEY)
      return "expired"
    }
    return null
  } catch {
    return null
  }
}

/** @deprecated consumeViewerSessionEndedNotice 사용 */
export function consumeViewerLinkExpiredNotice() {
  return consumeViewerSessionEndedNotice() === "expired"
}

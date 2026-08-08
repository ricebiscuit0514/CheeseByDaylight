export const VIEWER_EXPIRED_NOTICE_KEY = "dbd-viewer-expired-notice"

export function markViewerLinkExpired() {
  try {
    sessionStorage.setItem(VIEWER_EXPIRED_NOTICE_KEY, "1")
  } catch {
    // ignore
  }
}

export function consumeViewerLinkExpiredNotice() {
  try {
    if (!sessionStorage.getItem(VIEWER_EXPIRED_NOTICE_KEY)) return false
    sessionStorage.removeItem(VIEWER_EXPIRED_NOTICE_KEY)
    return true
  } catch {
    return false
  }
}

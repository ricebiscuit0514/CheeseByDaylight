"use client"

const CHANNEL_NAME = "cbd-firebase-active-tab-v1"
const STORAGE_KEY = "cbd-firebase-active-tab-claim-v1"

type TabClaim = {
  type: "claim"
  tabId: string
  claimedAt: number
}

function createTabId() {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")
}

function isTabClaim(value: unknown): value is TabClaim {
  if (!value || typeof value !== "object") return false
  const claim = value as Partial<TabClaim>
  return (
    claim.type === "claim" &&
    typeof claim.tabId === "string" &&
    typeof claim.claimedAt === "number"
  )
}

function isNewerClaim(incoming: TabClaim, current: TabClaim) {
  if (incoming.claimedAt !== current.claimedAt) {
    return incoming.claimedAt > current.claimedAt
  }
  return incoming.tabId > current.tabId
}

/**
 * 같은 브라우저 프로필에서 정상 앱 탭이 여러 개 Firebase에 연결되는 것을 막는다.
 * BroadcastChannel과 storage 이벤트를 함께 사용하며, 가장 최근 claim만 유지한다.
 * 별도 브라우저 프로필·기기·변조 클라이언트까지 막는 보안 경계는 아니다.
 */
export function claimSingleFirebaseTab(onSuperseded: () => void) {
  const claim: TabClaim = {
    type: "claim",
    tabId: createTabId(),
    claimedAt: performance.timeOrigin + performance.now(),
  }
  let active = true
  let channel: BroadcastChannel | null = null

  const handleClaim = (incoming: unknown) => {
    if (!active || !isTabClaim(incoming) || incoming.tabId === claim.tabId) {
      return
    }

    if (isNewerClaim(incoming, claim)) {
      active = false
      onSuperseded()
      return
    }

    channel?.postMessage(claim)
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return
    try {
      handleClaim(JSON.parse(event.newValue))
    } catch {
      // 다른 코드가 같은 키를 오염시켜도 Firebase 연결에는 영향을 주지 않는다.
    }
  }

  if ("BroadcastChannel" in window) {
    channel = new BroadcastChannel(CHANNEL_NAME)
    channel.addEventListener("message", (event) => handleClaim(event.data))
  }
  window.addEventListener("storage", handleStorage)

  channel?.postMessage(claim)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(claim))
  } catch {
    // BroadcastChannel만으로 계속 동작한다.
  }

  return () => {
    active = false
    window.removeEventListener("storage", handleStorage)
    channel?.close()
  }
}

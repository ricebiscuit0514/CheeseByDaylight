"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { goOffline, goOnline, type Database } from "firebase/database"
import { getAnonymousUser } from "@/lib/firebase/client"
import {
  HOST_DISCONNECT_GRACE_MS,
  HOST_SESSION_KEY,
  MODE_SWITCH_SESSION_KEY,
  VIEWER_SESSION_KEY,
  SCOREBOARD_GAME_PATHS,
  abandonHostRoomIfNeeded,
  buildInviteUrl,
  clearInviteTokenFromUrl,
  parseInviteTokenFromHash,
  createScoreboardRoom,
  createDefaultScoreboardState,
  deleteScoreboardRoom,
  generateRoomToken,
  loadRoomSession,
  prepareFirebaseSession,
  purgeExpiredHostRoomFromStorage,
  registerHostPresence,
  resumeScoreboardRoom,
  ROOM_TTL_MS,
  saveRoomSession,
  tryDeleteScoreboardRoom,
  subscribeToFirebaseConnection,
  subscribeToScoreboardRoom,
  writeScoreboardState,
  type ScoreboardGameMode,
  type ScoreboardSyncState,
  type FourVFourSyncState,
  type ScoreboardRoom,
} from "@/lib/firebase/scoreboard-room"
import { claimSingleFirebaseTab } from "@/lib/firebase/single-tab"
import { markViewerHostDisconnected, markViewerLinkExpired } from "@/lib/viewer-session-notice"

export type ScoreboardRoomRole = "local" | "host" | "viewer"
export type ScoreboardRoomStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "host-away"
  | "offline"
  | "expired"
  | "error"

const HOST_DISCONNECT_RECHECK_MS = 3000

function hostDisconnectGraceRemainingMs(
  room: ScoreboardRoom,
  now = Date.now(),
) {
  if (typeof room.hostDisconnectedAt !== "number") return 0
  return Math.max(0, HOST_DISCONNECT_GRACE_MS - (now - room.hostDisconnectedAt))
}

function isHostWithinDisconnectGrace(room: ScoreboardRoom, now = Date.now()) {
  return hostDisconnectGraceRemainingMs(room, now) > 0
}

type UseScoreboardRoomOptions<T extends ScoreboardSyncState> = {
  gameMode: ScoreboardGameMode
  enabled: boolean
  state: T
  onRemoteState: (state: T) => void
}

export function useScoreboardRoom<T extends ScoreboardSyncState>({
  gameMode,
  enabled,
  state,
  onRemoteState,
}: UseScoreboardRoomOptions<T>) {
  const [initialized, setInitialized] = useState(false)
  const [role, setRole] = useState<ScoreboardRoomRole>("local")
  const [token, setToken] = useState<string | null>(null)
  const [roomReady, setRoomReady] = useState(false)
  const [firebaseConnected, setFirebaseConnected] = useState<boolean | null>(
    null,
  )
  const [hostOnline, setHostOnline] = useState(false)
  const [roomExpiresAt, setRoomExpiresAt] = useState<number | null>(null)
  const [terminalStatus, setTerminalStatus] = useState<
    "expired" | "error" | null
  >(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [tabSuperseded, setTabSuperseded] = useState(false)

  const stateRef = useRef(state)
  const remoteStateRef = useRef(onRemoteState)
  const shouldCreateRef = useRef(false)
  const lastPublishedRef = useRef("")
  const prevSyncedFirstAttackerIdRef = useRef<string | null | undefined>(
    undefined,
  )
  const prevSyncedPickerUiRef = useRef<
    Pick<FourVFourSyncState["pickerUi"], "selectionSeq" | "feedbackToken"> | undefined
  >(undefined)
  const databaseRef = useRef<Database | null>(null)
  const tokenRef = useRef<string | null>(null)

  useEffect(() => {
    tokenRef.current = token
  }, [token])

  const deleteHostRoom = useCallback(async (roomToken: string) => {
    try {
      const { database } = await getAnonymousUser()
      goOnline(database)
      await tryDeleteScoreboardRoom(database, roomToken)
      goOffline(database)
    } catch {
      // ignore
    }
  }, [])

  const returnViewerToLocal = useCallback((options?: { expired?: boolean; hostDisconnected?: boolean }) => {
    sessionStorage.removeItem(VIEWER_SESSION_KEY)
    if (options?.hostDisconnected) markViewerHostDisconnected()
    else if (options?.expired) markViewerLinkExpired()
    if (databaseRef.current) goOffline(databaseRef.current)
    window.location.replace(SCOREBOARD_GAME_PATHS[gameMode])
  }, [gameMode])

  const redirectViewerToGameMode = useCallback(
    (targetMode: ScoreboardGameMode, roomToken: string, expiresAt: number) => {
      saveRoomSession(sessionStorage, VIEWER_SESSION_KEY, {
        token: roomToken,
        expiresAt,
        gameMode: targetMode,
      })
      if (databaseRef.current) goOffline(databaseRef.current)
      window.location.replace(SCOREBOARD_GAME_PATHS[targetMode])
    },
    [],
  )

  const expireHostSession = useCallback(() => {
    const roomToken = tokenRef.current
    void (async () => {
      if (roomToken) {
        await deleteHostRoom(roomToken)
      }
      localStorage.removeItem(HOST_SESSION_KEY)
      if (databaseRef.current) goOffline(databaseRef.current)
      setRole("local")
      setToken(null)
      setRoomReady(false)
      setHostOnline(false)
      setRoomExpiresAt(null)
      setTerminalStatus("expired")
      setErrorMessage(
        "방장 연결이 끊긴 뒤 40분이 지나 공유방이 종료되었습니다. 다시 연동을 시작해 주세요.",
      )
    })()
  }, [deleteHostRoom])

  useEffect(() => {
    stateRef.current = state
  }, [state])

  useEffect(() => {
    remoteStateRef.current = onRemoteState
  }, [onRemoteState])

  useEffect(() => {
    if (initialized) return

    let cancelled = false

    const bootstrap = async () => {
      await purgeExpiredHostRoomFromStorage()

      const inviteToken = parseInviteTokenFromHash()
      if (inviteToken) {
        saveRoomSession(sessionStorage, VIEWER_SESSION_KEY, {
          token: inviteToken,
          expiresAt: Date.now() + ROOM_TTL_MS,
          gameMode,
        })
        clearInviteTokenFromUrl(gameMode)

        await abandonHostRoomIfNeeded(inviteToken)
        if (cancelled) return
        setRole("viewer")
        setToken(inviteToken)
        setInitialized(true)
        return
      }

      const viewerSession = loadRoomSession(
        sessionStorage,
        VIEWER_SESSION_KEY,
      )
      if (viewerSession && viewerSession.gameMode === gameMode) {
        await abandonHostRoomIfNeeded(viewerSession.token)
        if (cancelled) return
        setRole("viewer")
        setToken(viewerSession.token)
        setInitialized(true)
        return
      }

      if (viewerSession && viewerSession.gameMode !== gameMode) {
        window.location.replace(SCOREBOARD_GAME_PATHS[viewerSession.gameMode])
        return
      }

      const hostSession = loadRoomSession(localStorage, HOST_SESSION_KEY)
      if (hostSession && hostSession.gameMode === gameMode) {
        setRole("host")
        setToken(hostSession.token)
      }
      setInitialized(true)
    }

    void bootstrap()

    return () => {
      cancelled = true
    }
  }, [gameMode, initialized])

  useEffect(() => {
    const onHashChange = () => {
      const inviteToken = parseInviteTokenFromHash()
      if (!inviteToken || inviteToken === token) return

      void (async () => {
        saveRoomSession(sessionStorage, VIEWER_SESSION_KEY, {
          token: inviteToken,
          expiresAt: Date.now() + ROOM_TTL_MS,
          gameMode,
        })
        clearInviteTokenFromUrl(gameMode)

        await abandonHostRoomIfNeeded(inviteToken)
        setTabSuperseded(false)
        setTerminalStatus(null)
        setErrorMessage(null)
        setRole("viewer")
        setToken(inviteToken)
      })()
    }

    window.addEventListener("hashchange", onHashChange)
    return () => window.removeEventListener("hashchange", onHashChange)
  }, [gameMode, token])

  useEffect(() => {
    if (
      !enabled ||
      !initialized ||
      role === "local" ||
      !token ||
      tabSuperseded
    ) {
      return
    }

    let disposed = false
    let unsubscribeRoom: (() => void) | undefined
    let unsubscribeConnection: (() => void) | undefined
    let unregisterPresence: (() => Promise<void>) | undefined
    let presenceStarting = false
    let hostCanRegisterPresence = false
    let latestConnectionState = false
    let wasSuperseded = false
    let clearViewerPendingExpire: (() => void) | undefined
    let clearViewerPendingHostDisconnect: (() => void) | undefined
    const releaseTabClaim =
      role === "host"
        ? claimSingleFirebaseTab(() => {
            wasSuperseded = true
            setTabSuperseded(true)
            setRoomReady(false)
            setFirebaseConnected(false)
            setErrorMessage(
              "같은 브라우저의 더 최근 탭에서 연동을 시작해 이 탭의 Firebase 연결을 종료했습니다.",
            )
            if (databaseRef.current) goOffline(databaseRef.current)
          })
        : () => {}

    setRoomReady(false)
    setFirebaseConnected(null)
    setHostOnline(false)
    setRoomExpiresAt(null)
    setTerminalStatus(null)
    setErrorMessage(null)

    const connect = async () => {
      try {
        const { user, database } = await getAnonymousUser()
        if (disposed || wasSuperseded) {
          goOffline(database)
          return
        }
        databaseRef.current = database
        goOnline(database)

        const establishHostPresence = async (force = false) => {
          if (
            role !== "host" ||
            !hostCanRegisterPresence ||
            (!force && !latestConnectionState) ||
            unregisterPresence ||
            presenceStarting
          ) {
            return
          }

          presenceStarting = true
          try {
            const cleanup = await registerHostPresence(database, token)
            if (disposed) {
              void cleanup().catch(() => undefined)
              return
            }
            unregisterPresence = cleanup
          } finally {
            presenceStarting = false
          }
        }

        const ensureHostPresence = () => {
          void establishHostPresence().catch((error: unknown) => {
            if (!disposed) {
              goOffline(database)
              setTerminalStatus("error")
              setErrorMessage(toErrorMessage(error))
            }
          })
        }

        unsubscribeConnection = subscribeToFirebaseConnection(
          database,
          (connected) => {
            if (disposed) return
            latestConnectionState = connected
            if (!connected) unregisterPresence = undefined
            setFirebaseConnected(connected)
            ensureHostPresence()
          },
        )

        const { serverTimeOffset: offset } = await prepareFirebaseSession(database)
        if (disposed || wasSuperseded) {
          goOffline(database)
          return
        }

        const serverNow = Date.now() + offset
        if (disposed) {
          goOffline(database)
          return
        }

        if (role === "viewer") {
          let sawValidRoom = false
          let pendingExpireTimeout: number | undefined
          let pendingHostDisconnectTimeout: number | undefined
          let latestRoom: ScoreboardRoom | null = null

          const clearPendingExpire = () => {
            if (pendingExpireTimeout !== undefined) {
              window.clearTimeout(pendingExpireTimeout)
              pendingExpireTimeout = undefined
            }
          }
          clearViewerPendingExpire = clearPendingExpire

          const clearPendingHostDisconnect = () => {
            if (pendingHostDisconnectTimeout !== undefined) {
              window.clearTimeout(pendingHostDisconnectTimeout)
              pendingHostDisconnectTimeout = undefined
            }
          }
          clearViewerPendingHostDisconnect = clearPendingHostDisconnect

          const redirectIfModeChanged = (room: ScoreboardRoom) => {
            if (room.scoreboard.mode === gameMode) return false
            clearPendingHostDisconnect()
            clearPendingExpire()
            redirectViewerToGameMode(
              room.scoreboard.mode,
              token,
              room.expiresAt,
            )
            return true
          }

          const scheduleHostDisconnectRecheck = (room: ScoreboardRoom) => {
            clearPendingHostDisconnect()
            const remaining = hostDisconnectGraceRemainingMs(room)
            if (remaining <= 0) {
              clearPendingExpire()
              returnViewerToLocal({ hostDisconnected: true })
              return
            }

            pendingHostDisconnectTimeout = window.setTimeout(() => {
              pendingHostDisconnectTimeout = undefined
              if (disposed) return
              const current = latestRoom
              if (!current) return
              if (redirectIfModeChanged(current)) return

              const hostBackOnline =
                Object.keys(current.hostConnections ?? {}).length > 0
              if (hostBackOnline) return

              if (isHostWithinDisconnectGrace(current)) {
                scheduleHostDisconnectRecheck(current)
                return
              }

              clearPendingExpire()
              returnViewerToLocal({ hostDisconnected: true })
            }, Math.min(HOST_DISCONNECT_RECHECK_MS, remaining))
          }

          const scheduleViewerExpire = () => {
            if (pendingExpireTimeout !== undefined) return
            pendingExpireTimeout = window.setTimeout(() => {
              pendingExpireTimeout = undefined
              if (!disposed && !sawValidRoom) {
                returnViewerToLocal({ expired: true })
              }
            }, 2500)
          }

          unsubscribeRoom = subscribeToScoreboardRoom(
            database,
            token,
            (room) => {
              if (disposed) return
              latestRoom = room
              if (!room || room.scoreboard.mode !== gameMode) {
                if (
                  room &&
                  room.scoreboard.mode &&
                  room.scoreboard.mode !== gameMode
                ) {
                  clearPendingExpire()
                  redirectViewerToGameMode(
                    room.scoreboard.mode,
                    token,
                    room.expiresAt,
                  )
                  return
                }
                if (sawValidRoom) {
                  clearPendingExpire()
                  returnViewerToLocal({ expired: true })
                  return
                }
                scheduleViewerExpire()
                return
              }

              clearPendingExpire()
              sawValidRoom = true

              const isHostOnline =
                Object.keys(room.hostConnections ?? {}).length > 0

              if (isHostOnline) {
                clearPendingHostDisconnect()
              }

              if (
                sawValidRoom &&
                !isHostOnline &&
                typeof room.hostDisconnectedAt === "number"
              ) {
                if (redirectIfModeChanged(room)) return

                if (isHostWithinDisconnectGrace(room)) {
                  setRoomReady(true)
                  setRoomExpiresAt(room.expiresAt)
                  setHostOnline(false)
                  scheduleHostDisconnectRecheck(room)
                  return
                }

                clearPendingExpire()
                returnViewerToLocal({ hostDisconnected: true })
                return
              }

              setRoomReady(true)
              setRoomExpiresAt(room.expiresAt)
              setHostOnline(isHostOnline)
              saveRoomSession(sessionStorage, VIEWER_SESSION_KEY, {
                token,
                expiresAt: room.expiresAt,
                gameMode,
              })

              const serialized = JSON.stringify(room.scoreboard)
              if (lastPublishedRef.current !== serialized) {
                lastPublishedRef.current = serialized
                remoteStateRef.current(room.scoreboard as T)
              }
            },
            () => {
              if (disposed) return
              if (sawValidRoom) {
                returnViewerToLocal({ expired: true })
                return
              }
              scheduleViewerExpire()
            },
          )
          return
        }

        const currentState = stateRef.current
        let expiresAt: number | null
        if (shouldCreateRef.current) {
          expiresAt = await createScoreboardRoom(
              database,
              user.uid,
              token,
              currentState,
              serverNow,
            )
          hostCanRegisterPresence = true
          await establishHostPresence(true)
        } else {
          // 재접속 유예 경계에서 갱신과 presence 등록이 갈라지지 않도록
          // 먼저 원자적인 presence update로 방을 점유한 뒤 상태를 복원한다.
          hostCanRegisterPresence = true
          await establishHostPresence(true)
          expiresAt = await resumeScoreboardRoom(
              database,
              user.uid,
              token,
              currentState,
            )
        }

        if (disposed) return
        shouldCreateRef.current = false

        if (!expiresAt) {
          await deleteHostRoom(token)
          localStorage.removeItem(HOST_SESSION_KEY)
          setRole("local")
          setToken(null)
          setTerminalStatus("expired")
          return
        }

        saveRoomSession(localStorage, HOST_SESSION_KEY, {
          token,
          expiresAt,
          gameMode,
        })
        lastPublishedRef.current = JSON.stringify(currentState)
        ensureHostPresence()
        setRoomExpiresAt(expiresAt)
        setRoomReady(true)
      } catch (error) {
        if (disposed) return
        if (databaseRef.current) goOffline(databaseRef.current)
        const message = toErrorMessage(error)
        const creating = shouldCreateRef.current
        const roomUnavailable =
          role === "host" &&
          (creating || isPermissionDenied(error))
        if (roomUnavailable) {
          if (token) {
            await deleteHostRoom(token)
          }
          localStorage.removeItem(HOST_SESSION_KEY)
          if (databaseRef.current) goOffline(databaseRef.current)
          shouldCreateRef.current = false
          setRole("local")
          setToken(null)
        }
        setTerminalStatus(
          isPermissionDenied(error) && !creating ? "expired" : "error",
        )
        setErrorMessage(
          isPermissionDenied(error)
            ? creating
              ? "공유방을 만들지 못했습니다. Firebase Console의 Realtime Database Rules가 최신인지 확인해 주세요."
              : "이전 공유방의 40분 재접속 시간이 지나 종료되었습니다. 새 연동을 시작해 주세요."
            : message,
        )
      } finally {
        if (!disposed) setBusy(false)
      }
    }

    void connect()

    return () => {
      disposed = true
      clearViewerPendingExpire?.()
      clearViewerPendingHostDisconnect?.()
      unsubscribeRoom?.()
      unsubscribeConnection?.()
      releaseTabClaim()
      if (unregisterPresence) {
        void unregisterPresence().catch(() => undefined)
      }
      if (wasSuperseded && databaseRef.current) {
        goOffline(databaseRef.current)
      }
    }
  }, [
    gameMode,
    enabled,
    initialized,
    deleteHostRoom,
    redirectViewerToGameMode,
    returnViewerToLocal,
    role,
    tabSuperseded,
    token,
  ])

  useEffect(() => {
    if (
      role !== "host" ||
      !token ||
      !roomExpiresAt ||
      !roomReady ||
      terminalStatus
    ) {
      return
    }

    const finalizeExpiredHostRoom = () => {
      if (tokenRef.current !== token) return
      void (async () => {
        await deleteHostRoom(token)
        localStorage.removeItem(HOST_SESSION_KEY)
        if (databaseRef.current) goOffline(databaseRef.current)
        setRole("local")
        setToken(null)
        setRoomReady(false)
        setHostOnline(false)
        setRoomExpiresAt(null)
        setTerminalStatus("expired")
        setErrorMessage(
          "공유방이 만료되어 종료되었습니다. 다시 연동을 시작해 주세요.",
        )
      })()
    }

    const delayMs = roomExpiresAt - Date.now()
    if (delayMs <= 0) {
      finalizeExpiredHostRoom()
      return
    }

    const timeout = window.setTimeout(finalizeExpiredHostRoom, delayMs)
    return () => window.clearTimeout(timeout)
  }, [
    deleteHostRoom,
    role,
    roomExpiresAt,
    roomReady,
    terminalStatus,
    token,
  ])

  useEffect(() => {
    if (
      !enabled ||
      role !== "host" ||
      !token ||
      !roomReady ||
      terminalStatus
    ) {
      return
    }

    const serialized = JSON.stringify(state)
    if (serialized === lastPublishedRef.current) return

    const timeout = window.setTimeout(async () => {
      try {
        const { database } = await getAnonymousUser()
        const expiresAt = await writeScoreboardState(database, token, state)
        lastPublishedRef.current = serialized
        saveRoomSession(localStorage, HOST_SESSION_KEY, {
          token,
          expiresAt,
          gameMode,
        })
        setRoomExpiresAt(expiresAt)
      } catch (error) {
        if (databaseRef.current) goOffline(databaseRef.current)
        setTerminalStatus("error")
        setErrorMessage(toErrorMessage(error))
      }
    }, 120)

    return () => window.clearTimeout(timeout)
  }, [enabled, gameMode, role, roomReady, state, terminalStatus, token])

  // 선공 결정(firstAttackerId)은 시청자 UI에 바로 반영되어야 하므로 디바운스 없이 즉시 동기화한다.
  useEffect(() => {
    if (gameMode !== "4v4" || state.mode !== "4v4") return
    if (
      !enabled ||
      role !== "host" ||
      !token ||
      !roomReady ||
      terminalStatus
    ) {
      return
    }

    const next = (state as FourVFourSyncState).firstAttackerId ?? null
    const prev = prevSyncedFirstAttackerIdRef.current
    prevSyncedFirstAttackerIdRef.current = next
    if (prev === undefined || prev === next) return

    void (async () => {
      try {
        const currentState = stateRef.current
        const serialized = JSON.stringify(currentState)
        const { database } = await getAnonymousUser()
        const expiresAt = await writeScoreboardState(database, token, currentState)
        lastPublishedRef.current = serialized
        saveRoomSession(localStorage, HOST_SESSION_KEY, {
          token,
          expiresAt,
          gameMode,
        })
        setRoomExpiresAt(expiresAt)
      } catch (error) {
        if (databaseRef.current) goOffline(databaseRef.current)
        setTerminalStatus("error")
        setErrorMessage(toErrorMessage(error))
      }
    })()
  }, [
    enabled,
    gameMode,
    role,
    roomReady,
    state.mode,
    state.mode === "4v4" ? state.firstAttackerId : null,
    terminalStatus,
    token,
  ])

  // 피어리스 picker 하이라이트/피드백은 관전자 화면에 즉시 반영되어야 한다.
  useEffect(() => {
    if (gameMode !== "4v4" || state.mode !== "4v4") return
    if (
      !enabled ||
      role !== "host" ||
      !token ||
      !roomReady ||
      terminalStatus
    ) {
      return
    }

    const next = state.pickerUi
    const prev = prevSyncedPickerUiRef.current
    prevSyncedPickerUiRef.current = {
      selectionSeq: next.selectionSeq,
      feedbackToken: next.feedbackToken,
    }
    if (
      prev &&
      prev.selectionSeq === next.selectionSeq &&
      prev.feedbackToken === next.feedbackToken
    ) {
      return
    }

    void (async () => {
      try {
        const currentState = stateRef.current
        const serialized = JSON.stringify(currentState)
        const { database } = await getAnonymousUser()
        const expiresAt = await writeScoreboardState(database, token, currentState)
        lastPublishedRef.current = serialized
        saveRoomSession(localStorage, HOST_SESSION_KEY, {
          token,
          expiresAt,
          gameMode,
        })
        setRoomExpiresAt(expiresAt)
      } catch (error) {
        if (databaseRef.current) goOffline(databaseRef.current)
        setTerminalStatus("error")
        setErrorMessage(toErrorMessage(error))
      }
    })()
  }, [
    enabled,
    gameMode,
    role,
    roomReady,
    state.mode,
    state.mode === "4v4" ? state.pickerUi.selectionSeq : 0,
    state.mode === "4v4" ? state.pickerUi.feedbackToken : 0,
    terminalStatus,
    token,
  ])

  useEffect(() => {
    if (
      role !== "host" ||
      !roomReady ||
      firebaseConnected !== false ||
      tabSuperseded
    ) {
      return
    }

    const timeout = window.setTimeout(
      expireHostSession,
      HOST_DISCONNECT_GRACE_MS,
    )
    return () => window.clearTimeout(timeout)
  }, [
    expireHostSession,
    firebaseConnected,
    role,
    roomReady,
    tabSuperseded,
  ])

  const startSharing = useCallback(async () => {
    if (busy || role !== "local") return
    setBusy(true)
    setTerminalStatus(null)
    setErrorMessage(null)
    shouldCreateRef.current = true
    setToken(generateRoomToken())
    setRole("host")
  }, [busy, role])

  const stopSharing = useCallback(async () => {
    if (busy || role !== "host" || !token) return
    setBusy(true)
    try {
      const { database } = await getAnonymousUser()
      goOnline(database)
      await deleteScoreboardRoom(database, token)
      goOffline(database)
      localStorage.removeItem(HOST_SESSION_KEY)
      setRole("local")
      setToken(null)
      setRoomReady(false)
      setRoomExpiresAt(null)
      setFirebaseConnected(null)
      setTerminalStatus(null)
      setErrorMessage(null)
    } catch (error) {
      if (databaseRef.current) goOffline(databaseRef.current)
      setTerminalStatus("error")
      setErrorMessage(
        `연동 종료에 실패했습니다. 다시 시도해 주세요. ${toErrorMessage(error)}`,
      )
    } finally {
      setBusy(false)
    }
  }, [busy, role, token])

  const stopViewing = useCallback(() => {
    returnViewerToLocal()
  }, [returnViewerToLocal])

  const switchGameMode = useCallback(
    async (targetMode: ScoreboardGameMode) => {
      if (busy || role !== "host" || !token || targetMode === gameMode) return
      setBusy(true)
      setTerminalStatus(null)
      setErrorMessage(null)
      try {
        const { database } = await getAnonymousUser()
        goOnline(database)
        const expiresAt = await writeScoreboardState(
          database,
          token,
          createDefaultScoreboardState(targetMode),
        )
        saveRoomSession(localStorage, HOST_SESSION_KEY, {
          token,
          expiresAt,
          gameMode: targetMode,
        })
        sessionStorage.setItem(MODE_SWITCH_SESSION_KEY, "1")
        window.location.replace(SCOREBOARD_GAME_PATHS[targetMode])
      } catch (error) {
        if (databaseRef.current) goOffline(databaseRef.current)
        setTerminalStatus("error")
        setErrorMessage(
          `모드 전환에 실패했습니다. 다시 시도해 주세요. ${toErrorMessage(error)}`,
        )
        setBusy(false)
      }
    },
    [busy, gameMode, role, token],
  )

  const inviteUrl = useMemo(
    () => (role === "host" && token && roomReady ? buildInviteUrl(token, gameMode) : null),
    [gameMode, role, roomReady, token],
  )

  const status: ScoreboardRoomStatus = useMemo(() => {
    if (terminalStatus) return terminalStatus
    if (role === "local") return "idle"
    if (!roomReady || firebaseConnected === null) return "connecting"
    if (!firebaseConnected) return "offline"
    if (role === "viewer" && !hostOnline) return "host-away"
    return "connected"
  }, [firebaseConnected, hostOnline, role, roomReady, terminalStatus])

  return {
    role,
    status,
    busy,
    tabSuperseded,
    inviteUrl,
    errorMessage,
    startSharing,
    stopSharing,
    stopViewing,
    switchGameMode,
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return "Firebase 연결 중 알 수 없는 오류가 발생했습니다."
}

function isPermissionDenied(error: unknown) {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code).toLowerCase()
      : ""
  const message = toErrorMessage(error).toLowerCase()
  return (
    code.includes("permission_denied") ||
    code.includes("permission-denied") ||
    message.includes("permission_denied") ||
    message.includes("permission denied")
  )
}

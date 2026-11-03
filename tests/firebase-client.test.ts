import { beforeEach, afterEach, describe, expect, it, vi } from "vitest"
import type { User } from "firebase/auth"

const { auth, database, signInAnonymously } = vi.hoisted(() => ({
  auth: {
    currentUser: null as User | null,
    authStateReady: vi.fn<() => Promise<void>>(),
  },
  database: {},
  signInAnonymously: vi.fn(),
}))

vi.mock("firebase/app", () => ({
  getApps: () => [],
  initializeApp: () => ({}),
}))

vi.mock("firebase/auth", () => ({
  browserLocalPersistence: {},
  getAuth: () => auth,
  setPersistence: async () => {},
  signInAnonymously,
}))

vi.mock("firebase/database", () => ({ getDatabase: () => database }))
vi.mock("firebase/app-check", () => ({}))

beforeEach(() => {
  vi.resetModules()
  vi.resetAllMocks()
  vi.useFakeTimers()
  vi.stubGlobal("window", globalThis)
  vi.stubEnv("NODE_ENV", "test")
  vi.stubEnv("NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY", "")
  for (const key of ["API_KEY", "AUTH_DOMAIN", "DATABASE_URL", "PROJECT_ID", "APP_ID"]) {
    vi.stubEnv(`NEXT_PUBLIC_FIREBASE_${key}`, "test")
  }
  auth.currentUser = null
  auth.authStateReady.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("Firebase anonymous auth readiness", () => {
  it("signs in a new user without advancing a timeout", async () => {
    const user = { uid: "new-user" } as User
    signInAnonymously.mockResolvedValue({ user })
    const { getAnonymousUser } = await import("../lib/firebase/client")

    expect(await getAnonymousUser()).toEqual({ user, database })
    expect(signInAnonymously).toHaveBeenCalledExactlyOnceWith(auth)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("waits for a persisted user and preserves their room ownership", async () => {
    let finishRestore!: () => void
    let startedRestore!: () => void
    const started = new Promise<void>((resolve) => { startedRestore = resolve })
    const restored = new Promise<void>((resolve) => { finishRestore = resolve })
    auth.authStateReady.mockImplementation(() => {
      startedRestore()
      return restored
    })
    const { getAnonymousUser } = await import("../lib/firebase/client")

    const pending = getAnonymousUser()
    await started
    expect(signInAnonymously).not.toHaveBeenCalled()

    const user = { uid: "existing-room-owner" } as User
    auth.currentUser = user
    finishRestore()

    expect(await pending).toEqual({ user, database })
    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  it("reuses an already signed-in user", async () => {
    const user = { uid: "signed-in-user" } as User
    auth.currentUser = user
    const { getAnonymousUser } = await import("../lib/firebase/client")

    expect(await getAnonymousUser()).toEqual({ user, database })
    expect(signInAnonymously).not.toHaveBeenCalled()
  })

  it("propagates readiness failures without creating another user", async () => {
    const error = new Error("Auth initialization failed")
    auth.authStateReady.mockRejectedValue(error)
    const { getAnonymousUser } = await import("../lib/firebase/client")

    await expect(getAnonymousUser()).rejects.toBe(error)
    expect(signInAnonymously).not.toHaveBeenCalled()
  })
})

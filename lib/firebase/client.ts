"use client"

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app"
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  signInAnonymously,
  type Auth,
  type User,
} from "firebase/auth"
import { getDatabase, type Database } from "firebase/database"
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
} from "firebase/app-check"

type FirebaseClient = {
  app: FirebaseApp
  auth: Auth
  database: Database
}

function normalizeDatabaseUrl(value: string | undefined) {
  if (!value) return value
  // 끝의 `/`는 빈 path token을 만들어 Invalid token in path를 유발할 수 있다.
  return value.replace(/\/+$/, "")
}

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: normalizeDatabaseUrl(
    process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  ),
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
}

let clientPromise: Promise<FirebaseClient> | null = null
let appCheckStarted = false

export class FirebaseConfigurationError extends Error {
  constructor() {
    super("Firebase 환경 변수가 설정되지 않았습니다.")
    this.name = "FirebaseConfigurationError"
  }
}

export class FirebaseAppCheckConfigurationError extends Error {
  constructor() {
    super("프로덕션 Firebase App Check 사이트 키가 설정되지 않았습니다.")
    this.name = "FirebaseAppCheckConfigurationError"
  }
}

function hasRequiredConfiguration() {
  return Object.values(firebaseConfig).every(
    (value) => typeof value === "string" && value.length > 0,
  )
}

function startAppCheck(app: FirebaseApp) {
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY
  if (appCheckStarted) return
  if (!siteKey) {
    if (process.env.NODE_ENV === "production") {
      throw new FirebaseAppCheckConfigurationError()
    }
    return
  }

  initializeAppCheck(app, {
    provider: new ReCaptchaEnterpriseProvider(siteKey),
    isTokenAutoRefreshEnabled: true,
  })
  appCheckStarted = true
}

export function isFirebaseConfigured() {
  return hasRequiredConfiguration()
}

export async function getFirebaseClient(): Promise<FirebaseClient> {
  if (typeof window === "undefined" || !hasRequiredConfiguration()) {
    throw new FirebaseConfigurationError()
  }

  if (!clientPromise) {
    clientPromise = (async () => {
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig)
      startAppCheck(app)

      const auth = getAuth(app)
      await setPersistence(auth, browserLocalPersistence)

      return {
        app,
        auth,
        database: getDatabase(app),
      }
    })()
  }

  return clientPromise
}

export async function getAnonymousUser(): Promise<{
  user: User
  database: Database
}> {
  const { auth, database } = await getFirebaseClient()
  if (auth.currentUser) return { user: auth.currentUser, database }

  const credential = await signInAnonymously(auth)
  return { user: credential.user, database }
}

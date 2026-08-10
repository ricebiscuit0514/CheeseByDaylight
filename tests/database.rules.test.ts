import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing"
import { get, ref, remove, set, update } from "firebase/database"
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest"

const PROJECT_ID = "cheese-by-daylight-rules-test"
const OWNER_UID = "host-user"
const VIEWER_UID = "viewer-user"
const ROOM_TOKEN = "a".repeat(48)
const RECENTLY_DISCONNECTED_TOKEN = "d".repeat(48)
const STALE_DISCONNECTED_TOKEN = "e".repeat(48)
const NEW_ROOM_TOKEN = "f".repeat(48)
const CONNECTION_ID = "1".repeat(24)
const NEXT_CONNECTION_ID = "2".repeat(24)

let testEnv: RulesTestEnvironment

function roomData(expiresAt = Date.now() + 30 * 60 * 1000) {
  const now = Date.now()
  return {
    version: 1,
    ownerUid: OWNER_UID,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    hostConnections: { [CONNECTION_ID]: true },
    scoreboard: {
      mode: "4v4",
      thomasCount: 1,
      adaCount: 1,
      thomasName: "A",
      adaName: "B",
      thomas: [
        {
          id: "thomas-1",
          name: "Player A",
          kills: 0,
          played: false,
          killer: "",
        },
      ],
      ada: [
        {
          id: "ada-1",
          name: "Player B",
          kills: 0,
          played: false,
          killer: "",
        },
      ],
      ace: {
        isActive: false,
        hasCompleted: false,
        showProceedButton: false,
      },
    },
  }
}

function fivePlayerRoomData(expiresAt = Date.now() + 30 * 60 * 1000) {
  const now = Date.now()
  return {
    version: 1,
    ownerUid: OWNER_UID,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt,
    hostConnections: { [CONNECTION_ID]: true },
    scoreboard: {
      mode: "5p",
      playerCount: 1,
      players: [
        {
          id: "1",
          name: "Player",
          kills: 0,
          played: false,
        },
      ],
      receivingConfig: [5, 8, 10, 12, 15],
      givingConfig: [15, 12, 10, 8, 5],
    },
  }
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    database: {
      rules: readFileSync(
        resolve(process.cwd(), "database.rules.json"),
        "utf8",
      ),
    },
  })
})

beforeEach(async () => {
  await testEnv.clearDatabase()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const database = context.database()
    await set(ref(database, `scoreboardRooms/${ROOM_TOKEN}`), roomData())
    await set(
      ref(database, `scoreboardRooms/${RECENTLY_DISCONNECTED_TOKEN}`),
      {
        ...roomData(),
        hostConnections: null,
        hostDisconnectedAt: Date.now() - 35 * 60 * 1000,
      },
    )
    await set(
      ref(database, `scoreboardRooms/${STALE_DISCONNECTED_TOKEN}`),
      {
        ...roomData(),
        hostConnections: null,
        hostDisconnectedAt: Date.now() - 41 * 60 * 1000,
      },
    )
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

describe("Realtime Database scoreboard room rules", () => {
  it("allows an authenticated viewer to read a valid secret room", async () => {
    const database = testEnv.authenticatedContext(VIEWER_UID).database()
    await assertSucceeds(get(ref(database, `scoreboardRooms/${ROOM_TOKEN}`)))
  })

  it("denies room listing and unauthenticated reads", async () => {
    const viewerDatabase = testEnv
      .authenticatedContext(VIEWER_UID)
      .database()
    const guestDatabase = testEnv.unauthenticatedContext().database()

    await assertFails(get(ref(viewerDatabase, "scoreboardRooms")))
    await assertFails(get(ref(guestDatabase, `scoreboardRooms/${ROOM_TOKEN}`)))
  })

  it("allows only the owner to update scoreboard state", async () => {
    const ownerDatabase = testEnv.authenticatedContext(OWNER_UID).database()
    const viewerDatabase = testEnv
      .authenticatedContext(VIEWER_UID)
      .database()

    await assertSucceeds(
      update(
        ref(
          ownerDatabase,
          `scoreboardRooms/${ROOM_TOKEN}/scoreboard/thomas/0`,
        ),
        { kills: 3, played: true },
      ),
    )
    await assertFails(
      update(
        ref(
          viewerDatabase,
          `scoreboardRooms/${ROOM_TOKEN}/scoreboard/thomas/0`,
        ),
        { kills: 4, played: true },
      ),
    )
  })

  it("allows ordered picks and valid killer bans for the owner", async () => {
    const ownerDatabase = testEnv.authenticatedContext(OWNER_UID).database()

    await assertSucceeds(
      set(
        ref(
          ownerDatabase,
          `scoreboardRooms/${ROOM_TOKEN}/scoreboard/thomas/0/killerPicks`,
        ),
        ["nurse", "ghost-face", "artist"],
      ),
    )
    await assertSucceeds(
      set(
        ref(ownerDatabase, `scoreboardRooms/${ROOM_TOKEN}/scoreboard/killerBans`),
        {
          "skull-merchant": true,
          xenomorph: true,
        },
      ),
    )
  })

  it("allows synced picker ui highlight and feedback for the owner", async () => {
    const ownerDatabase = testEnv.authenticatedContext(OWNER_UID).database()

    await assertSucceeds(
      update(ref(ownerDatabase, `scoreboardRooms/${ROOM_TOKEN}/scoreboard`), {
        pickerUi: {
          sel: "nurse",
          selSeq: 3,
          fb: { k: "nurse", kind: "pick", t: 1234 },
        },
      }),
    )
    await assertFails(
      update(ref(ownerDatabase, `scoreboardRooms/${ROOM_TOKEN}/scoreboard`), {
        pickerUi: {
          sel: "Ghost Face",
          selSeq: 1,
        },
      }),
    )
  })

  it("rejects a fifth pick and invalid fearless slugs or ban values", async () => {
    const database = testEnv.authenticatedContext(OWNER_UID).database()
    const playerRef = ref(
      database,
      `scoreboardRooms/${ROOM_TOKEN}/scoreboard/thomas/0/killerPicks`,
    )
    const bansRef = ref(
      database,
      `scoreboardRooms/${ROOM_TOKEN}/scoreboard/killerBans`,
    )

    await assertFails(
      set(playerRef, ["nurse", "wraith", "artist", "blight", "clown"]),
    )
    await assertFails(set(playerRef, ["Ghost Face"]))
    await assertFails(set(bansRef, { "not_a_slug": true }))
    await assertFails(set(bansRef, { nurse: false }))
  })

  it("denies viewer writes to fearless picks and bans", async () => {
    const database = testEnv.authenticatedContext(VIEWER_UID).database()

    await assertFails(
      set(
        ref(
          database,
          `scoreboardRooms/${ROOM_TOKEN}/scoreboard/thomas/0/killerPicks`,
        ),
        ["nurse"],
      ),
    )
    await assertFails(
      set(
        ref(
          database,
          `scoreboardRooms/${ROOM_TOKEN}/scoreboard/killerBans/nurse`,
        ),
        true,
      ),
    )
  })

  it("rejects invalid score values and unknown fields", async () => {
    const database = testEnv.authenticatedContext(OWNER_UID).database()

    await assertFails(
      update(
        ref(
          database,
          `scoreboardRooms/${ROOM_TOKEN}/scoreboard/thomas/0`,
        ),
        { kills: 2.5 },
      ),
    )
    await assertFails(
      set(
        ref(
          database,
          `scoreboardRooms/${ROOM_TOKEN}/scoreboard/unexpected`,
        ),
        true,
      ),
    )
    await assertFails(
      set(
        ref(
          database,
          `scoreboardRooms/${ROOM_TOKEN}/scoreboard/ace/winnersMap/not-a-player`,
        ),
        "win",
      ),
    )
  })

  it("allows the owner to create a room and register initial presence", async () => {
    const ownerDatabase = testEnv.authenticatedContext(OWNER_UID).database()
    const now = Date.now()

    await assertSucceeds(
      set(ref(ownerDatabase, `scoreboardRooms/${NEW_ROOM_TOKEN}`), {
        version: 1,
        ownerUid: OWNER_UID,
        status: "active",
        createdAt: now,
        updatedAt: now,
        expiresAt: now + 30 * 60 * 1000,
        scoreboard: roomData().scoreboard,
      }),
    )
    await assertSucceeds(
      update(ref(ownerDatabase, `scoreboardRooms/${NEW_ROOM_TOKEN}`), {
        hostConnections: { [CONNECTION_ID]: true },
        hostDisconnectedAt: null,
      }),
    )
  })

  it("allows a 40-minute host reconnect grace and closes stale rooms", async () => {
    const viewerDatabase = testEnv
      .authenticatedContext(VIEWER_UID)
      .database()
    const ownerDatabase = testEnv.authenticatedContext(OWNER_UID).database()

    await assertSucceeds(
      get(
        ref(
          viewerDatabase,
          `scoreboardRooms/${RECENTLY_DISCONNECTED_TOKEN}`,
        ),
      ),
    )
    await assertSucceeds(
      update(
        ref(
          ownerDatabase,
          `scoreboardRooms/${RECENTLY_DISCONNECTED_TOKEN}`,
        ),
        {
          hostConnections: { [NEXT_CONNECTION_ID]: true },
          hostDisconnectedAt: null,
        },
      ),
    )
    await assertFails(
      get(
        ref(viewerDatabase, `scoreboardRooms/${STALE_DISCONNECTED_TOKEN}`),
      ),
    )
    await assertFails(
      update(
        ref(ownerDatabase, `scoreboardRooms/${STALE_DISCONNECTED_TOKEN}`),
        {
          hostConnections: { [NEXT_CONNECTION_ID]: true },
          hostDisconnectedAt: null,
        },
      ),
    )
    await assertSucceeds(
      remove(
        ref(ownerDatabase, `scoreboardRooms/${STALE_DISCONNECTED_TOKEN}`),
      ),
    )
  })

  it("allows a user to create a validated room they own", async () => {
    const token = "c".repeat(48)
    const database = testEnv.authenticatedContext(OWNER_UID).database()

    await assertSucceeds(
      set(ref(database, `scoreboardRooms/${token}`), roomData()),
    )
  })

  it("allows killer picks on 5p players for the owner", async () => {
    const token = "5".repeat(48)
    const ownerDatabase = testEnv.authenticatedContext(OWNER_UID).database()

    await assertSucceeds(
      set(ref(ownerDatabase, `scoreboardRooms/${token}`), fivePlayerRoomData()),
    )
    await assertSucceeds(
      set(
        ref(
          ownerDatabase,
          `scoreboardRooms/${token}/scoreboard/players/0/killerPicks`,
        ),
        ["nurse", "ghost-face"],
      ),
    )
    await assertSucceeds(
      set(
        ref(ownerDatabase, `scoreboardRooms/${token}/scoreboard/killerBans`),
        { xenomorph: true },
      ),
    )
    await assertSucceeds(
      update(ref(ownerDatabase, `scoreboardRooms/${token}/scoreboard`), {
        pickerUi: {
          sel: "nurse",
          selSeq: 2,
          fb: { k: "nurse", kind: "pick", t: 4321 },
        },
      }),
    )
  })

  it("continues to accept the legacy 4v4 payload without fearless fields", async () => {
    const token = "b".repeat(48)
    const database = testEnv.authenticatedContext(OWNER_UID).database()

    await assertSucceeds(
      set(ref(database, `scoreboardRooms/${token}`), roomData()),
    )
  })
})

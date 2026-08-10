import { describe, expect, it } from "vitest"
import {
  cancelPlayerKillerPick,
  filterVisiblePicks,
  flattenFearlessPicks,
  formatFearlessPickSlotLabel,
  getFearlessRowSlots,
  getPickerCellState,
  hangulToSearchJamo,
  normalizeFearlessSearchText,
  playerOwnsKillerPick,
  searchKillers,
  setPlayerKillerPick,
  stripSearchWhitespace,
  toggleKillerBan,
  type FearlessKillerSearchItem,
  type FearlessPlayer,
} from "../lib/fearless"
import { KILLERS, resolveKillerId } from "../lib/killer-catalog"

function player(
  id: string,
  name: string,
  killerPicks: string[] = [],
): FearlessPlayer {
  return { id, name, killerPicks }
}

describe("fearless pick entries and visibility", () => {
  const thomas = [
    player("t1", "Thomas One", ["nurse", "artist"]),
    player("t2", "Thomas Two", ["nurse"]),
  ]
  const ada = [player("a1", "Ada One", ["nurse"])]

  it("flattens teams in order and keeps cross-player duplicate killers", () => {
    expect(flattenFearlessPicks(thomas, ada)).toEqual([
      {
        killerId: "nurse",
        playerId: "t1",
        playerName: "Thomas One",
        team: "thomas",
        slotIndex: 0,
      },
      {
        killerId: "artist",
        playerId: "t1",
        playerName: "Thomas One",
        team: "thomas",
        slotIndex: 1,
      },
      {
        killerId: "nurse",
        playerId: "t2",
        playerName: "Thomas Two",
        team: "thomas",
        slotIndex: 0,
      },
      {
        killerId: "nurse",
        playerId: "a1",
        playerName: "Ada One",
        team: "ada",
        slotIndex: 0,
      },
    ])
  })

  it("supports hard, team-soft, and personal visibility", () => {
    const entries = flattenFearlessPicks(thomas, ada)

    expect(filterVisiblePicks(entries, "hard")).toHaveLength(4)
    expect(
      filterVisiblePicks(entries, "soft", { team: "ada" }).map(
        (entry) => entry.playerId,
      ),
    ).toEqual(["a1"])
    expect(
      filterVisiblePicks(entries, "personal", { playerId: "t1" }).map(
        (entry) => entry.slotIndex,
      ),
    ).toEqual([0, 1])
    expect(filterVisiblePicks(entries, "soft")).toEqual([])
    expect(filterVisiblePicks(entries, "personal")).toEqual([])
  })

  it("shows bans independently and allows banned plus picked state", () => {
    const entries = flattenFearlessPicks(thomas, ada)
    const personalEntries = filterVisiblePicks(entries, "personal", {
      playerId: "a1",
    })

    expect(getPickerCellState("artist", personalEntries, ["artist"])).toEqual({
      isBanned: true,
      visiblePicks: [],
    })
    const nurseCell = getPickerCellState("nurse", personalEntries, ["nurse"])
    expect(nurseCell.isBanned).toBe(true)
    expect(nurseCell.visiblePicks).toHaveLength(1)
  })
})

describe("fearless pick and ban updates", () => {
  it("blocks same-player duplicates while allowing replace of another slot", () => {
    const original = player("p1", "Player", ["nurse"])
    const samePlayerDuplicate = setPlayerKillerPick(original, "nurse", null)
    const appended = setPlayerKillerPick(original, "artist", null)
    const replaced = setPlayerKillerPick(appended, "clown", 0)
    const replaceWithOwned = setPlayerKillerPick(appended, "nurse", 1)

    expect(samePlayerDuplicate).toBe(original)
    expect(appended.killerPicks).toEqual(["nurse", "artist"])
    expect(replaced.killerPicks).toEqual(["clown", "artist"])
    expect(replaceWithOwned).toBe(appended)
    expect(playerOwnsKillerPick(appended, "nurse")).toBe(true)
    expect(playerOwnsKillerPick(appended, "nurse", 0)).toBe(false)
    expect(original.killerPicks).toEqual(["nurse"])
  })

  it("cancels an indexed slot and enforces max four", () => {
    const picks = player("p1", "Player", ["nurse", "artist", "clown"])
    expect(cancelPlayerKillerPick(picks, 1).killerPicks).toEqual([
      "nurse",
      "clown",
    ])

    const full = player("p1", "Player", [
      "nurse",
      "artist",
      "clown",
      "doctor",
    ])
    expect(setPlayerKillerPick(full, "wraith", null)).toBe(full)
  })

  it("uses no-op policy for invalid catalog IDs and indices", () => {
    const original = player("p1", "Player", ["nurse"])

    expect(setPlayerKillerPick(original, "not-in-catalog", null)).toBe(original)
    expect(setPlayerKillerPick(original, "artist", -1)).toBe(original)
    expect(setPlayerKillerPick(original, "artist", 2)).toBe(original)
    expect(setPlayerKillerPick(original, "artist", 1).killerPicks).toEqual([
      "nurse",
      "artist",
    ])
    expect(cancelPlayerKillerPick(original, 2)).toBe(original)
    expect(toggleKillerBan(["nurse"], "not-in-catalog")).toEqual(["nurse"])
  })

  it("toggles only unique catalog IDs", () => {
    expect(
      toggleKillerBan(
        ["nurse", "nurse", "not-in-catalog", "artist"],
        "wraith",
      ),
    ).toEqual(["nurse", "artist", "wraith"])
    expect(toggleKillerBan(["nurse", "nurse"], "nurse")).toEqual([])
  })
})

describe("fearless killer search", () => {
  const catalog: FearlessKillerSearchItem[] = [
    {
      id: "ghost-face",
      englishName: "Ghost Face",
      koreanName: "고스트 페이스",
      aliases: ["The Ghost", "고페"],
    },
    {
      id: "dark-lord",
      englishName: "Dark Lord",
      koreanName: "어둠의 군주",
      aliases: ["Dracula"],
    },
  ]

  it("matches Korean initials contained in the name initials", () => {
    expect(searchKillers(" ㄱㅅㅌ ", catalog).map((killer) => killer.id)).toEqual([
      "ghost-face",
    ])
    expect(searchKillers("ㅅㅌㅍ", catalog).map((killer) => killer.id)).toEqual([
      "ghost-face",
    ])
  })

  it("matches English case-insensitively plus aliases and IDs", () => {
    expect(searchKillers("gHoSt Fa", catalog)).toEqual([catalog[0]])
    expect(searchKillers("DRAC", catalog)).toEqual([catalog[1]])
    expect(searchKillers("dark_lord", catalog)).toEqual([catalog[1]])
  })

  it("matches names without requiring spaces in the query or catalog text", () => {
    expect(stripSearchWhitespace("착한 아이")).toBe("착한아이")
    expect(normalizeFearlessSearchText("Ghost Face")).toBe("ghostface")
    expect(normalizeFearlessSearchText("고 스 트 페 이 스")).toBe("고스트페이스")

    expect(searchKillers("고스트페이스", KILLERS).map((killer) => killer.id)).toEqual([
      "ghost-face",
    ])
    expect(searchKillers("고스트 페이스", KILLERS).map((killer) => killer.id)).toEqual([
      "ghost-face",
    ])
    expect(searchKillers("착한아이", KILLERS).map((killer) => killer.id)).toEqual([
      "good-guy",
    ])
    expect(searchKillers("착한 아이", KILLERS).map((killer) => killer.id)).toEqual([
      "good-guy",
    ])
    expect(searchKillers("해골상인", KILLERS).map((killer) => killer.id)).toEqual([
      "skull-merchant",
    ])
    expect(searchKillers("치즈상인", KILLERS).map((killer) => killer.id)).toEqual([
      "skull-merchant",
    ])
    expect(searchKillers("ghostface", KILLERS).map((killer) => killer.id)).toEqual([
      "ghost-face",
    ])
    expect(searchKillers("goodguy", KILLERS).map((killer) => killer.id)).toEqual([
      "good-guy",
    ])
    expect(searchKillers("어둠의군주", KILLERS).map((killer) => killer.id)).toEqual([
      "dark-lord",
    ])

    expect(hangulToSearchJamo("너ㅅ")).toBe("ㄴㅓㅅ")
    expect(hangulToSearchJamo("너스")).toBe("ㄴㅓㅅㅡ")
    expect(searchKillers("너", KILLERS).map((killer) => killer.id)).toContain("nurse")
    expect(searchKillers("너ㅅ", KILLERS).map((killer) => killer.id)).toContain("nurse")
    expect(searchKillers("너스", KILLERS).map((killer) => killer.id)).toContain("nurse")

    expect(resolveKillerId("착한아이")).toBe("good-guy")
    expect(resolveKillerId("Ghost Face")).toBe("ghost-face")
    expect(resolveKillerId("ghostface")).toBe("ghost-face")
    expect(resolveKillerId("치즈상인")).toBe("skull-merchant")
  })
})

describe("fearless row slots and identity", () => {
  it("reveals the next empty slot after each pick and keeps four slots total", () => {
    expect(getFearlessRowSlots([])).toEqual([
      { kind: "empty", slotIndex: 0, killerId: null, actionable: true, visible: true },
      { kind: "empty", slotIndex: 1, killerId: null, actionable: false, visible: false },
      { kind: "empty", slotIndex: 2, killerId: null, actionable: false, visible: false },
      { kind: "empty", slotIndex: 3, killerId: null, actionable: false, visible: false },
    ])

    expect(getFearlessRowSlots(["nurse"])).toEqual([
      { kind: "filled", slotIndex: 0, killerId: "nurse" },
      { kind: "empty", slotIndex: 1, killerId: null, actionable: true, visible: true },
      { kind: "empty", slotIndex: 2, killerId: null, actionable: false, visible: false },
      { kind: "empty", slotIndex: 3, killerId: null, actionable: false, visible: false },
    ])

    expect(getFearlessRowSlots(["nurse", "artist"])).toEqual([
      { kind: "filled", slotIndex: 0, killerId: "nurse" },
      { kind: "filled", slotIndex: 1, killerId: "artist" },
      { kind: "empty", slotIndex: 2, killerId: null, actionable: true, visible: true },
      { kind: "empty", slotIndex: 3, killerId: null, actionable: false, visible: false },
    ])

    const full = getFearlessRowSlots([
      "nurse",
      "artist",
      "clown",
      "doctor",
    ])
    expect(full).toHaveLength(4)
    expect(full.every((slot) => slot.kind === "filled")).toBe(true)
  })

  it("keeps picks bound to player IDs across reorder and removes deleted players", () => {
    const first = player("stable-a", "A", ["nurse"])
    const second = player("stable-b", "B", ["artist"])

    const reordered = flattenFearlessPicks([second, first], [])
    expect(
      Object.fromEntries(
        reordered.map((entry) => [entry.playerId, entry.killerId]),
      ),
    ).toEqual({ "stable-b": "artist", "stable-a": "nurse" })

    const afterDelete = flattenFearlessPicks([second], [])
    expect(afterDelete.some((entry) => entry.playerId === "stable-a")).toBe(false)
    expect(afterDelete).toHaveLength(1)
  })
})

describe("formatFearlessPickSlotLabel", () => {
  it("uses Korean ordinals for the first four slots", () => {
    expect(formatFearlessPickSlotLabel(0)).toBe("첫 번째 살인마 선택")
    expect(formatFearlessPickSlotLabel(1)).toBe("두 번째 살인마 선택")
    expect(formatFearlessPickSlotLabel(2)).toBe("세 번째 살인마 선택")
    expect(formatFearlessPickSlotLabel(3)).toBe("네 번째 살인마 선택")
  })

  it("returns 새 살인마 선택 for append slots", () => {
    expect(formatFearlessPickSlotLabel(null)).toBe("새 살인마 선택")
  })
})

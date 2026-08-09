import generatedCatalog from './killer-catalog.generated.json'

export type KillerDefinition = {
  readonly id: string
  readonly englishName: string
  readonly koreanName: string
  readonly aliases: readonly string[]
  readonly sortOrder: number
  readonly bigPortrait: string
  readonly smallPortrait: string
}

export type KillerId = KillerDefinition['id']

export const KILLERS: readonly KillerDefinition[] = Object.freeze(
  generatedCatalog
    .map((killer) =>
      Object.freeze({
        ...killer,
        aliases: Object.freeze([...killer.aliases]),
      }),
    )
    .sort((left, right) => left.sortOrder - right.sortOrder),
)

export const KILLER_BY_ID: Readonly<Record<KillerId, KillerDefinition>> =
  Object.freeze(
    Object.fromEntries(KILLERS.map((killer) => [killer.id, killer])),
  )

function normalizeLookupValue(value: string): string {
  return value.trim().toLowerCase()
}

const killerIdByName = new Map<string, KillerId>()

for (const killer of KILLERS) {
  const names = [
    killer.id,
    killer.englishName,
    killer.koreanName,
    ...killer.aliases,
  ]

  for (const name of names) {
    const normalizedName = normalizeLookupValue(name)
    if (normalizedName && !killerIdByName.has(normalizedName)) {
      killerIdByName.set(normalizedName, killer.id)
    }
  }
}

export function isKillerId(value: string): value is KillerId {
  return Object.hasOwn(KILLER_BY_ID, value)
}

export function resolveKillerId(value: string): KillerId | undefined {
  return killerIdByName.get(normalizeLookupValue(value))
}

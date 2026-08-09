import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const EXPECTED_HEADERS = [
  'id',
  'english_name',
  'korean_name',
  'aliases',
  'sort_order',
]
const EXPECTED_KILLER_COUNT = 44
const ASCII_SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(scriptDirectory, '..')
const csvPath = join(projectRoot, 'data', 'characters.csv')
const outputPath = join(projectRoot, 'lib', 'killer-catalog.generated.json')

function parseCsv(source) {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let closedQuote = false

  const finishField = () => {
    row.push(field)
    field = ''
    closedQuote = false
  }

  const finishRow = () => {
    finishField()
    rows.push(row)
    row = []
  }

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (inQuotes) {
      if (character !== '"') {
        field += character
        continue
      }

      if (source[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = false
        closedQuote = true
      }
      continue
    }

    if (closedQuote) {
      if (character === ',') {
        finishField()
      } else if (character === '\n') {
        finishRow()
      } else if (character === '\r' && source[index + 1] === '\n') {
        continue
      } else {
        throw new Error(`Unexpected character after closing quote at offset ${index}`)
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new Error(`Unexpected quote in unquoted field at offset ${index}`)
      }
      inQuotes = true
    } else if (character === ',') {
      finishField()
    } else if (character === '\n') {
      finishRow()
    } else if (character === '\r') {
      if (source[index + 1] !== '\n') {
        finishRow()
      }
    } else {
      field += character
    }
  }

  if (inQuotes) {
    throw new Error('CSV ends inside a quoted field')
  }

  if (closedQuote || field.length > 0 || row.length > 0) {
    finishRow()
  }

  return rows
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

const rows = parseCsv(readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, ''))
assert(rows.length > 0, 'characters.csv is empty')

const headers = rows[0]
assert(
  headers.length === EXPECTED_HEADERS.length &&
    headers.every((header, index) => header === EXPECTED_HEADERS[index]),
  `Expected CSV headers: ${EXPECTED_HEADERS.join(',')}`,
)

const dataRows = rows.slice(1)
assert(
  dataRows.length === EXPECTED_KILLER_COUNT,
  `Expected ${EXPECTED_KILLER_COUNT} character rows, found ${dataRows.length}`,
)

const ids = new Set()
const sortOrders = new Set()
const catalog = dataRows.map((values, index) => {
  const rowNumber = index + 2
  assert(
    values.length === EXPECTED_HEADERS.length,
    `Row ${rowNumber} has ${values.length} columns; expected ${EXPECTED_HEADERS.length}`,
  )

  const [rawId, rawEnglishName, rawKoreanName, rawAliases, rawSortOrder] = values
  const id = rawId.trim()
  const englishName = rawEnglishName.trim()
  const koreanName = rawKoreanName.trim()
  const aliases = rawAliases
    .split('|')
    .map((alias) => alias.trim())
    .filter(Boolean)
  const sortOrder = Number(rawSortOrder.trim())

  assert(ASCII_SLUG.test(id), `Row ${rowNumber} has invalid ASCII slug "${id}"`)
  assert(!ids.has(id), `Row ${rowNumber} duplicates id "${id}"`)
  assert(englishName.length > 0, `Row ${rowNumber} is missing english_name`)
  assert(
    Number.isSafeInteger(sortOrder) && sortOrder > 0,
    `Row ${rowNumber} has invalid positive sort_order "${rawSortOrder}"`,
  )
  assert(
    !sortOrders.has(sortOrder),
    `Row ${rowNumber} duplicates sort_order ${sortOrder}`,
  )

  const bigPortrait = `/portraits/big/${id}.webp`
  const smallPortrait = `/portraits/small/${id}_s.webp`
  assert(
    existsSync(join(projectRoot, 'public', bigPortrait)),
    `Missing big portrait for "${id}": public${bigPortrait}`,
  )
  assert(
    existsSync(join(projectRoot, 'public', smallPortrait)),
    `Missing small portrait for "${id}": public${smallPortrait}`,
  )

  ids.add(id)
  sortOrders.add(sortOrder)

  return {
    id,
    englishName,
    koreanName,
    aliases,
    sortOrder,
    bigPortrait,
    smallPortrait,
  }
})

catalog.sort((left, right) => left.sortOrder - right.sortOrder)
writeFileSync(outputPath, `${JSON.stringify(catalog, null, 2)}\n`, 'utf8')
console.log(`Generated ${catalog.length} killers at ${outputPath}`)

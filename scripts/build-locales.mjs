import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'

const sourceDir = resolve('content/locales')
const outputDir = resolve('app/generated/locales')

const shortServiceWords = [
  // Russian.
  'а', 'без', 'в', 'во', 'да', 'для', 'до', 'за', 'и', 'из', 'к', 'ко', 'на', 'не', 'ни', 'но', 'о', 'об', 'от', 'по', 'под', 'при', 'про', 'с', 'со', 'у',
  // English. Kept here now so the same build step is ready for en.json.
  'a', 'an', 'and', 'as', 'at', 'by', 'for', 'from', 'in', 'into', 'nor', 'of', 'on', 'or', 'the', 'to', 'up', 'via', 'with',
]

const shortServiceWordPattern = new RegExp(
  `(^|[>\\s([{\u00ab\u201e\u201c\u2018])(${shortServiceWords.join('|')})[ \\t]+(?=[\\p{L}\\p{N}])`,
  'giu',
)

function bindShortWords(text) {
  let result = text.replaceAll('\u00a0', ' ')
  for (let pass = 0; pass < 4; pass += 1) {
    const next = result.replace(shortServiceWordPattern, '$1$2\u00a0')
    if (next === result) break
    result = next
  }
  return result
}

function processLocale(value) {
  if (typeof value === 'string') return bindShortWords(value)
  if (Array.isArray(value)) return value.map(processLocale)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, processLocale(item)]),
    )
  }
  return value
}

const files = (await readdir(sourceDir)).filter(file => extname(file) === '.json')
if (!files.length) throw new Error(`No locale sources found in ${sourceDir}`)

const sources = Object.fromEntries(await Promise.all(
  files.map(async file => [file, JSON.parse(await readFile(resolve(sourceDir, file), 'utf8'))]),
))
const reference = sources['ru.json'] ?? sources[files[0]]

function assertSameShape(referenceValue, candidateValue, path, localeFile) {
  if (Array.isArray(referenceValue)) {
    if (!Array.isArray(candidateValue) || candidateValue.length !== referenceValue.length) {
      throw new Error(`${localeFile}: locale shape mismatch at ${path}`)
    }
    referenceValue.forEach((item, index) => {
      assertSameShape(item, candidateValue[index], `${path}[${index}]`, localeFile)
    })
    return
  }
  if (referenceValue && typeof referenceValue === 'object') {
    if (!candidateValue || typeof candidateValue !== 'object' || Array.isArray(candidateValue)) {
      throw new Error(`${localeFile}: locale shape mismatch at ${path}`)
    }
    for (const key of Object.keys(referenceValue)) {
      if (!(key in candidateValue)) throw new Error(`${localeFile}: missing locale key ${path}.${key}`)
      assertSameShape(referenceValue[key], candidateValue[key], `${path}.${key}`, localeFile)
    }
  }
}

await mkdir(outputDir, { recursive: true })

for (const file of files) {
  const source = sources[file]
  if (source !== reference) assertSameShape(reference, source, '$', file)
  const output = processLocale(source)
  const projectDetails = output.projects?.details
  if (output.projects) delete output.projects.details
  await writeFile(resolve(outputDir, file), `${JSON.stringify(output, null, 2)}\n`)
  if (projectDetails) {
    const code = basename(file, '.json')
    await writeFile(
      resolve(outputDir, `${code}.project-details.json`),
      `${JSON.stringify(projectDetails, null, 2)}\n`,
    )
  }
  console.log(`Generated locale ${basename(file)}`)
}

const localeCodes = files.map(file => basename(file, '.json'))
const defaultLocale = localeCodes.includes('en') ? 'en' : localeCodes[0]
const loaderLines = localeCodes.map(code => (
  code === defaultLocale
    ? `  ${JSON.stringify(code)}: async () => defaultMessages,`
    : `  ${JSON.stringify(code)}: () => import('./${code}.json').then(module => module.default),`
))
const projectDetailLoaderLines = localeCodes.map(code => (
  `  ${JSON.stringify(code)}: () => import('./${code}.project-details.json').then(module => module.default),`
))
const manifest = [
  `import defaultMessages from './${defaultLocale}.json'`,
  '',
  `export const defaultLocale = ${JSON.stringify(defaultLocale)} as const`,
  'export { defaultMessages }',
  'export const localeLoaders = {',
  ...loaderLines,
  '} as const',
  'export const projectDetailLocaleLoaders = {',
  ...projectDetailLoaderLines,
  '} as const',
  'export type LocaleCode = keyof typeof localeLoaders',
  '',
].join('\n')
await writeFile(resolve(outputDir, 'manifest.ts'), manifest)

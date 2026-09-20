import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const root = process.cwd()
const publicRoot = resolve(root, 'public')
const outputRoot = resolve(publicRoot, 'og')
const structure = JSON.parse(await readFile(resolve(root, 'app/data/homeCases.json'), 'utf8'))
const details = JSON.parse(await readFile(resolve(root, 'app/data/projectCaseDetails.json'), 'utf8'))
const copy = JSON.parse(await readFile(resolve(root, 'content/locales/ru.json'), 'utf8'))
const logo = (await readFile(resolve(publicRoot, 'brand/kado-logo-en.svg'), 'utf8'))
  .replace('<svg ', '<svg x="72" y="62" ')
  .replace('width="3248" height="1087"', 'width="243" height="81"')

const escapeXml = text => text.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
const lines = (texts, x, y, size) => texts.map((text, index) => (
  `<text x="${x}" y="${y + index * size * 1.25}" font-family="Segoe UI, Arial, sans-serif" font-size="${size}" fill="#171915">${escapeXml(text)}</text>`
)).join('')
function canvas(content) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#ece7dd"/>${logo}${content}${lines(['kadonext.com'], 72, 565, 24)}</svg>`)
}

await mkdir(outputRoot, { recursive: true })
// Keep the approved image artwork as a versioned source. Never replace it with
// the old text-only slide during a subsequent production build.
await sharp(resolve(root, 'content/og/home-keycap.png'))
  .resize(1200, 630, { fit: 'cover', position: 'centre' })
  .jpeg({ quality: 90, mozjpeg: true }).toFile(resolve(outputRoot, 'home.jpg'))

const tilePositions = [{ left: 568, top: 32 }, { left: 884, top: 32 }, { left: 568, top: 324 }, { left: 884, top: 324 }]
const tiles = await Promise.all(structure.map(async (project, index) => ({
  input: await sharp(resolve(publicRoot, project.media.src.slice(1))).resize(284, 274, { fit: 'cover' }).toBuffer(),
  ...tilePositions[index],
})))
await sharp(canvas(lines(['Selected work'], 72, 302, 52) + lines(['Web design, development', 'and motion'], 72, 374, 28)))
  .composite(tiles).jpeg({ quality: 88, mozjpeg: true }).toFile(resolve(outputRoot, 'projects.jpg'))

for (const [index, project] of structure.entries()) {
  const item = copy.projects.items[index]
  const src = details[project.id]?.headerMedia?.src ?? project.media.src
  const cover = await sharp(resolve(publicRoot, src.slice(1))).resize(620, 630, { fit: 'cover' }).toBuffer()
  const tags = project.id === 'keys-store' ? ['Digital storefront', 'UX/UI design']
    : project.id === 'baltika' ? ['Web design, 3D', 'and motion'] : ['Web design', 'and development']
  const title = project.id === 'baltika' ? 'Baltika Brew' : item.title
  await sharp(canvas(lines([title], 72, 302, 44) + lines(tags, 72, 366, 27)))
    .composite([{ input: cover, left: 580, top: 0 }])
    .jpeg({ quality: 88, mozjpeg: true }).toFile(resolve(outputRoot, `${project.id}.jpg`))
}

const logoSource = await readFile(resolve(publicRoot, 'brand/kado-logo.svg'))
const logoRaster = await sharp(logoSource).resize(420, 140).png().toBuffer()
await writeFile(resolve(publicRoot, 'brand/kado-logo.png'), await sharp({
  create: { width: 512, height: 512, channels: 4, background: '#ece7dd' },
}).composite([{ input: logoRaster, left: 46, top: 186 }]).png().toBuffer())
const mark = await readFile(resolve(publicRoot, 'brand/kado-logo-ru-o.svg'), 'utf8')
async function iconPng(size, color = '#171915', background = { r: 0, g: 0, b: 0, alpha: 0 }) {
  const inset = Math.round(size / 8)
  const source = Buffer.from(mark.replaceAll('fill="#343730"', `fill="${color}"`))
  const foreground = await sharp(source, { density: 600 }).resize(size - inset * 2, size - inset * 2).png().toBuffer()
  return sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: foreground, left: inset, top: inset }]).png().toBuffer()
}
const iconSizes = [16, 32, 48, 96]
// ICO entries can contain PNG payloads; retain a stable /favicon.ico URL.
function iconIco(iconBuffers) {
  const icoHeader = Buffer.alloc(6 + 16 * iconSizes.length)
  icoHeader.writeUInt16LE(1, 2)
  icoHeader.writeUInt16LE(iconSizes.length, 4)
  let offset = icoHeader.length
  iconBuffers.forEach((bytes, index) => {
    const entry = 6 + 16 * index
    icoHeader[entry] = iconSizes[index]
    icoHeader[entry + 1] = iconSizes[index]
    icoHeader.writeUInt16LE(1, entry + 4)
    icoHeader.writeUInt16LE(32, entry + 6)
    icoHeader.writeUInt32LE(bytes.length, entry + 8)
    icoHeader.writeUInt32LE(offset, entry + 12)
    offset += bytes.length
  })
  return Buffer.concat([icoHeader, ...iconBuffers])
}
for (const [suffix, color] of [['', '#171915'], ['-dark', '#f5f1e8']]) {
  const iconBuffers = await Promise.all(iconSizes.map(size => iconPng(size, color)))
  await Promise.all([
    writeFile(resolve(publicRoot, `favicon${suffix}.ico`), iconIco(iconBuffers)),
    writeFile(resolve(publicRoot, `favicon${suffix}-96.png`), iconBuffers[3]),
  ])
}
await writeFile(resolve(publicRoot, 'apple-touch-icon.png'), await iconPng(180, '#343730', '#ece7dd'))
console.log('Generated six 1200×630 SEO cards, the studio logo and KADO favicons.')

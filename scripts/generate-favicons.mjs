import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import sharp from 'sharp'

const publicRoot = resolve(process.cwd(), 'public')
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

console.log('Generated transparent ink/milk KADO favicons.')

import assert from 'node:assert/strict'
import { readdir, readFile, writeFile, rename, mkdir } from 'node:fs/promises'
import { resolve, join, extname } from 'node:path'
import { gzipSync, brotliCompressSync, constants } from 'node:zlib'

// Operate on a COPY of a deployed release, never on current/shared-assets.
const root = resolve(process.argv[2])
const namespace = process.argv[3]
assert.match(namespace, /^vps-[a-z0-9-]+$/)
const cdn = 'https://nfb4tt2jyb.cdn.twcstorage.ru'
const staged = join(root, `_nuxt-${namespace}`)
await rename(join(root, '_nuxt'), staged)
await mkdir(join(root, '_nuxt'))
await rename(staged, join(root, '_nuxt', namespace))
let changed = 0
async function migrate(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) await migrate(path)
    else if (entry.isFile() && ['.html', '.js', '.css', '.json', '.svg', '.xml', '.txt'].includes(extname(path))) {
      const original = await readFile(path, 'utf8')
      const updated = original
        .replace(/<link\b[^>]*rel="preconnect"[^>]*href="https:\/\/nfb4tt2jyb\.cdn\.twcstorage\.ru"[^>]*>/g, '')
        .replaceAll(cdn, '').replaceAll('/_nuxt/', `/_nuxt/${namespace}/`)
      assert.doesNotMatch(updated, /twcstorage\.ru/)
      if (updated === original) continue
      await writeFile(path, updated)
      // Replace compressed siblings too: nginx prefers these over the source.
      await writeFile(`${path}.gz`, gzipSync(updated, { level: 9 }))
      await writeFile(`${path}.br`, brotliCompressSync(updated, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }))
      changed++
    }
  }
}
await migrate(root)
console.log(`Migrated ${changed} files; Nuxt namespace: ${namespace}`)

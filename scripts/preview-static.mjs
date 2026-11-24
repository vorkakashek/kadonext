import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { resolve, relative, extname, isAbsolute } from 'node:path'

// Preview the same origin-only production files served by nginx.
const root = resolve('.output/public')
const port = Number(process.env.PORT || 4177)
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.mp3': 'audio/mpeg' }
createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname)
    let file = resolve(root, `.${pathname}`)
    const within = relative(root, file)
    if (within.startsWith('..') || isAbsolute(within)) { response.writeHead(403).end(); return }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html')
    const data = await readFile(file)
    const extension = extname(file)
    response.writeHead(200, { 'Content-Type': types[extension] || 'application/octet-stream', 'Cache-Control': 'no-store' })
    response.end(data)
  } catch { response.writeHead(404).end('Not found') }
}).listen(port, '127.0.0.1', () => console.log(`Static KADO preview: http://127.0.0.1:${port}/ru/projects/sidequest/`))

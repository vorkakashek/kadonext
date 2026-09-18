import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import { createContactHandler, MAX_BODY_BYTES } from './handler.mjs'

const handle = createContactHandler()
const port = Number(process.env.CONTACT_API_PORT || 3001)
const server = createServer(async (incoming, outgoing) => {
  if (incoming.url?.split('?')[0] !== '/api/contact') {
    outgoing.writeHead(404).end()
    return
  }
  if (Number(incoming.headers['content-length']) > MAX_BODY_BYTES) {
    outgoing.writeHead(413, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Заявка слишком большая.' }))
    return
  }
  try {
    const request = new Request('http://localhost/api/contact', {
      method: incoming.method,
      headers: incoming.headers,
      ...(['GET', 'HEAD'].includes(incoming.method) ? {} : { body: Readable.toWeb(incoming), duplex: 'half' }),
    })
    // Trust forwarded IPs only behind a controlled reverse proxy which overwrites them.
    const forwarded = process.env.CONTACT_TRUST_PROXY === 'true' ? incoming.headers['x-forwarded-for']?.split(',')[0]?.trim() : null
    const response = await handle(request, forwarded || incoming.socket.remoteAddress || 'unknown')
    outgoing.writeHead(response.status, Object.fromEntries(response.headers))
    outgoing.end(Buffer.from(await response.arrayBuffer()))
  } catch {
    outgoing.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ message: 'Не удалось прочитать заявку.' }))
  }
})
server.requestTimeout = 120000
server.headersTimeout = 15000
server.listen(port, process.env.CONTACT_API_HOST || '127.0.0.1', () => console.log(`KADO contact API listening on port ${port}`))

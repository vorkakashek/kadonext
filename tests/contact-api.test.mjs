import assert from 'node:assert/strict'
import { test } from 'node:test'
import { promisify } from 'node:util'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createContactHandler, normaliseAudio, MAX_BODY_BYTES } from '../contact-api/handler.mjs'
import { contactDevMockMode, createContactDevMockOptions } from '../contact-api/dev-mock.mjs'
import { CONTACT_CONSENT_VERSION, CONTACT_CONSENT_CHECKBOX, contactConsentSnapshot } from '../contact-api/consent.mjs'

const run = promisify(execFile)
const env = { NODE_ENV: 'production', CONTACT_ALLOWED_ORIGINS: 'https://kadonext.com', CONTACT_MAIL_FROM: 'KADO <hello@kadonext.com>' }
function form(overrides = {}) {
  const data = new FormData()
  for (const [key, value] of Object.entries({ projectType: 'сайт под ключ', description: 'Новый проект', contact: '@client', consent: 'true', consentVersion: CONTACT_CONSENT_VERSION, ...overrides })) data.set(key, value)
  return data
}
function request(data = form(), options = {}) {
  return new Request('http://localhost/api/contact', { method: 'POST', headers: { origin: 'https://kadonext.com', ...options }, body: data })
}
async function submit(handle, data = form(), clientIp = 'test-client', options = {}) {
  const challenge = await handle(new Request('http://localhost/api/contact', { method: 'GET', headers: { origin: 'https://kadonext.com' } }), clientIp)
  assert.equal(challenge.status, 200)
  const { token } = await challenge.json()
  return handle(request(data, { 'x-contact-token': token, ...options }), clientIp)
}
const accepted = async () => ({ accepted: ['hello@kadonext.com'], rejected: [] })

test('development contact mocks preview success and error but are disabled in production', async () => {
  const successEnv = { ...env, NODE_ENV: 'development', CONTACT_DEV_MOCK: 'success', CONTACT_DEV_MOCK_DELAY_MS: '0' }
  assert.equal(contactDevMockMode(successEnv), 'success')
  const success = createContactHandler({ env: successEnv, skipDecoyDelay: true, ...createContactDevMockOptions(successEnv) })
  assert.equal((await submit(success)).status, 200)

  const errorEnv = { ...successEnv, CONTACT_DEV_MOCK: 'error' }
  const failure = createContactHandler({ env: errorEnv, skipDecoyDelay: true, ...createContactDevMockOptions(errorEnv) })
  assert.equal((await submit(failure)).status, 502)

  assert.equal(contactDevMockMode({ ...successEnv, NODE_ENV: 'production' }), null)
  assert.equal(createContactDevMockOptions({ ...successEnv, NODE_ENV: 'production' }), null)
})

test('missing delivery configuration and SMTP rejection never produce a success response', async () => {
  const unavailable = createContactHandler({ env, skipDecoyDelay: true })
  assert.equal((await submit(unavailable)).status, 503)
  const rejected = createContactHandler({ env, skipDecoyDelay: true, send: async () => ({ accepted: [], rejected: ['hello@kadonext.com'] }) })
  assert.equal((await submit(rejected)).status, 502)
})

test('validated text is sent only to the configured recipient; subject cannot inject headers', async () => {
  let message
  const handle = createContactHandler({ env, skipDecoyDelay: true, send: async value => { message = value; return accepted() } })
  const response = await submit(handle, form({ projectType: 'Сайт\r\nBcc: attacker@example.org', description: 'Идея <script>alert(1)</script>' }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).ok, true)
  assert.equal(message.to, 'hello@kadonext.com')
  assert.doesNotMatch(message.subject, /[\r\n]/)
  const number = message.subject.match(/^Новый проект (\d{8}) — /)?.[1]
  assert.ok(number)
  assert.match(message.text, new RegExp(`^Номер заявки: ${number}\\n\\nКак связаться:`, 'm'))
  assert.match(message.text, /@client/)
  assert.doesNotMatch(message.text, /Согласие на обработку персональных данных/)
  assert.match(message.html, new RegExp(`font-size:30px[^>]*>${number}</div>`))
  assert.match(message.html, /font-size:22px[^>]*>@client<\/div>/)
  assert.doesNotMatch(message.html, /Согласие на обработку персональных данных/)
  assert.match(message.html, /Сайт<br>Bcc: attacker@example.org/)
  assert.match(message.html, /Идея &lt;script&gt;alert\(1\)&lt;\/script&gt;/)
  assert.doesNotMatch(message.html, /<script>/)
  const consent = message.attachments.find(item => item.filename === `consent-${number}.txt`)
  assert.ok(consent)
  assert.ok(consent.content.includes(`Версия согласия: ${CONTACT_CONSENT_VERSION}`))
  assert.ok(consent.content.includes(CONTACT_CONSENT_CHECKBOX))
  assert.ok(consent.content.includes(contactConsentSnapshot()))
  assert.match(message.headers['X-Kado-Submission-ID'], /^[\da-f-]{36}$/)
})

test('invalid fields and oversized bodies are rejected before delivery; honeypot gets a decoy success', async () => {
  let sends = 0
  const handle = createContactHandler({ env, skipDecoyDelay: true, send: async () => { sends++; return accepted() } })
  for (const overrides of [{ consent: 'false' }, { consentVersion: '' }, { consentVersion: 'outdated' }, { description: ' ' }, { materials: 'javascript:alert(1)' }, { stage: 'invalid' }, { contact: ' ' }]) {
    assert.equal((await submit(handle, form(overrides), JSON.stringify(overrides))).status, 400)
  }
  assert.equal((await submit(handle, form({ website: 'bot' }), 'honeypot')).status, 200)
  const duplicate = form()
  duplicate.append('contact', '@other')
  assert.equal((await submit(handle, duplicate, 'duplicate')).status, 400)
  assert.equal((await submit(handle, form(), 'big', { 'content-length': String(MAX_BODY_BYTES + 1) })).status, 413)
  assert.equal(sends, 0)
})

test('unknown origins are rejected; configured CORS and preflight are explicit', async () => {
  const handle = createContactHandler({ env, skipDecoyDelay: true, send: accepted })
  assert.equal((await handle(request(form(), { origin: 'https://other.example' }))).status, 403)
  const preflight = await handle(new Request('http://localhost/api/contact', { method: 'OPTIONS', headers: { origin: 'https://kadonext.com' } }))
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://kadonext.com')
})

test('no more than two recordings; valid audio-only briefing preserves attachment order', async () => {
  let message
  const handle = createContactHandler({ env, skipDecoyDelay: true, send: async value => { message = value; return accepted() }, normalise: async files => files.map((file, index) => ({ filename: `message-${index + 1}.mp3`, content: Buffer.from(file.name), contentType: 'audio/mpeg', seconds: 1 })) })
  const data = form({ description: '' })
  for (const name of ['second.webm', 'first.webm']) data.append('audio', new Blob(['test'], { type: 'audio/webm' }), name)
  assert.equal((await submit(handle, data)).status, 200)
  assert.deepEqual(message.attachments.slice(0, 2).map(item => item.content.toString()), ['second.webm', 'first.webm'])
  assert.match(message.attachments[2].filename, /^consent-\d{8}\.txt$/)
  data.append('audio', new Blob(['test'], { type: 'audio/webm' }), 'extra.webm')
  assert.equal((await submit(handle, data, 'too-many')).status, 400)
})

test('per-client limit silently discards excess submissions', async () => {
  let sends = 0
  const handle = createContactHandler({ env, skipDecoyDelay: true, send: async () => { sends++; return accepted() } })
  for (let i = 0; i < 12; i++) {
    assert.equal((await submit(handle, form({ description: `Проект ${i}` }), 'one-client')).status, 200)
  }
  assert.equal(sends, 10)
  assert.equal((await submit(handle, form({ description: 'Другой клиент' }), 'other-client')).status, 200)
  assert.equal(sends, 11)
})

test('missing, replayed and spammy submissions get indistinguishable success without delivery', async () => {
  let sends = 0
  const handle = createContactHandler({ env, skipDecoyDelay: true, send: async () => { sends++; return accepted() } })
  assert.deepEqual(await (await handle(request())).json(), { ok: true })

  const challenge = await handle(new Request('http://localhost/api/contact', { method: 'GET', headers: { origin: 'https://kadonext.com' } }))
  const { token } = await challenge.json()
  const first = request(form({ description: 'https://one.test https://two.test https://three.test https://four.test' }), { 'x-contact-token': token })
  assert.deepEqual(await (await handle(first, 'spammer')).json(), { ok: true })
  const replay = request(form({ description: 'Нормальный проект' }), { 'x-contact-token': token })
  assert.deepEqual(await (await handle(replay, 'spammer')).json(), { ok: true })
  assert.equal(sends, 0)
})

test('an already delivered duplicate is acknowledged but not sent twice', async () => {
  let sends = 0
  const handle = createContactHandler({ env, skipDecoyDelay: true, send: async () => { sends++; return accepted() } })
  assert.equal((await submit(handle, form(), 'duplicate-client')).status, 200)
  assert.equal((await submit(handle, form(), 'duplicate-client')).status, 200)
  assert.equal(sends, 1)
})

test('real browser containers convert to playable MP3; duration is measured from audio, not submitted metadata', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kado-contact-test-'))
  try {
    const files = []
    for (const [extension, codec, mime] of [['webm', 'libopus', 'audio/webm'], ['m4a', 'aac', 'audio/mp4'], ['ogg', 'libopus', 'audio/ogg']]) {
      const path = join(directory, `fixture.${extension}`)
      await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=0.6', '-c:a', codec, '-y', path], { windowsHide: true })
      files.push(new File([await readFile(path)], `fixture.${extension}`, { type: mime }))
    }
    const result = await normaliseAudio(files)
    assert.equal(result.length, 3)
    assert.ok(result.every(file => file.contentType === 'audio/mpeg' && file.seconds >= 0.6 && file.seconds < 1))
    assert.deepEqual(result.map(file => file.filename), ['message-01.mp3', 'message-02.mp3', 'message-03.mp3'])
    const longPath = join(directory, 'long.webm')
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '91', '-c:a', 'libopus', '-y', longPath], { windowsHide: true })
    const longFile = new File([await readFile(longPath)], 'long.webm', { type: 'audio/webm' })
    await assert.rejects(normaliseAudio([longFile]), /1:30/)
    const boundaryPath = join(directory, 'boundary.webm')
    await run('ffmpeg', ['-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono', '-t', '90', '-c:a', 'libopus', '-y', boundaryPath], { windowsHide: true })
    const boundaryFile = new File([await readFile(boundaryPath)], 'boundary.webm', { type: 'audio/webm' })
    const boundaryResult = await normaliseAudio([boundaryFile])
    assert.equal(boundaryResult.length, 1)
    assert.ok(boundaryResult[0].seconds >= 90 && boundaryResult[0].seconds <= 90.15)
    await assert.rejects(normaliseAudio([boundaryFile, files[0]]), /1:30/)
    await assert.rejects(normaliseAudio([new File(['fake'], 'fake.webm', { type: 'audio/webm' })]), /повреждено/)
  } finally { await rm(directory, { recursive: true, force: true }) }
})

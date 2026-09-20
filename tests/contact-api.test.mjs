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
const accepted = async () => ({ accepted: ['hello@kadonext.com'], rejected: [] })

test('development contact mocks preview success and error but are disabled in production', async () => {
  const successEnv = { ...env, NODE_ENV: 'development', CONTACT_DEV_MOCK: 'success', CONTACT_DEV_MOCK_DELAY_MS: '0' }
  assert.equal(contactDevMockMode(successEnv), 'success')
  const success = createContactHandler({ env: successEnv, ...createContactDevMockOptions(successEnv) })
  assert.equal((await success(request())).status, 200)

  const errorEnv = { ...successEnv, CONTACT_DEV_MOCK: 'error' }
  const failure = createContactHandler({ env: errorEnv, ...createContactDevMockOptions(errorEnv) })
  assert.equal((await failure(request())).status, 502)

  assert.equal(contactDevMockMode({ ...successEnv, NODE_ENV: 'production' }), null)
  assert.equal(createContactDevMockOptions({ ...successEnv, NODE_ENV: 'production' }), null)
})

test('missing delivery configuration and SMTP rejection never produce a success response', async () => {
  const unavailable = createContactHandler({ env })
  assert.equal((await unavailable(request())).status, 503)
  const telegramUnavailable = createContactHandler({ env: { ...env, CONTACT_DELIVERY: 'telegram' } })
  assert.equal((await telegramUnavailable(request())).status, 503)
  const rejected = createContactHandler({ env, send: async () => ({ accepted: [], rejected: ['hello@kadonext.com'] }) })
  assert.equal((await rejected(request())).status, 502)
})

test('validated text is sent only to the configured recipient; subject cannot inject headers', async () => {
  let message
  const handle = createContactHandler({ env, send: async value => { message = value; return accepted() } })
  const response = await handle(request(form({ projectType: 'Сайт\r\nBcc: attacker@example.org' })))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).ok, true)
  assert.equal(message.to, 'hello@kadonext.com')
  assert.doesNotMatch(message.subject, /[\r\n]/)
  assert.match(message.text, /@client/)
  assert.ok(message.text.includes(`Версия согласия: ${CONTACT_CONSENT_VERSION}`))
  assert.ok(message.text.includes(CONTACT_CONSENT_CHECKBOX))
  assert.ok(message.text.includes(contactConsentSnapshot()))
})

test('consent, empty briefing, duplicate fields, honeypot and oversized bodies are rejected before delivery', async () => {
  let sends = 0
  const handle = createContactHandler({ env, send: async () => { sends++; return accepted() } })
  for (const overrides of [{ consent: 'false' }, { consentVersion: '' }, { consentVersion: 'outdated' }, { description: ' ' }, { website: 'bot' }, { materials: 'javascript:alert(1)' }, { stage: 'invalid' }, { contact: ' ' }]) {
    assert.equal((await handle(request(form(overrides)), JSON.stringify(overrides))).status, 400)
  }
  const duplicate = form()
  duplicate.append('contact', '@other')
  assert.equal((await handle(request(duplicate), 'duplicate')).status, 400)
  assert.equal((await handle(request(form(), { 'content-length': String(MAX_BODY_BYTES + 1) }), 'big')).status, 413)
  assert.equal(sends, 0)
})

test('unknown origins are rejected; configured CORS and preflight are explicit', async () => {
  const handle = createContactHandler({ env, send: accepted })
  assert.equal((await handle(request(form(), { origin: 'https://other.example' }))).status, 403)
  const preflight = await handle(new Request('http://localhost/api/contact', { method: 'OPTIONS', headers: { origin: 'https://kadonext.com' } }))
  assert.equal(preflight.status, 204)
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://kadonext.com')
})

test('no more than two recordings; valid audio-only briefing preserves attachment order', async () => {
  let message
  const handle = createContactHandler({ env, send: async value => { message = value; return accepted() }, normalise: async files => files.map((file, index) => ({ filename: `message-${index + 1}.mp3`, content: Buffer.from(file.name), contentType: 'audio/mpeg', seconds: 1 })) })
  const data = form({ description: '' })
  for (const name of ['second.webm', 'first.webm']) data.append('audio', new Blob(['test'], { type: 'audio/webm' }), name)
  assert.equal((await handle(request(data))).status, 200)
  assert.deepEqual(message.attachments.map(item => item.content.toString()), ['second.webm', 'first.webm'])
  data.append('audio', new Blob(['test'], { type: 'audio/webm' }), 'extra.webm')
  assert.equal((await handle(request(data), 'too-many')).status, 400)
})

test('per-client limit prevents unbounded mail submissions', async () => {
  const handle = createContactHandler({ env, send: accepted })
  for (let i = 0; i < 10; i++) assert.equal((await handle(request(), 'one-client')).status, 200)
  assert.equal((await handle(request(), 'one-client')).status, 429)
  assert.equal((await handle(request(), 'other-client')).status, 200)
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

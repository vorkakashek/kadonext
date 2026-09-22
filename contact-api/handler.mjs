import nodemailer from 'nodemailer'
import { execFile } from 'node:child_process'
import { randomInt, randomUUID } from 'node:crypto'
import { promisify } from 'node:util'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CONTACT_CONSENT_VERSION, CONTACT_CONSENT_CHECKBOX, contactConsentSnapshot } from './consent.mjs'
import { createContactAntiSpam } from './anti-spam.mjs'

const run = promisify(execFile)
export const MAX_BODY_BYTES = 13 * 1024 * 1024
const MAX_AUDIO_BYTES = 12 * 1024 * 1024
const MAX_SECONDS = 90
const MAX_COUNT = 2
const fieldLimits = { projectType: 500, description: 10000, contact: 500, stage: 100, deadline: 100, budget: 200, materials: 2000, consent: 5, consentVersion: 40, website: 500 }
const stages = ['', 'есть только идея', 'есть материалы', 'есть дизайн', 'нужен редизайн']
const deadlines = ['', 'как можно скорее', '1–2 месяца', '3+ месяца', 'гибкий']

class ContactError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

async function boundedBody(request) {
  const length = Number(request.headers.get('content-length'))
  if (length > MAX_BODY_BYTES) throw new ContactError(413, 'Заявка слишком большая. Удалите одну из записей и повторите отправку.')
  const reader = request.body?.getReader()
  if (!reader) throw new ContactError(400, 'Пустая заявка.')
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new ContactError(413, 'Заявка слишком большая. Удалите одну из записей и повторите отправку.')
      }
      chunks.push(value)
    }
  } finally { reader.releaseLock() }
  return Buffer.concat(chunks, bytes)
}

function validateForm(form) {
  for (const [key] of form) {
    if (!Object.hasOwn(fieldLimits, key) && key !== 'audio') throw new ContactError(400, 'Неизвестное поле заявки.')
  }
  const fields = {}
  for (const [key, limit] of Object.entries(fieldLimits)) {
    const values = form.getAll(key)
    if (values.length > 1 || (values[0] !== undefined && typeof values[0] !== 'string')) throw new ContactError(400, 'Некорректные поля заявки.')
    const value = values[0] ?? ''
    if (value.length > limit || /\x00/.test(value)) throw new ContactError(400, 'Одно из полей слишком длинное или содержит недопустимые символы.')
    fields[key] = value.trim()
  }
  if (!fields.projectType || !fields.contact || fields.consent !== 'true') throw new ContactError(400, 'Укажите задачу, контакт и согласие на обработку данных.')
  if (fields.consentVersion !== CONTACT_CONSENT_VERSION) throw new ContactError(400, 'Текст согласия обновился. Сохраните текст и скачайте записи, затем обновите страницу и подтвердите согласие ещё раз.')
  if (!stages.includes(fields.stage) || !deadlines.includes(fields.deadline)) throw new ContactError(400, 'Проверьте стадию и сроки проекта.')
  if (fields.materials) {
    try {
      const url = new URL(fields.materials)
      if (!['https:', 'http:'].includes(url.protocol)) throw new Error()
    } catch { throw new ContactError(400, 'Укажите корректную ссылку на материалы.') }
  }
  const audio = form.getAll('audio')
  if (audio.length > MAX_COUNT) throw new ContactError(400, 'Можно отправить не более двух голосовых сообщений.')
  if (!fields.description && !audio.length) throw new ContactError(400, 'Расскажите о проекте текстом или голосом.')
  let bytes = 0
  for (const file of audio) {
    if (typeof file === 'string' || !file.size || !['audio/webm', 'audio/mp4', 'audio/ogg'].includes(file.type.split(';')[0].trim())) throw new ContactError(400, 'Некорректный формат голосового сообщения. Запишите его ещё раз.')
    bytes += file.size
  }
  if (bytes > MAX_AUDIO_BYTES) throw new ContactError(413, 'Голосовые сообщения слишком большие. Удалите одну из записей.')
  return { fields, audio }
}

/** Decode locally, then measure the resulting audio: browser duration metadata is untrusted.
 * MP3 attachments work in mail clients even when the browser recorded WebM/Opus.
 */
export async function normaliseAudio(files, env = process.env) {
  if (!files.length) return []
  const directory = await mkdtemp(join(tmpdir(), 'kado-contact-'))
  const attachments = []
  let total = 0
  try {
    for (const [index, file] of files.entries()) {
      const input = join(directory, `input-${index}`)
      const output = join(directory, `message-${index + 1}.mp3`)
      const buffer = Buffer.from(await file.arrayBuffer())
      // Only the three browser recording containers are accepted, never playlists.
      const webm = buffer.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))
      const ogg = buffer.subarray(0, 4).toString('ascii') === 'OggS'
      const mp4 = buffer.subarray(4, 8).toString('ascii') === 'ftyp'
      if (!webm && !ogg && !mp4) throw new ContactError(400, 'Голосовое сообщение повреждено. Запишите его ещё раз.')
      await writeFile(input, buffer, { mode: 0o600 })
      try {
        const { stdout } = await run(env.CONTACT_FFPROBE_PATH || 'ffprobe', [
          '-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_streams', '-of', 'json', input,
        ], { timeout: 15000, maxBuffer: 1024 * 1024, windowsHide: true })
        const streams = JSON.parse(stdout).streams
        if (!Array.isArray(streams) || streams.length !== 1 || streams[0].codec_type !== 'audio' || !['opus', 'aac', 'vorbis'].includes(streams[0].codec_name)) throw new ContactError(400, 'Ожидается голосовая запись без видео.')
        await run(env.CONTACT_FFMPEG_PATH || 'ffmpeg', [
          '-nostdin', '-v', 'error', '-protocol_whitelist', 'file,pipe', '-i', input,
          '-map', '0:a:0', '-vn', '-map_metadata', '-1', '-ac', '1', '-ar', '24000',
          '-threads', '1', '-c:a', 'libmp3lame', '-b:a', '64k', '-t', String(MAX_SECONDS + 1), '-y', output,
        ], { timeout: 30000, maxBuffer: 1024 * 1024, windowsHide: true })
        const result = await run(env.CONTACT_FFPROBE_PATH || 'ffprobe', [
          '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', output,
        ], { timeout: 10000, maxBuffer: 1024 * 1024, windowsHide: true })
        const seconds = Number(JSON.parse(result.stdout).format?.duration)
        if (!Number.isFinite(seconds) || seconds <= 0) throw new ContactError(400, 'Не удалось прочитать голосовое сообщение.')
        total += seconds
        // MP3 encoder padding is at most a few frames per clip.
        if (total > MAX_SECONDS + files.length * 0.15) throw new ContactError(400, 'Общая длительность сообщений превышает 1:30. Сократите одну из записей.')
        attachments.push({ filename: `message-${String(index + 1).padStart(2, '0')}.mp3`, content: await readFile(output), contentType: 'audio/mpeg', seconds })
      } catch (cause) {
        if (cause instanceof ContactError) throw cause
        if (cause.code === 'ENOENT') throw new ContactError(503, 'Отправка голосовых пока не настроена. Записи остались на странице; можно скачать их и отправить на hello@kadonext.com.')
        throw new ContactError(400, 'Не удалось обработать голосовое сообщение. Попробуйте перезаписать его.')
      }
    }
    return attachments
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

function emailText(fields, attachments, number) {
  const lines = [
    `Номер заявки: ${number}`, '',
    'Как связаться:', fields.contact, '',
    'Что нужно сделать:', fields.projectType,
    fields.description || '(голосовые сообщения во вложениях)',
  ]
  if (fields.stage) lines.push('', `Стадия: ${fields.stage}`)
  if (fields.deadline) lines.push(`Срок: ${fields.deadline}`)
  if (fields.budget) lines.push(`Бюджет: ${fields.budget}`)
  if (fields.materials) lines.push(`Материалы: ${fields.materials}`)
  if (attachments.length) {
    lines.push('', 'Голосовые сообщения (в выбранном автором порядке):')
    attachments.forEach((file, index) => lines.push(`${index + 1}. ${file.filename} — ${Math.round(file.seconds)} сек.`))
  }
  return lines.join('\n')
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
}

function htmlValue(value) {
  return escapeHtml(value).replace(/\r\n?|\n/g, '<br>')
}

function emailHtml(fields, attachments, number) {
  const details = [
    ['Стадия', fields.stage], ['Срок', fields.deadline],
    ['Бюджет', fields.budget], ['Материалы', fields.materials],
  ].filter(([, value]) => value)
  const detailHtml = details.map(([label, value]) => `<div style="margin-top:6px"><span style="color:#777">${label}:</span> ${htmlValue(value)}</div>`).join('')
  const audioHtml = attachments.length
    ? `<div style="margin-top:18px;color:#555">Голосовые сообщения (в выбранном автором порядке):<br>${attachments.map((file, index) => `${index + 1}. ${escapeHtml(file.filename)} — ${Math.round(file.seconds)} сек.`).join('<br>')}</div>`
    : ''
  return `<!doctype html><html lang="ru"><body style="margin:0;padding:28px 20px;background:#f5f4f1;color:#242420;font-family:Arial,Helvetica,sans-serif"><div style="max-width:620px;margin:0 auto;padding:32px;background:#fff">
    <div style="margin-bottom:30px"><div style="font-size:13px;color:#777">Номер заявки</div><div style="margin-top:6px;font-size:30px;line-height:1.2;font-weight:700">${number}</div></div>
    <div style="margin-bottom:30px"><div style="font-size:13px;color:#777">Как связаться</div><div style="margin-top:6px;font-size:22px;line-height:1.35;font-weight:700;overflow-wrap:anywhere">${htmlValue(fields.contact)}</div></div>
    <div><div style="font-size:13px;color:#777">Что нужно сделать</div><div style="margin-top:6px;font-size:22px;line-height:1.35;font-weight:700;overflow-wrap:anywhere">${htmlValue(fields.projectType)}</div><div style="margin-top:14px;font-size:16px;line-height:1.5;white-space:normal;overflow-wrap:anywhere">${htmlValue(fields.description || '(голосовые сообщения во вложениях)')}</div><div style="margin-top:14px;font-size:14px;line-height:1.5;overflow-wrap:anywhere">${detailHtml}${audioHtml}</div></div>
  </div></body></html>`
}

function consentEvidence(fields) {
  return [
    'Согласие на обработку персональных данных: предоставлено.',
    `Дата отправки: ${new Date().toISOString()}`,
    `Версия согласия: ${fields.consentVersion}`,
    'Документ: https://kadonext.com/consent',
    `Текст галочки: ${CONTACT_CONSENT_CHECKBOX}`,
    '', 'Текст согласия на момент отправки:', contactConsentSnapshot(),
  ].join('\n')
}

function smtpSender(env) {
  let password = env.CONTACT_SMTP_PASS || ''
  if (env.CONTACT_SMTP_PASS_BASE64) {
    try { password = Buffer.from(env.CONTACT_SMTP_PASS_BASE64, 'base64').toString('utf8') }
    catch { return null }
  }
  if (!env.CONTACT_SMTP_HOST || !env.CONTACT_SMTP_USER || !password || !env.CONTACT_MAIL_FROM) return null
  const port = Number(env.CONTACT_SMTP_PORT || 465)
  const transport = nodemailer.createTransport({
    host: env.CONTACT_SMTP_HOST, port, secure: port === 465,
    requireTLS: port !== 465,
    auth: { user: env.CONTACT_SMTP_USER, pass: password },
    connectionTimeout: 15000, greetingTimeout: 10000, socketTimeout: 30000,
    tls: { minVersion: 'TLSv1.2', servername: env.CONTACT_SMTP_HOST },
    disableFileAccess: true, disableUrlAccess: true,
  })
  return message => transport.sendMail(message)
}

function smtpDelivery(env, send = smtpSender(env)) {
  if (!send) return null
  return async ({ fields, attachments }) => {
    const submissionId = randomUUID()
    const number = randomInt(10000000, 100000000)
    const result = await send({
      from: env.CONTACT_MAIL_FROM || 'KADO <hello@kadonext.com>',
      to: env.CONTACT_MAIL_TO || 'hello@kadonext.com',
      subject: `Новый проект ${number} — ${fields.projectType.replace(/[\r\n]/g, ' ').slice(0, 140)}`,
      text: emailText(fields, attachments, number),
      html: emailHtml(fields, attachments, number),
      headers: { 'X-Kado-Submission-ID': submissionId },
      attachments: [
        ...attachments.map(({ seconds, ...attachment }) => attachment),
        { filename: `consent-${number}.txt`, content: consentEvidence(fields), contentType: 'text/plain; charset=utf-8' },
      ],
    })
    if (!result?.accepted?.length || result.rejected?.length) throw new Error('SMTP did not accept the recipient')
  }
}

function configuredDelivery(env) {
  return smtpDelivery(env)
}

function browserOrigin(request) {
  const origin = request.headers.get('origin') || ''
  if (origin) return origin
  const referer = request.headers.get('referer') || ''
  if (!referer) return ''
  try { return new URL(referer).origin }
  catch { return '' }
}

export function createContactHandler(options = {}) {
  const env = options.env ?? process.env
  const deliver = options.deliver ?? (options.send ? smtpDelivery(env, options.send) : configuredDelivery(env))
  const normalise = options.normalise ?? (files => normaliseAudio(files, env))
  const antiSpam = options.antiSpam ?? createContactAntiSpam({ env, skipDelay: options.skipDecoyDelay })
  const allowedOrigins = new Set((env.CONTACT_ALLOWED_ORIGINS || 'https://kadonext.com,https://www.kadonext.com').split(',').map(value => value.trim()).filter(Boolean))
  let inFlight = 0

  return async function handle(request, clientIp = 'unknown') {
    const origin = browserOrigin(request)
    const developmentOrigin = env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)
    // Same-origin GET requests do not consistently include Origin. The token is
    // not a credential and CORS still prevents another website from reading it.
    const allowed = allowedOrigins.has(origin) || developmentOrigin || (request.method === 'GET' && !origin)
    const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'vary': 'Origin' }
    if (allowed && origin) headers['access-control-allow-origin'] = origin
    const response = (status, data) => new Response(JSON.stringify(data), { status, headers })
    if (!allowed) return response(403, { message: 'Отправка с этого адреса сайта не разрешена.' })
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { ...headers, 'access-control-allow-methods': 'GET, POST, OPTIONS', 'access-control-allow-headers': 'Content-Type, X-Contact-Token', 'access-control-max-age': '600' } })
    if (request.method === 'GET') return response(200, antiSpam.issueToken())
    if (request.method !== 'POST') return response(405, { message: 'Метод не поддерживается.' })
    const decoy = async () => {
      await antiSpam.decoyDelay()
      return response(200, { ok: true })
    }
    const token = antiSpam.acceptToken(request.headers.get('x-contact-token') || '')
    if (!token.accepted) return decoy()
    const rate = antiSpam.acceptRate(clientIp, request.headers.get('user-agent') || '')
    if (!rate.accepted) return decoy()
    if (inFlight >= 2) return response(503, { message: 'Сейчас обрабатываем другие заявки. Повторите отправку через минуту; записи сохранены.' })
    inFlight++
    try {
      const contentType = request.headers.get('content-type') || ''
      if (!contentType.startsWith('multipart/form-data;')) throw new ContactError(415, 'Ожидается форма с вложениями.')
      const body = await boundedBody(request)
      let form
      try { form = await new Request('http://localhost/contact', { method: 'POST', headers: { 'content-type': contentType }, body }).formData() }
      catch { throw new ContactError(400, 'Не удалось прочитать заявку.') }
      const honeypot = form.getAll('website')
      if (honeypot.some(value => typeof value === 'string' && value.trim())) return decoy()
      const { fields, audio } = validateForm(form)
      const inspection = antiSpam.inspectSubmission(fields, audio, rate.clientKey, token.ageMs)
      if (!inspection.accepted) return decoy()
      if (!deliver) return response(503, { message: 'Отправка формы пока не подключена. Текст и записи остались на странице. Напишите на hello@kadonext.com; записи можно скачать.' })
      const attachments = await normalise(audio)
      await deliver({ fields, attachments })
      antiSpam.rememberDelivered(inspection.fingerprint)
      return response(200, { ok: true })
    } catch (cause) {
      if (cause instanceof ContactError) return response(cause.status, { message: cause.message })
      // Log only an error code, never contact fields, recordings or delivery credentials.
      console.error('Contact delivery failed:', cause?.code || 'DELIVERY_ERROR')
      return response(502, { message: 'Сервис доставки не принял заявку. Текст и записи сохранены — повторите отправку позже или напишите на hello@kadonext.com.' })
    } finally { inFlight-- }
  }
}

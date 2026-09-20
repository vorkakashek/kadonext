import { randomUUID } from 'node:crypto'
import { CONTACT_CONSENT_CHECKBOX, contactConsentSnapshot } from './consent.mjs'

const TELEGRAM_TEXT_LIMIT = 3900

function deliveryError() {
  const cause = new Error('Telegram delivery failed')
  cause.code = 'TELEGRAM_DELIVERY_ERROR'
  return cause
}

export function splitTelegramText(text, limit = TELEGRAM_TEXT_LIMIT) {
  const chunks = []
  let rest = text.trim()
  while (rest.length > limit) {
    let boundary = rest.lastIndexOf('\n\n', limit)
    if (boundary < limit * 0.5) boundary = rest.lastIndexOf('\n', limit)
    if (boundary < limit * 0.5) boundary = rest.lastIndexOf(' ', limit)
    if (boundary < 1) boundary = limit
    chunks.push(rest.slice(0, boundary).trimEnd())
    rest = rest.slice(boundary).trimStart()
  }
  if (rest) chunks.push(rest)
  return chunks
}

function telegramText(fields, attachments, submissionId, submittedAt) {
  const lines = [
    `Новая заявка KADO · ${submissionId}`,
    '',
    'Что нужно сделать:', fields.projectType,
    '',
    'Как связаться:', fields.contact,
    '',
    'О проекте:', fields.description || '(описание в голосовых сообщениях)',
  ]
  if (fields.stage) lines.push('', `Стадия: ${fields.stage}`)
  if (fields.deadline) lines.push(`Срок: ${fields.deadline}`)
  if (fields.budget) lines.push(`Бюджет: ${fields.budget}`)
  if (fields.materials) lines.push(`Материалы: ${fields.materials}`)
  if (attachments.length) lines.push('', `Голосовые сообщения: ${attachments.length}`)
  lines.push('', `Отправлено: ${submittedAt}`, `Согласие: ${fields.consentVersion}`)
  return lines.join('\n')
}

function consentEvidence(fields, submissionId, submittedAt) {
  return [
    `Заявка KADO · ${submissionId}`,
    `Дата отправки: ${submittedAt}`,
    `Версия согласия: ${fields.consentVersion}`,
    `Текст галочки: ${CONTACT_CONSENT_CHECKBOX}`,
    '',
    contactConsentSnapshot(),
  ].join('\n')
}

export function createTelegramDelivery({ token, chatId, messageThreadId = '', fetchImpl = fetch, timeoutMs = 30000 }) {
  if (!token?.trim() || !chatId?.trim()) return null
  const baseUrl = `https://api.telegram.org/bot${token.trim()}`
  const threadId = messageThreadId.trim()
  const numericThreadId = /^\d+$/.test(threadId) ? Number(threadId) : null

  async function call(method, body) {
    let response
    try {
      response = await fetchImpl(`${baseUrl}/${method}`, {
        method: 'POST',
        body,
        ...(typeof body === 'string' ? { headers: { 'content-type': 'application/json' } } : {}),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch {
      throw deliveryError()
    }
    let result
    try { result = await response.json() }
    catch { throw deliveryError() }
    if (!response.ok || result?.ok !== true) throw deliveryError()
    return result.result
  }

  function baseForm() {
    const form = new FormData()
    form.set('chat_id', chatId.trim())
    if (numericThreadId !== null) form.set('message_thread_id', String(numericThreadId))
    return form
  }

  return async function deliverTelegram({ fields, attachments }) {
    const submissionId = randomUUID().slice(0, 8).toUpperCase()
    const submittedAt = new Date().toISOString()
    const chunks = splitTelegramText(telegramText(fields, attachments, submissionId, submittedAt))

    for (const text of chunks) {
      await call('sendMessage', JSON.stringify({
        chat_id: chatId.trim(),
        ...(numericThreadId !== null ? { message_thread_id: numericThreadId } : {}),
        text,
        link_preview_options: { is_disabled: true },
      }))
    }

    for (const [index, attachment] of attachments.entries()) {
      const form = baseForm()
      form.set('title', `Заявка ${submissionId} · сообщение ${index + 1}`)
      form.set('performer', 'KADO')
      form.set('caption', `Голосовое сообщение ${index + 1} из ${attachments.length} · заявка ${submissionId}`)
      form.set('duration', String(Math.max(1, Math.round(attachment.seconds))))
      form.set('audio', new Blob([attachment.content], { type: attachment.contentType }), attachment.filename)
      await call('sendAudio', form)
    }

    const evidence = baseForm()
    evidence.set('caption', `Согласие к заявке ${submissionId}`)
    evidence.set('document', new Blob([
      consentEvidence(fields, submissionId, submittedAt),
    ], { type: 'text/plain;charset=utf-8' }), `kado-consent-${submissionId}.txt`)
    await call('sendDocument', evidence)
  }
}

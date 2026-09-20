import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTelegramDelivery, splitTelegramText } from '../contact-api/telegram.mjs'

function success() {
  return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), {
    status: 200, headers: { 'content-type': 'application/json' },
  })
}

test('Telegram delivery sends readable text, ordered audio and consent evidence', async () => {
  const calls = []
  const deliver = createTelegramDelivery({
    token: '123:test-token', chatId: '-10042', messageThreadId: '7', timeoutMs: 1000,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return success() },
  })
  await deliver({
    fields: {
      projectType: 'сайт под ключ', description: 'Новый проект', contact: '@client',
      stage: 'есть только идея', deadline: '1–2 месяца', budget: '', materials: '',
      consentVersion: 'test-version',
    },
    attachments: [
      { filename: 'message-01.mp3', content: Buffer.from('first'), contentType: 'audio/mpeg', seconds: 3.2 },
      { filename: 'message-02.mp3', content: Buffer.from('second'), contentType: 'audio/mpeg', seconds: 4.8 },
    ],
  })

  assert.deepEqual(calls.map(call => new URL(call.url).pathname.split('/').at(-1)), [
    'sendMessage', 'sendAudio', 'sendAudio', 'sendDocument',
  ])
  const message = JSON.parse(calls[0].options.body)
  assert.equal(message.chat_id, '-10042')
  assert.equal(message.message_thread_id, 7)
  assert.equal(calls[0].options.headers['content-type'], 'application/json')
  assert.match(message.text, /Новая заявка KADO/)
  assert.match(message.text, /@client/)

  assert.equal(calls[1].options.body.get('audio').name, 'message-01.mp3')
  assert.equal(calls[2].options.body.get('audio').name, 'message-02.mp3')
  const evidence = calls[3].options.body.get('document')
  assert.match(evidence.name, /^kado-consent-[A-F0-9]{8}\.txt$/)
  assert.match(await evidence.text(), /Версия согласия: test-version/)
})

test('Telegram delivery splits long descriptions below the API text limit', async () => {
  const calls = []
  const deliver = createTelegramDelivery({
    token: '123:test-token', chatId: '42',
    fetchImpl: async (url, options) => { calls.push({ url, options }); return success() },
  })
  await deliver({
    fields: { projectType: 'лендинг', description: 'слово '.repeat(1800), contact: '@client', consentVersion: 'v1' },
    attachments: [],
  })
  const messages = calls.filter(call => call.url.endsWith('/sendMessage')).map(call => JSON.parse(call.options.body).text)
  assert.ok(messages.length >= 3)
  assert.ok(messages.every(message => message.length <= 3900))
  assert.equal(calls.at(-1).url.endsWith('/sendDocument'), true)
  assert.deepEqual(splitTelegramText('a'.repeat(8000)).map(chunk => chunk.length), [3900, 3900, 200])
})

test('Telegram delivery hides API errors and rejects incomplete configuration', async () => {
  assert.equal(createTelegramDelivery({ token: '', chatId: '42' }), null)
  assert.equal(createTelegramDelivery({ token: 'token', chatId: '' }), null)
  const deliver = createTelegramDelivery({
    token: 'secret-token', chatId: '42',
    fetchImpl: async () => new Response(JSON.stringify({ ok: false, description: 'secret-token leaked' }), { status: 401 }),
  })
  await assert.rejects(
    deliver({ fields: { projectType: 'сайт', description: 'текст', contact: '@client', consentVersion: 'v1' }, attachments: [] }),
    error => error.code === 'TELEGRAM_DELIVERY_ERROR' && !error.message.includes('secret-token'),
  )
})

import { CONTACT_CONSENT_VERSION } from '../contact-api/consent.mjs'

const endpoint = 'https://kadonext.com/api/contact'
const origin = 'https://kadonext.com'

const challengeResponse = await fetch(endpoint, { headers: { origin } })
if (!challengeResponse.ok) throw new Error(`Contact challenge failed with HTTP ${challengeResponse.status}`)
const challenge = await challengeResponse.json()
if (!challenge.token) throw new Error('Contact challenge did not return a token')

const form = new FormData()
for (const [name, value] of Object.entries({
  projectType: '[ТЕСТ] Проверка SMTP формы KADO',
  description: 'Автоматическая техническая проверка production-доставки. Это письмо можно удалить.',
  contact: 'hello@kadonext.com',
  consent: 'true',
  consentVersion: CONTACT_CONSENT_VERSION,
  website: '',
})) form.set(name, value)

const response = await fetch(endpoint, {
  method: 'POST',
  headers: { origin, 'x-contact-token': challenge.token },
  body: form,
})
const result = await response.json().catch(() => ({}))
if (!response.ok || result.ok !== true) {
  throw new Error(result.message || `Contact delivery failed with HTTP ${response.status}`)
}

console.log('Production contact endpoint accepted the SMTP test message.')


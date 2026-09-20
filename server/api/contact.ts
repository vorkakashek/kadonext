import { defineEventHandler, getRequestIP, sendWebResponse, toWebRequest } from 'h3'
import process from 'node:process'
import { createContactHandler } from '~~/contact-api/handler.mjs'
import { contactDevMockMode, createContactDevMockOptions } from '~~/contact-api/dev-mock.mjs'

// Development adapter. Production static hosting runs contact-api/server.mjs separately.
const mockOptions = createContactDevMockOptions()
const mockMode = contactDevMockMode()
if (mockMode) console.info(`KADO contact form: development ${mockMode} mock enabled`)
const handle = createContactHandler(mockOptions ?? undefined)
export default defineEventHandler(async event => sendWebResponse(
  event,
  // Nuxt's development environment reloads .env on restart; SMTP stays server-side.
  await handle(toWebRequest(event), getRequestIP(event, { xForwardedFor: process.env.CONTACT_TRUST_PROXY === 'true' }) || 'unknown'),
))

import { Buffer } from 'node:buffer'

const MODES = new Set(['success', 'error'])

export function contactDevMockMode(env = process.env) {
  if (env.NODE_ENV === 'production') return null
  const configured = env.CONTACT_DEV_MOCK?.trim().toLowerCase()
  if (configured === 'true') return 'success'
  return MODES.has(configured) ? configured : null
}

export function createContactDevMockOptions(env = process.env) {
  const mode = contactDevMockMode(env)
  if (!mode) return null

  const configuredDelay = Number(env.CONTACT_DEV_MOCK_DELAY_MS)
  const delay = Number.isFinite(configuredDelay)
    ? Math.min(Math.max(configuredDelay, 0), 10000)
    : 500

  return {
    // The real handler still validates fields, consent, attachment count, MIME
    // types and total size. Decoding is skipped so the UI mock needs no FFmpeg.
    normalise: async files => files.map((_, index) => ({
      filename: `message-${String(index + 1).padStart(2, '0')}.mp3`,
      content: Buffer.alloc(0),
      contentType: 'audio/mpeg',
      seconds: 0,
    })),
    send: async () => {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      if (mode === 'error') {
        const cause = new Error('Development contact mock failure')
        cause.code = 'DEV_MOCK_FAILURE'
        throw cause
      }
      return { accepted: ['hello@kadonext.com'], rejected: [] }
    },
  }
}

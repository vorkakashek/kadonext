import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const TOKEN_VERSION = 'v1'
const DEFAULT_TOKEN_TTL_MS = 2 * 60 * 60 * 1000
const DEFAULT_HOURLY_LIMIT = 10
const DEFAULT_DAILY_LIMIT = 30
const DEFAULT_DUPLICATE_TTL_MS = 24 * 60 * 60 * 1000
const MAX_TRACKED_CLIENTS = 10000
const MAX_TRACKED_TOKENS = 20000
const MAX_TRACKED_SUBMISSIONS = 10000

function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value)
  if (!Number.isInteger(parsed)) return fallback
  return Math.min(Math.max(parsed, minimum), maximum)
}

function compactMap(map, maximum) {
  while (map.size > maximum) map.delete(map.keys().next().value)
}

function safeEqual(left, right) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

function digest(value) {
  return createHash('sha256').update(value).digest('base64url')
}

function normaliseText(value) {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase()
}

function submissionFingerprint(clientKey, fields, audio) {
  const payload = [
    clientKey,
    fields.projectType,
    fields.description,
    fields.contact,
    fields.stage,
    fields.deadline,
    fields.budget,
    fields.materials,
    ...audio.map(file => `${file.size}:${file.type}`),
  ].map(value => normaliseText(String(value || ''))).join('\n')
  return digest(payload)
}

function contentSpamReason(fields, tokenAgeMs) {
  if (fields.website) return 'honeypot'
  const text = `${fields.projectType}\n${fields.description}\n${fields.contact}\n${fields.materials}`
  const urls = text.match(/(?:https?:\/\/|www\.)[^\s<>{}\[\]]+/giu) || []
  const emails = text.match(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu) || []

  // Deliberately conservative: legitimate briefs may contain one or two links.
  if (urls.length >= 4) return 'link_flood'
  if (emails.length >= 4) return 'address_flood'
  if (/(?:<a\s+[^>]*href|\[url(?:=|\]))/iu.test(text) && urls.length >= 2) return 'link_markup'
  if (/(.)\1{24,}/u.test(text)) return 'repeated_characters'
  if (/\b(?:https?:\/\/\S+\s*){3,}/iu.test(text)) return 'link_sequence'
  if (tokenAgeMs < 800 && urls.length >= 2) return 'instant_link_submission'
  return null
}

function requestClientKey(clientIp, userAgent = '') {
  if (clientIp && clientIp !== 'unknown') return digest(clientIp)
  return digest(`unknown\n${userAgent.slice(0, 500)}`)
}

export function createContactAntiSpam(options = {}) {
  const env = options.env ?? process.env
  const now = options.now ?? (() => Date.now())
  const secret = env.CONTACT_ANTI_SPAM_SECRET?.trim() || randomBytes(32).toString('base64url')
  const tokenTtlMs = boundedInteger(env.CONTACT_TOKEN_TTL_MS, DEFAULT_TOKEN_TTL_MS, 60000, 24 * 60 * 60 * 1000)
  const hourlyLimit = boundedInteger(env.CONTACT_RATE_LIMIT_PER_HOUR, DEFAULT_HOURLY_LIMIT, 1, 1000)
  const dailyLimit = boundedInteger(env.CONTACT_RATE_LIMIT_PER_DAY, DEFAULT_DAILY_LIMIT, hourlyLimit, 5000)
  const duplicateTtlMs = boundedInteger(env.CONTACT_DUPLICATE_TTL_MS, DEFAULT_DUPLICATE_TTL_MS, 60000, 7 * 24 * 60 * 60 * 1000)
  const usedTokens = new Map()
  const requests = new Map()
  const delivered = new Map()
  let nextCleanupAt = 0

  function sign(payload) {
    return createHmac('sha256', secret).update(payload).digest('base64url')
  }

  function cleanup(timestamp) {
    if (timestamp < nextCleanupAt) return
    nextCleanupAt = timestamp + 60000
    for (const [token, expiresAt] of usedTokens) if (expiresAt <= timestamp) usedTokens.delete(token)
    for (const [fingerprint, expiresAt] of delivered) if (expiresAt <= timestamp) delivered.delete(fingerprint)
    for (const [client, entries] of requests) {
      const recent = entries.filter(value => value > timestamp - 24 * 60 * 60 * 1000)
      if (recent.length) requests.set(client, recent)
      else requests.delete(client)
    }
    compactMap(usedTokens, MAX_TRACKED_TOKENS)
    compactMap(delivered, MAX_TRACKED_SUBMISSIONS)
    compactMap(requests, MAX_TRACKED_CLIENTS)
  }

  function issueToken() {
    const issuedAt = now()
    const payload = `${TOKEN_VERSION}.${issuedAt.toString(36)}.${randomBytes(18).toString('base64url')}`
    return { token: `${payload}.${sign(payload)}`, expiresAt: issuedAt + tokenTtlMs, ttlMs: tokenTtlMs }
  }

  function acceptToken(token) {
    const timestamp = now()
    cleanup(timestamp)
    if (typeof token !== 'string' || token.length > 256) return { accepted: false, reason: 'missing_token' }
    const parts = token.split('.')
    if (parts.length !== 4 || parts[0] !== TOKEN_VERSION) return { accepted: false, reason: 'invalid_token' }
    const payload = parts.slice(0, 3).join('.')
    if (!safeEqual(parts[3], sign(payload))) return { accepted: false, reason: 'invalid_token' }
    const issuedAt = Number.parseInt(parts[1], 36)
    if (!Number.isFinite(issuedAt) || issuedAt > timestamp + 30000 || timestamp - issuedAt > tokenTtlMs) {
      return { accepted: false, reason: 'expired_token' }
    }
    const tokenId = digest(token)
    if (usedTokens.has(tokenId)) return { accepted: false, reason: 'replayed_token' }
    usedTokens.set(tokenId, issuedAt + tokenTtlMs)
    return { accepted: true, ageMs: Math.max(0, timestamp - issuedAt) }
  }

  function acceptRate(clientIp, userAgent) {
    const timestamp = now()
    cleanup(timestamp)
    const clientKey = requestClientKey(clientIp, userAgent)
    const entries = requests.get(clientKey) || []
    const hourStart = timestamp - 60 * 60 * 1000
    const hourlyCount = entries.reduce((count, value) => count + (value > hourStart ? 1 : 0), 0)
    if (hourlyCount >= hourlyLimit || entries.length >= dailyLimit) return { accepted: false, clientKey }
    entries.push(timestamp)
    requests.set(clientKey, entries)
    return { accepted: true, clientKey }
  }

  function inspectSubmission(fields, audio, clientKey, tokenAgeMs) {
    const reason = contentSpamReason(fields, tokenAgeMs)
    const fingerprint = submissionFingerprint(clientKey, fields, audio)
    if (reason) return { accepted: false, reason, fingerprint }
    if (delivered.has(fingerprint)) return { accepted: false, reason: 'duplicate', fingerprint }
    return { accepted: true, fingerprint }
  }

  function rememberDelivered(fingerprint) {
    delivered.set(fingerprint, now() + duplicateTtlMs)
    compactMap(delivered, MAX_TRACKED_SUBMISSIONS)
  }

  async function decoyDelay() {
    if (options.skipDelay) return
    const configured = boundedInteger(env.CONTACT_DECOY_DELAY_MS, 500, 0, 5000)
    const jitter = configured ? Math.floor(Math.random() * Math.min(350, configured + 1)) : 0
    await new Promise(resolve => setTimeout(resolve, configured + jitter))
  }

  return { issueToken, acceptToken, acceptRate, inspectSubmission, rememberDelivered, decoyDelay }
}

export interface ContactToken { token: string; expiresAt: number; ttlMs: number }
export interface ContactAntiSpam {
  issueToken(): ContactToken
  acceptToken(token: string): { accepted: boolean; reason?: string; ageMs?: number }
  acceptRate(clientIp: string, userAgent?: string): { accepted: boolean; clientKey: string }
  inspectSubmission(fields: Record<string, string>, audio: File[], clientKey: string, tokenAgeMs: number): { accepted: boolean; reason?: string; fingerprint: string }
  rememberDelivered(fingerprint: string): void
  decoyDelay(): Promise<void>
}
export function createContactAntiSpam(options?: { env?: Record<string, string | undefined>; now?: () => number; skipDelay?: boolean }): ContactAntiSpam

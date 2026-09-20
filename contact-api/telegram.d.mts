import type { AudioAttachment } from './handler.mjs'

export interface TelegramSubmission {
  fields: Record<string, string>
  attachments: AudioAttachment[]
}

export function splitTelegramText(text: string, limit?: number): string[]
export function createTelegramDelivery(options: {
  token: string
  chatId: string
  messageThreadId?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): null | ((submission: TelegramSubmission) => Promise<void>)

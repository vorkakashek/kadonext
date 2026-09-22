export const MAX_BODY_BYTES: number
export interface AudioAttachment {
  filename: string
  content: Buffer
  contentType: string
  seconds: number
}
export function normaliseAudio(files: File[], env?: NodeJS.ProcessEnv): Promise<AudioAttachment[]>
export function createContactHandler(options?: {
  env?: NodeJS.ProcessEnv
  send?: (message: object) => Promise<{ accepted: string[]; rejected?: string[] }>
  deliver?: (submission: { fields: Record<string, string>; attachments: AudioAttachment[] }) => Promise<void>
  normalise?: (files: File[]) => Promise<AudioAttachment[]>
  antiSpam?: import('./anti-spam.mjs').ContactAntiSpam
  skipDecoyDelay?: boolean
}): (request: Request, clientIp?: string) => Promise<Response>

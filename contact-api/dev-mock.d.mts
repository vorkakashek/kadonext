import type { AudioAttachment } from './handler.mjs'

export type ContactDevMockMode = 'success' | 'error'

export function contactDevMockMode(env?: NodeJS.ProcessEnv): ContactDevMockMode | null
export function createContactDevMockOptions(env?: NodeJS.ProcessEnv): null | {
  send: (message: object) => Promise<{ accepted: string[]; rejected: string[] }>
  normalise: (files: File[]) => Promise<AudioAttachment[]>
}

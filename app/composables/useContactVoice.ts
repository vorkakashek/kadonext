import { createContactVoiceSession } from '~/utils/contactVoiceSession'

// Blob/MediaRecorder objects must never enter Nuxt's serialised useState payload.
// A session belongs to one Nuxt app, not to a server-wide module singleton.
const sessions = new WeakMap<object, ReturnType<typeof createContactVoiceSession>>()

export function useContactVoice() {
  const app = useNuxtApp()
  let session = sessions.get(app)
  if (!session) {
    session = createContactVoiceSession()
    sessions.set(app, session)
  }
  onMounted(session.attach)
  onBeforeUnmount(session.detach)
  return session
}

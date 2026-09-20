export const COOKIE_NOTICE_COOKIE = 'kado_cookie_notice'
export const COOKIE_NOTICE_MAX_AGE = 60 * 60 * 24 * 30

export function wasCookieNoticeSeen() {
  if (typeof window === 'undefined') return false

  try {
    return document.cookie
      .split('; ')
      .some(cookie => cookie.startsWith(`${COOKIE_NOTICE_COOKIE}=1`))
  } catch {
    return false
  }
}

export function rememberCookieNotice() {
  if (typeof window === 'undefined') return

  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${COOKIE_NOTICE_COOKIE}=1; Max-Age=${COOKIE_NOTICE_MAX_AGE}; Path=/; SameSite=Lax${secure}`
  } catch {
    // A blocked cookie API must not make the notice unusable for this visit.
  }
}

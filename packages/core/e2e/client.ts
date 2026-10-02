import type { RunningServer } from './server'

export const COOKIE_NAME = '__session'

export type SignInAnswer =
  | { outcome: 'signed-in', cookie: string }
  | { outcome: 'failed', status: number, reason: string }

export interface PageAnswer {
  status: number
  signedIn: boolean
  cookie: string | null | undefined
}

interface ActionResult { type: string, status: number, location?: string, data?: string }

/** The session cookie a response sets: its value, `null` when it clears it, `undefined` when it leaves it alone. */
function sessionCookieOf (response: Response): string | null | undefined {
  const line = response.headers.getSetCookie().find(cookie => cookie.startsWith(`${COOKIE_NAME}=`))
  if (line === undefined) return undefined
  const value = line.slice(COOKIE_NAME.length + 1).split(';')[0]
  return value === '' || /max-age=0/i.test(line) ? null : value
}

function reasonOf (data: string | undefined): string {
  const [root, ...values] = JSON.parse(data ?? '[{}]') as [Record<string, number>, ...unknown[]]
  return String(values[root.reason - 1])
}

/** Submits the login form as the page does. */
export async function signIn (server: RunningServer, email: string, password: string): Promise<SignInAnswer> {
  const response = await fetch(`${server.origin}/login`, {
    method: 'POST',
    headers: { origin: server.origin, accept: 'application/json', 'x-sveltekit-action': 'true' },
    body: new URLSearchParams({ username: email, password }),
    redirect: 'manual'
  })
  const result = await response.json() as ActionResult
  const cookie = sessionCookieOf(response)
  if (result.type === 'redirect' && result.location === '/dashboard' && typeof cookie === 'string') return { outcome: 'signed-in', cookie }
  return { outcome: 'failed', status: result.status, reason: reasonOf(result.data) }
}

/** Opens the login page with the cookie: a signed-in user is redirected to the dashboard. */
export async function openLoginPage (server: RunningServer, cookie: string): Promise<PageAnswer> {
  const response = await fetch(`${server.origin}/login`, { headers: { cookie: `${COOKIE_NAME}=${cookie}` }, redirect: 'manual' })
  await response.arrayBuffer()
  return {
    status: response.status,
    signedIn: response.status === 303 && response.headers.get('location') === '/dashboard',
    cookie: sessionCookieOf(response)
  }
}

function unpacked (cookie: string): Record<string, string> {
  return JSON.parse(Buffer.from(cookie, 'base64url').toString('utf8')) as Record<string, string>
}

/** The same session with an access token no server accepts, so the next request refreshes it. */
export function withExpiredAccessToken (cookie: string): string {
  return Buffer.from(JSON.stringify({ ...unpacked(cookie), a: 'expired' }), 'utf8').toString('base64url')
}

/** The claims of the cookie's access token. */
export function accessClaims (cookie: string): { sub?: string, email?: string } {
  const [, payload] = unpacked(cookie).a.split('.')
  return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string, email?: string }
}

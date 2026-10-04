import { defineRuntime } from '@genoacms/contracts'
import type { Adapter, Identity, Rejection } from '@genoacms/contracts/authentication'
import { GoogleAuth } from 'google-auth-library'
import type { GcpIdentityPlatformOptions } from './descriptor.js'

/**
 * The GenoaCMS `authentication` service backed by Identity Platform, or plain Firebase
 * Authentication: one service behind one API (GU10). Users are managed there, not in the CMS.
 */

const ENDPOINT = 'https://identitytoolkit.googleapis.com/v1/accounts'
const SCOPE = 'https://www.googleapis.com/auth/identitytoolkit'
// AUTH-2
const TIMEOUT_MS = 10_000
// AUTH-5
const CREDENTIAL_CODES = new Set(['INVALID_LOGIN_CREDENTIALS', 'EMAIL_NOT_FOUND', 'INVALID_PASSWORD', 'INVALID_EMAIL', 'MISSING_PASSWORD', 'USER_DISABLED'])
// AUTH-6
const THROTTLED_CODE = 'TOO_MANY_ATTEMPTS_TRY_LATER'
const CREDENTIALS_REJECTED: Rejection = Object.freeze({ rejected: 'credentials' })
const SECOND_FACTOR_REQUIRED: Rejection = Object.freeze({ rejected: 'second-factor-required' })
// AUTH-3, AUTH-10, GF32
const MALFORMED = 'malformed response'

type JsonObject = Record<string, unknown>
interface Answer { status: number, body: unknown }

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)
const isObject = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value !== ''

// AUTH-7
function providerFailed (status: number | 'network', message: string): Error {
  return new Error(`authentication/provider-failed: ${status} ${message}`)
}

function errorMessage (body: unknown): string {
  return isObject(body) && isObject(body.error) && typeof body.error.message === 'string' ? body.error.message : ''
}

// AUTH-5
function errorCode (body: unknown): string {
  return errorMessage(body).split(' : ')[0]
}

function parsed (text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// AUTH-2
async function untilAborted<T> (work: Promise<T>, signal: AbortSignal): Promise<T> {
  signal.throwIfAborted()
  return await new Promise<T>((resolve, reject) => {
    const abort = (): void => { reject(signal.reason) }
    signal.addEventListener('abort', abort, { once: true })
    work.then(resolve, reject).finally(() => { signal.removeEventListener('abort', abort) })
  })
}

// AUTH-2, AUTH-7
async function send (url: URL, headers: Record<string, string>, body: object, signal: AbortSignal): Promise<Answer> {
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal })
    return { status: response.status, body: parsed(await response.text()) }
  } catch (error) {
    throw providerFailed('network', messageOf(error))
  }
}

// AUTH-3, AUTH-4, AUTH-8
function signedIn (body: unknown): Identity | Rejection {
  if (!isObject(body)) throw providerFailed(200, MALFORMED)
  if (body.mfaPendingCredential !== undefined) return SECOND_FACTOR_REQUIRED
  if (!isNonEmptyString(body.localId) || !isNonEmptyString(body.email)) throw providerFailed(200, MALFORMED)
  return { subject: body.localId, email: body.email }
}

// AUTH-5, AUTH-6, AUTH-7
function refused ({ status, body }: Answer): Rejection {
  const code = errorCode(body)
  if (status === 400 && CREDENTIAL_CODES.has(code)) return CREDENTIALS_REJECTED
  if (status === 400 && code === THROTTLED_CODE) throw new Error('authentication/throttled')
  throw providerFailed(status, errorMessage(body))
}

// AUTH-10
function foundIn (body: unknown): Identity | null {
  if (!isObject(body)) throw providerFailed(200, MALFORMED)
  if (body.users === undefined) return null
  if (!Array.isArray(body.users)) throw providerFailed(200, MALFORMED)
  const user: unknown = body.users[0]
  if (user === undefined) return null
  if (!isObject(user) || !isNonEmptyString(user.localId)) throw providerFailed(200, MALFORMED)
  if (user.disabled === true || typeof user.email !== 'string') return null
  return { subject: user.localId, email: user.email }
}

export default defineRuntime<GcpIdentityPlatformOptions, Adapter>({
  create ({ projectId, tenantId, apiKey, credentials }): Adapter {
    const auth = new GoogleAuth({ scopes: [SCOPE], projectId, ...(credentials === undefined ? {} : { credentials }) })
    const tenant = tenantId === undefined ? {} : { tenantId }

    // AUTH-7
    async function accessToken (signal: AbortSignal): Promise<string> {
      try {
        const token = await untilAborted(auth.getAccessToken(), signal)
        if (typeof token !== 'string' || token === '') throw new Error('no access token')
        return token
      } catch (error) {
        throw providerFailed('network', messageOf(error))
      }
    }

    async function withToken (signal: AbortSignal): Promise<Record<string, string>> {
      return { 'content-type': 'application/json', authorization: `Bearer ${await accessToken(signal)}` }
    }

    // AUTH-2
    async function signInRequest (signal: AbortSignal): Promise<{ url: URL, headers: Record<string, string> }> {
      const url = new URL(`${ENDPOINT}:signInWithPassword`)
      if (apiKey === undefined) return { url, headers: await withToken(signal) }
      url.searchParams.set('key', apiKey)
      return { url, headers: { 'content-type': 'application/json' } }
    }

    return {
      async authenticate (email, password) {
        const signal = AbortSignal.timeout(TIMEOUT_MS)
        const { url, headers } = await signInRequest(signal)
        const answer = await send(url, headers, { email, password, returnSecureToken: true, ...tenant }, signal)
        return answer.status === 200 ? signedIn(answer.body) : refused(answer)
      },

      // AUTH-10
      async getIdentity (subject) {
        const signal = AbortSignal.timeout(TIMEOUT_MS)
        const answer = await send(new URL(`${ENDPOINT}:lookup`), await withToken(signal), { localId: [subject], targetProjectId: projectId, ...tenant }, signal)
        if (answer.status !== 200) throw providerFailed(answer.status, errorMessage(answer.body))
        return foundIn(answer.body)
      }
    }
  }
})

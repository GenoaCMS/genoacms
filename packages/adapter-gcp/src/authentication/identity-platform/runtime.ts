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

interface ToolkitError { error?: { message?: unknown } }
interface SignInResponse extends ToolkitError { localId?: string, email?: string, mfaPendingCredential?: unknown }
interface LookupResponse extends ToolkitError { users?: Array<{ localId?: string, email?: unknown, disabled?: unknown }> }
interface Answer<B> { status: number, body: B }

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

// AUTH-7
function providerFailed (status: number | 'network', message: string): Error {
  return new Error(`authentication/provider-failed: ${status} ${message}`)
}

function errorMessage (body: ToolkitError): string {
  return typeof body.error?.message === 'string' ? body.error.message : ''
}

// AUTH-5
function errorCode (body: ToolkitError): string {
  return errorMessage(body).split(' : ')[0]
}

async function readJson (response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

async function send<B> (url: URL, headers: Record<string, string>, body: object): Promise<Answer<B>> {
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) })
    return { status: response.status, body: await readJson(response) as B }
  } catch (error) {
    throw providerFailed('network', messageOf(error))
  }
}

// AUTH-3, AUTH-4, AUTH-8
function signedIn (body: SignInResponse): Identity | Rejection {
  if (body.mfaPendingCredential !== undefined) return SECOND_FACTOR_REQUIRED
  return { subject: String(body.localId), email: String(body.email) }
}

// AUTH-5, AUTH-6, AUTH-7
function refused ({ status, body }: Answer<ToolkitError>): Rejection {
  const code = errorCode(body)
  if (status === 400 && CREDENTIAL_CODES.has(code)) return CREDENTIALS_REJECTED
  if (status === 400 && code === THROTTLED_CODE) throw new Error('authentication/throttled')
  throw providerFailed(status, errorMessage(body))
}

// AUTH-10
function foundIn (body: LookupResponse): Identity | null {
  const user = body.users?.[0]
  if (user === undefined || user.disabled === true || typeof user.email !== 'string') return null
  return { subject: String(user.localId), email: user.email }
}

export default defineRuntime<GcpIdentityPlatformOptions, Adapter>({
  create ({ projectId, tenantId, apiKey, credentials }): Adapter {
    const auth = new GoogleAuth({ scopes: [SCOPE], projectId, ...(credentials === undefined ? {} : { credentials }) })
    const tenant = tenantId === undefined ? {} : { tenantId }

    // AUTH-7
    async function accessToken (): Promise<string> {
      try {
        const token = await auth.getAccessToken()
        if (typeof token !== 'string' || token === '') throw new Error('no access token')
        return token
      } catch (error) {
        throw providerFailed('network', messageOf(error))
      }
    }

    async function withToken (): Promise<Record<string, string>> {
      return { 'content-type': 'application/json', authorization: `Bearer ${await accessToken()}` }
    }

    // AUTH-2
    async function signInRequest (): Promise<{ url: URL, headers: Record<string, string> }> {
      const url = new URL(`${ENDPOINT}:signInWithPassword`)
      if (apiKey === undefined) return { url, headers: await withToken() }
      url.searchParams.set('key', apiKey)
      return { url, headers: { 'content-type': 'application/json' } }
    }

    return {
      async authenticate (email, password) {
        const { url, headers } = await signInRequest()
        const answer = await send<SignInResponse>(url, headers, { email, password, returnSecureToken: true, ...tenant })
        return answer.status === 200 ? signedIn(answer.body) : refused(answer)
      },

      // AUTH-10
      async getIdentity (subject) {
        const answer = await send<LookupResponse>(new URL(`${ENDPOINT}:lookup`), await withToken(), { localId: [subject], targetProjectId: projectId, ...tenant })
        if (answer.status !== 200) throw providerFailed(answer.status, errorMessage(answer.body))
        return foundIn(answer.body)
      }
    }
  }
})

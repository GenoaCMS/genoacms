import { host } from '$lib/script/host.server'
import { isRejection } from '@genoacms/contracts/authentication'
import type { Adapter, Identity, Rejection } from '@genoacms/contracts/authentication'

type SignInFailure = 'invalid-credentials' | 'too-many-attempts' | 'sign-in-unavailable'

type SignInResult =
  | { outcome: 'signed-in', provider: string, identity: Identity }
  | { outcome: 'failed', failure: SignInFailure }

/** What one provider said about one attempt. */
type Answer =
  | { kind: 'identity', identity: Identity }
  | { kind: 'rejected', rejection: Rejection }
  | { kind: 'threw', error: unknown }

const THROTTLED = 'authentication/throttled'
const INVALID_ANSWER = 'authentication/invalid-answer'

function isIdentity (answer: unknown): answer is Identity {
  if (typeof answer !== 'object' || answer === null) return false
  const { subject, email } = answer as Record<string, unknown>
  return typeof subject === 'string' && subject.length > 0 && typeof email === 'string'
}

function messageOf (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function ask (key: string, email: string, password: string): Promise<Answer> {
  try {
    const adapter: Adapter = await host.authentication(key)
    const result: unknown = await adapter.authenticate(email, password)
    if (isIdentity(result)) return { kind: 'identity', identity: result }
    if (typeof result === 'object' && result !== null && isRejection(result as Rejection)) return { kind: 'rejected', rejection: result as Rejection }
    throw new Error(INVALID_ANSWER) // AUTHN-5
  } catch (error) {
    return { kind: 'threw', error }
  }
}

function log (key: string, answer: Answer): void {
  if (answer.kind === 'rejected') console.warn(`[genoacms:auth] provider ${key} rejected the sign-in: ${answer.rejection.rejected}`)
  if (answer.kind === 'threw') console.error(`[genoacms:auth] provider ${key} failed: ${messageOf(answer.error)}`)
}

function failureAfter (failures: unknown[]): SignInFailure {
  if (failures.length === 0) return 'invalid-credentials'
  return failures.some(error => messageOf(error).startsWith(THROTTLED)) ? 'too-many-attempts' : 'sign-in-unavailable'
}

/**
 * Tries the providers one at a time, in key order (AUTHN-5).
 *
 * Authorization is not consulted here: `login` does that, so a known identity is still a failure
 * when the authorization data does not know its subject.
 */
async function signIn (email: string, password: string): Promise<SignInResult> {
  if (host.authenticationProviderKeys.length === 0) {
    console.error('[genoacms:auth] no authentication provider is configured')
    return { outcome: 'failed', failure: 'sign-in-unavailable' }
  }
  const failures: unknown[] = []
  for (const key of host.authenticationProviderKeys) {
    const answer = await ask(key, email, password)
    log(key, answer)
    if (answer.kind === 'identity') return { outcome: 'signed-in', provider: key, identity: answer.identity }
    if (answer.kind === 'rejected' && answer.rejection.rejected !== 'credentials') return { outcome: 'failed', failure: 'invalid-credentials' }
    if (answer.kind === 'threw') failures.push(answer.error)
  }
  return { outcome: 'failed', failure: failureAfter(failures) }
}

async function lookUp (key: string, subject: string): Promise<Identity | null> {
  try {
    const answer: unknown = await (await host.authentication(key)).getIdentity(subject)
    if (answer === null || isIdentity(answer)) return answer
    throw new Error(INVALID_ANSWER) // AUTHN-7
  } catch (error) {
    throw new Error(`session/revalidation-failed: ${key}: ${messageOf(error)}`)
  }
}

async function lookUpInOrder (subject: string): Promise<Identity | null> {
  let firstFailure: unknown
  for (const key of host.authenticationProviderKeys) {
    try {
      const identity = await lookUp(key, subject)
      if (identity !== null) return identity
    } catch (error) {
      firstFailure ??= error
    }
  }
  if (firstFailure !== undefined) throw firstFailure
  return null
}

/** Whether a session's subject may continue, and under which email (AUTHN-7). */
async function revalidate (subject: string, provider: string | undefined): Promise<Identity | null> {
  if (provider === undefined) return await lookUpInOrder(subject)
  if (!host.authenticationProviderKeys.includes(provider)) return null
  return await lookUp(provider, subject)
}

export {
  signIn,
  revalidate
}

export type {
  SignInFailure,
  SignInResult
}

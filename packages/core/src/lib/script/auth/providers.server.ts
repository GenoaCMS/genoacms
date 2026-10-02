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

function messageOf (error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function ask (key: string, email: string, password: string): Promise<Answer> {
  try {
    const adapter: Adapter = await host.authentication(key)
    const result = await adapter.authenticate(email, password)
    return isRejection(result) ? { kind: 'rejected', rejection: result } : { kind: 'identity', identity: result }
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
    return await (await host.authentication(key)).getIdentity(subject)
  } catch (error) {
    throw new Error(`session/revalidation-failed: ${key}: ${messageOf(error)}`)
  }
}

async function lookUpInOrder (subject: string): Promise<Identity | null> {
  for (const key of host.authenticationProviderKeys) {
    const identity = await lookUp(key, subject)
    if (identity !== null) return identity
  }
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

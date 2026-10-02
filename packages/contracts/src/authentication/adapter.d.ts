import type { Identity, Rejection } from './types.d.ts'

export declare namespace Adapter {
  /** AUTHN-2. A provider that cannot decide throws `authentication/…` instead (AUTHN-3). */
  type authenticate = (email: string, password: string) => Promise<Identity | Rejection>
  /** AUTHN-4. `null` for a subject that is unknown, deleted or disabled. */
  type getIdentity = (subject: string) => Promise<Identity | null>
}

/** One constructed authentication provider. */
export interface Adapter {
  authenticate: Adapter.authenticate
  getIdentity: Adapter.getIdentity
}

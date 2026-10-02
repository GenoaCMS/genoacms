import type { Adapter } from './adapter.d.ts'
import type { Identity, Rejection, RejectionReason } from './types.d.ts'

/** True for a Rejection, false for an Identity (AUTHN-2). */
declare function isRejection (result: Identity | Rejection): result is Rejection

export { isRejection }
export type { Adapter, Identity, Rejection, RejectionReason }

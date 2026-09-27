import type { Identity } from './types.d.ts'

export declare namespace Adapter {
  type authenticate = (email: string, password: string) => Promise<Identity | null>
}

/** One constructed authentication provider. */
export interface Adapter {
  authenticate: Adapter.authenticate
}

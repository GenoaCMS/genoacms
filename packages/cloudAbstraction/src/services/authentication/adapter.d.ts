import type { Identity } from './types.d'

export declare namespace Adapter {
  type authenticate = (email: string, password: string) => Promise<Identity | null>
}

import type { Condition, QueryParams } from './types.d.ts'

/** Throws `database/invalid-query: <reason>` unless `params` match the types of DATA-8. */
declare function checkQuery (params: QueryParams | undefined): void

/** Throws `database/unsupported-value: <path>` for the first value of `data` that is not JSON (DATA-2). */
declare function checkValues (data: Record<string, unknown>): void

/** Whether `data`, with its key field, matches every condition (DATA-9). */
declare function matches (data: Record<string, unknown>, conditions: Condition[]): boolean

/** An opaque page token: base64url of the JSON of `value`. */
declare function encodeToken (value: unknown): string

/** Throws `database/invalid-query: unknown page token` for a token `encodeToken` did not issue. */
declare function decodeToken (token: unknown): any

export {
  checkQuery,
  checkValues,
  matches,
  encodeToken,
  decodeToken
}

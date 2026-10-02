/**
 * True for a Rejection, false for an Identity (AUTHN-2).
 *
 * @param {import('./types.d.ts').Identity | import('./types.d.ts').Rejection} result
 * @returns {result is import('./types.d.ts').Rejection}
 */
function isRejection (result) {
  return typeof result === 'object' && result !== null && 'rejected' in result
}

export { isRejection }

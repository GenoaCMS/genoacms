import { createHash, randomBytes } from 'node:crypto'

const AGENT_TOKEN_MIN_LENGTH = 43
const TOKEN_PREFIX = 'gat_'
const TOKEN_BYTES = 32

/** AGT-3 */
function generateAgentToken (): string {
  return `${TOKEN_PREFIX}${randomBytes(TOKEN_BYTES).toString('base64url')}`
}

/** AGT-2 */
function hashAgentToken (token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export { generateAgentToken, hashAgentToken, AGENT_TOKEN_MIN_LENGTH }

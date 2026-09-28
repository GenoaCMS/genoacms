import { describe, it, expect } from 'vitest'
import { generateKeyPairSync } from 'node:crypto'
import runtime from './runtime.js'

/**
 * The real client library, not a mock: both URLs are formed locally, so the tests check the library's
 * actual encoding and signing without touching the network.
 */
function credentials () {
  const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  return {
    client_email: 'cms@p.iam.gserviceaccount.com',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string
  }
}

const create = async () => await runtime.create({ projectId: 'p', credentials: credentials() as any }, { name: 's', resources: ['b'] })

describe('storage URLs', () => {
  it('STO-5: forms the public URL with the name fully encoded', async () => {
    const storage = await create()
    expect(await storage.getPublicURL({ bucket: 'b', name: 'a/b c.txt' })).toBe('https://storage.googleapis.com/b/a%2Fb%20c.txt')
  })

  it('STO-8: signs a V2 read URL locally with a key', async () => {
    const storage = await create()
    const expires = Date.now() + 60_000
    const url = new URL(await storage.getSignedURL({ bucket: 'b', name: 'a/b c.txt' }, expires))
    expect(`${url.origin}${url.pathname}`).toBe('https://storage.googleapis.com/b/a/b%20c.txt')
    expect(url.searchParams.get('GoogleAccessId')).toBe('cms@p.iam.gserviceaccount.com')
    expect(Number(url.searchParams.get('Expires'))).toBe(Math.floor(expires / 1000))
    expect(url.searchParams.get('Signature')).toMatch(/^[A-Za-z0-9+/=]+$/)
  })
})

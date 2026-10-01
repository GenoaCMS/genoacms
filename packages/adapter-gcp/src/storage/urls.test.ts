import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createVerify } from 'node:crypto'
import runtime from './runtime.js'

// GD6
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

  it('STO-8: signs for read, not write', async () => {
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const key = { client_email: 'cms@p.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }) as string }
    const storage = await runtime.create({ projectId: 'p', credentials: key as any }, { name: 's', resources: ['b'] })
    const expires = Date.now() + 60_000
    const url = new URL(await storage.getSignedURL({ bucket: 'b', name: 'a.txt' }, expires))
    const signature = url.searchParams.get('Signature') as string
    const signs = (method: string): boolean => createVerify('RSA-SHA256')
      .update(`${method}\n\n\n${Math.floor(expires / 1000)}\n/b/a.txt`)
      .verify(publicKey, signature, 'base64')
    expect(signs('GET')).toBe(true)
    expect(signs('PUT')).toBe(false)
  })
})

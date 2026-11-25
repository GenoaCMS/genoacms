import { describe, it, expect } from 'vitest'
import { createHash } from 'node:crypto'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from './algorithms'
import { deriveKeyId } from './keyId'
import { toBase64 } from './envelope'
import type { RegisteredKey } from './registry'
import { importModule } from '#lib/script/testing/requests.js'

const keyFile = async () => await importModule('#lib/script/signing/keyFile.js')

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const genuine = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(1))
const other = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(2))

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')

const entry: RegisteredKey = {
  keyId: deriveKeyId(genuine.publicKey),
  alg: SUBORDINATE_ALGORITHM,
  digest: sha256(genuine.publicKey),
  createdAt: 1_000
}

const mismatch = (member: string): { ok: false, reason: string } =>
  ({ ok: false, reason: `key-file-mismatch: ${entry.keyId} ${member} does not match the key manifest` })

describe('a key file', () => {
  it('REG-2: accepts the key file of a listed key', async () => {
    const { toKeyFile, parseKeyFile } = await keyFile()
    expect(parseKeyFile(entry, toKeyFile(entry.keyId, 'ML-DSA-65', genuine.publicKey)))
      .toEqual({ ok: true, key: { alg: 'ML-DSA-65', publicKey: genuine.publicKey } })
  })

  it('REG-2: refuses a key file whose key does not have the entry\'s digest', async () => {
    const { toKeyFile, parseKeyFile } = await keyFile()
    expect(parseKeyFile(entry, toKeyFile(entry.keyId, 'ML-DSA-65', other.publicKey)))
      .toEqual(mismatch('publicKey'))
  })

  it('REG-2: refuses a key whose 64-bit id collides but whose digest differs', async () => {
    const { toKeyFile, parseKeyFile } = await keyFile()
    const flipped = [...entry.digest.slice(16)].map(digit => digit === '0' ? '1' : '0').join('')
    const colliding: RegisteredKey = { ...entry, digest: `${entry.digest.slice(0, 16)}${flipped}` }

    expect(parseKeyFile(colliding, toKeyFile(entry.keyId, 'ML-DSA-65', genuine.publicKey)))
      .toEqual(mismatch('publicKey'))
  })

  it('REG-2: refuses another key id, another algorithm, a key of the wrong length, loose base64 and an extra member', async () => {
    const { toKeyFile, parseKeyFile } = await keyFile()
    const file = { ...toKeyFile(entry.keyId, 'ML-DSA-65', genuine.publicKey) }
    const encoded = toBase64(genuine.publicKey)

    expect(parseKeyFile(entry, { ...file, keyId: deriveKeyId(other.publicKey) })).toEqual(mismatch('keyId'))
    expect(parseKeyFile(entry, { ...file, alg: 'SLH-DSA-SHA2-128s' })).toEqual(mismatch('alg'))
    expect(parseKeyFile(entry, { ...file, publicKey: toBase64(genuine.publicKey.slice(0, 1951)) })).toEqual(mismatch('publicKey'))
    expect(parseKeyFile(entry, { ...file, publicKey: `${encoded}\n` })).toEqual(mismatch('publicKey'))
    expect(parseKeyFile(entry, { ...file, signature: 'x' })).toEqual(mismatch('shape'))
  })

  it('REG-2: the key file path is the key id under keys/public', async () => {
    const { keyFilePath } = await keyFile()
    expect(keyFilePath('0123456789abcdef')).toBe('.genoacms/keys/public/0123456789abcdef.json')
  })
})

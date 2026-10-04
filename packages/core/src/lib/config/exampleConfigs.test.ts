import { describe, it, expect } from 'vitest'
import { resolve } from 'node:path'
import { loadConfig } from '@genoacms/config/load'

const root = resolve(import.meta.dirname, '../../..')
const load = (name: string, mode: 'development' | 'production') =>
  loadConfig({ root, file: resolve(root, 'genoa.config', `${name}.ts`), mode, forbidInline: true, onWarning: () => {} })

describe('the example configs the documentation site shows', () => {
  it('loads gcp.ts as a production config', async () => {
    await expect(load('gcp', 'production')).resolves.toMatchObject({ mode: 'production' })
  })
  it('loads aws.ts as a production config', async () => {
    await expect(load('aws', 'production')).resolves.toMatchObject({ mode: 'production' })
  })
  it('loads self-hosted.ts as a development config, and refuses it in production', async () => {
    await expect(load('self-hosted', 'development')).resolves.toMatchObject({ mode: 'development' })
    await expect(load('self-hosted', 'production')).rejects.toMatchObject({ code: 'config/invalid' })
  })
})

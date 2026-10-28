import { describe, it, expect } from 'vitest'
import { importModule } from '$lib/script/testing/requests'

const names = () => importModule('$lib/script/mcp/tools/storageNames')

describe('the names of the storage tools', () => {
  it.fails('TOL-24: object names and directory paths are checked by level', async () => {
    const { requireObjectName, requireDirectoryPath, requireSubdirectoryPath, StorageToolError } = await names()
    const refusal = (name: string) => ({ message: `storage/invalid-name: ${name}` })

    for (const name of ['a', 'a/b.txt', 'a b/ć.txt']) expect(() => requireObjectName(name), name).not.toThrow()
    for (const name of ['', 'a/', '/a', 'a//b', './a', 'a/../b']) {
      expect(() => requireObjectName(name), name).toThrow(expect.objectContaining(refusal(name)))
      expect(() => requireObjectName(name), name).toThrow(StorageToolError)
    }

    for (const path of ['', 'a/b/']) expect(() => requireDirectoryPath(path), path).not.toThrow()
    for (const path of ['a', 'a//', '../']) expect(() => requireDirectoryPath(path), path).toThrow(expect.objectContaining(refusal(path)))

    expect(() => requireSubdirectoryPath('a/b/')).not.toThrow()
    expect(() => requireSubdirectoryPath('')).toThrow(expect.objectContaining(refusal('')))
  })
})

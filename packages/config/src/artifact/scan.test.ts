import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { scanServerOutput } from './scan.js'

const roots: string[] = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }) })

function build (files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'genoa-scan-'))
  roots.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

describe('scanServerOutput', () => {
  const buildDir = (): string => build({
    'index.js': "import { handler } from './handler.js'\nimport '@sveltejs/kit/node'\nexport * from 'jose'\n",
    'handler.js': "export { a } from 'deep-diff'\nimport fs from 'node:fs'\nimport path from 'path'\nexport const handler = () => import('marked')\n",
    'server/chunks/loader.js': "const load = (s) => import(/* @vite-ignore */ s)\nconst r = require('flatted')\nconst c = createRequire(import.meta.url)\nexport { load, r, c }\n",
    'client/app.js': "import 'browser-only'\n"
  })

  it('finds static, re-exported and literal dynamic imports, reduced to package names', () => {
    expect(scanServerOutput(buildDir()).packages).toEqual(['@sveltejs/kit', 'deep-diff', 'jose', 'marked'])
  })

  it('ignores relative imports, node builtins and the client bundle', () => {
    const { packages } = scanServerOutput(buildDir())
    expect(packages).not.toContain('path')
    expect(packages).not.toContain('browser-only')
  })

  it('reports the imports it cannot see through, with their file', () => {
    expect(scanServerOutput(buildDir()).blind).toEqual([
      'server/chunks/loader.js: createRequire(<MemberExpression>)',
      'server/chunks/loader.js: import(<Identifier>)',
      'server/chunks/loader.js: require("flatted")'
    ])
  })
})

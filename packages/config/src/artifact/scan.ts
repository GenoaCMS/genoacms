import { readdirSync, readFileSync, statSync } from 'node:fs'
import { builtinModules } from 'node:module'
import { join, relative } from 'node:path'
import { parseAst } from 'vite'
import { packageNameOf } from '../load/project.js'

interface ScanResult {
  /** Packages the server output imports by bare specifier. Sorted, unique. */
  readonly packages: string[]
  /** Imports the scan cannot see through, as "<file>: <construct>". */
  readonly blind: string[]
}

interface AstNode { type: string, [key: string]: unknown }

const BUILTINS: ReadonlySet<string> = new Set(builtinModules)
const NOT_BARE = ['.', '/', 'node:', 'data:', 'file:']

const isBare = (specifier: string): boolean =>
  !NOT_BARE.some(prefix => specifier.startsWith(prefix)) && !BUILTINS.has(specifier.split('/')[0])

/** Every server-side JavaScript file of a SvelteKit adapter's output; browser assets are skipped. */
function serverFiles (dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return name === 'client' ? [] : serverFiles(path)
    return /\.m?js$/.test(name) ? [path] : []
  })
}

function children (node: AstNode): AstNode[] {
  return Object.values(node).flatMap(value => {
    if (Array.isArray(value)) return value.filter((item): item is AstNode => typeof item?.type === 'string')
    return typeof (value as AstNode | null)?.type === 'string' ? [value as AstNode] : []
  })
}

const literal = (node: unknown): string | undefined => {
  const candidate = node as { type?: string, value?: unknown } | null | undefined
  return candidate?.type === 'Literal' && typeof candidate.value === 'string' ? candidate.value : undefined
}

/** The specifier this node imports, or a description of an import the scan cannot resolve. */
function inspect (node: AstNode): { specifier?: string, blind?: string } {
  if (['ImportDeclaration', 'ExportAllDeclaration', 'ExportNamedDeclaration'].includes(node.type)) {
    return { specifier: literal(node.source) }
  }
  if (node.type === 'ImportExpression') {
    const specifier = literal(node.source)
    return specifier === undefined ? { blind: `import(<${(node.source as AstNode).type}>)` } : { specifier }
  }
  const callee = node.callee as AstNode | undefined
  if (node.type === 'CallExpression' && callee?.type === 'Identifier' && ['require', 'createRequire'].includes(callee.name as string)) {
    const argument = (node.arguments as AstNode[])[0]
    return { blind: `${callee.name as string}(${literal(argument) === undefined ? `<${argument?.type ?? 'nothing'}>` : JSON.stringify(literal(argument))})` }
  }
  return {}
}

function scanFile (file: string, root: string, packages: Set<string>, blind: Set<string>): void {
  const pending: AstNode[] = [parseAst(readFileSync(file, 'utf-8')) as unknown as AstNode]
  while (pending.length > 0) {
    const node = pending.pop() as AstNode
    const found = inspect(node)
    if (found.specifier !== undefined && isBare(found.specifier)) packages.add(packageNameOf(found.specifier))
    if (found.blind !== undefined) blind.add(`${relative(root, file)}: ${found.blind}`)
    pending.push(...children(node))
  }
}

/** Bare imports of a server build, and the imports no static scan can see. */
function scanServerOutput (buildDir: string): ScanResult {
  const packages = new Set<string>()
  const blind = new Set<string>()
  for (const file of serverFiles(buildDir)) scanFile(file, buildDir, packages, blind)
  return { packages: [...packages].sort(), blind: [...blind].sort() }
}

export { scanServerOutput }
export type { ScanResult }

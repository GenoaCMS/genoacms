import { parse } from 'acorn'
import esquery from 'esquery'
import type { ComponentEntry } from '../componentEntry/component/types'

function getRootFunction (ast, name) {
  const nodes = esquery(ast, `FunctionDeclaration[id.name="${name}"]`)
  if (nodes.length < 1) return null
  return nodes[0]
}

function componentCodeToEntry (functionName: string, code: string): ComponentEntry {
  const ast = parse(code, { ecmaVersion: 2025, sourceType: 'module' })
  const rootFunction = getRootFunction(ast, functionName)
  if (!rootFunction) return
  console.log('ast', ast, ast.body[0].id)
}

export {
  componentCodeToEntry
}

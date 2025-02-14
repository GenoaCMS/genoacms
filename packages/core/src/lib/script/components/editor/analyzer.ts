import type { FunctionDeclaration } from 'estree'
import type { ComponentEntry } from '../componentEntry/component/types'

import { parse } from 'acorn'
import esquery from 'esquery'
import { ComponentCodeError } from './errors'

function getRootFunction (ast, name): FunctionDeclaration | null {
  const nodes = esquery(ast, `FunctionDeclaration[id.name="${name}"]`)
  if (nodes.length < 1) return null
  return nodes[0]
}

function functionArgumentsToAttributes (functionNode: FunctionDeclaration) {
  const args = esquery(functionNode, 'FunctionDeclaration > Identifier')
  console.log('args', args)
  const attributes = {} // TODO: we need type of arguments, thus we will enforce TS with custom types
}

function componentCodeToEntry (functionName: string, code: string): ComponentEntry {
  const ast = parse(code, { ecmaVersion: 2025, sourceType: 'module' })
  const rootFunction = getRootFunction(ast, functionName)
  if (!rootFunction) throw new ComponentCodeError('missing-root-function', `No root function named ${functionName} found in code`)
  functionArgumentsToAttributes(rootFunction)
  console.log('ast', ast, ast.body[0].id)
}

export {
  componentCodeToEntry
}

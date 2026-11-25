#!/usr/bin/env node
/**
 * Spec Workflow map (WORKFLOW.md §5.7). No dependencies: Node ≥ 20.
 *
 *   node docs/tools/map.mjs [docsDir]
 *
 * Writes <docsDir>/MAP.md: the use cases by actor, each statement with the use cases and scenarios that
 * name it, and the documents the scenarios join. check-docs.mjs reports a committed MAP.md that is stale.
 */
import { existsSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { analyze, renderMap, MAP_FILE } from './check-docs.mjs'

function main () {
  const docsDir = resolve(process.argv[2] ?? 'docs')
  if (!existsSync(docsDir)) { console.error(`${docsDir} does not exist`); process.exit(2) }
  const path = join(docsDir, MAP_FILE)
  writeFileSync(path, renderMap(analyze(docsDir), docsDir))
  console.log(`wrote ${path}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main()

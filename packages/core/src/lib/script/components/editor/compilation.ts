import type { CompilationResult, ExecutablePlatform } from '@genoacms/internal/languageAdapter'
import { getLanguageAdapter } from '$lib/script/components/language.server'
import { ComponentCodeError } from './errors'
import { raiseFatal } from './diagnostics'

/**
 * Compiling a component's source into the bundle a consumer runs.
 *
 * The counterpart to `analyzer.ts`: that one asks the adapter what the component *accepts*, this one
 * asks it for something executable. Both resolve the adapter from the language the component
 * records, and both turn a fatal diagnostic into the refusal the commit path acts on.
 *
 * **Compilation follows analysis and never replaces it.** They answer different questions — an
 * import that the compiler refuses is invisible to attribute derivation, and a parameter type the
 * analyzer cannot read compiles perfectly well.
 */

/**
 * The platform to build for.
 *
 * Taken from the adapter rather than named here, because which targets exist is a property of the
 * language: a compiler emitting bytecode has nothing to say about `web-esmodule`. An adapter that
 * declares none is misconfigured, and saying so is better than emitting an artifact labeled with a
 * platform nothing asked for.
 */
const soleTargetOf = (
  language: string,
  platforms: readonly ExecutablePlatform[]
): ExecutablePlatform => {
  const [platform] = platforms
  if (platform === undefined) {
    throw new ComponentCodeError(
      'no-platform',
      `The adapter for '${language}' declares no platform to compile for`
    )
  }
  return platform
}

/**
 * Compiles the source, or refuses the commit.
 *
 * A result with no code and no fatal diagnostic would be a silent failure — the pipeline would sign
 * `undefined` and publish an artifact with nothing in it — so the absence is treated as fatal in its
 * own right rather than trusted to have been explained.
 */
const compiledCode = (language: string, result: CompilationResult): string => {
  raiseFatal(result.diagnostics)
  if (result.executableCode === undefined) {
    throw new ComponentCodeError(
      'compilation-produced-nothing',
      `The adapter for '${language}' returned no code and gave no reason`
    )
  }
  return result.executableCode
}

interface CompiledComponent {
  platform: ExecutablePlatform
  executableCode: string
}

const compileComponentSource = async (
  language: string,
  functionName: string,
  code: string
): Promise<CompiledComponent> => {
  const adapter = await getLanguageAdapter(language)
  const platform = soleTargetOf(language, adapter.platforms)
  const result = await adapter.compileBundle({ source: code, entryFunction: functionName, platform })
  return { platform, executableCode: compiledCode(language, result) }
}

export {
  compileComponentSource
}

export type {
  CompiledComponent
}

import type {
  ComponentShape,
  CompilationResult,
  ExecutablePlatform
} from '@genoacms/internal/languageAdapter'
import { getLanguageAdapter } from '$lib/script/components/language.server'
import { ComponentCodeError } from './errors'
import { raiseFatal } from './diagnostics'

/**
 * Compiling a component into the bundle a consumer runs.
 *
 * The adapter is given the author's **body** and the component's shape, and wraps the one in the
 * other itself. Nothing here assembles anything: the entry function's syntax, the type each
 * attribute becomes, and how many lines the wrapper occupies are all facts about the target
 * language, and a CMS that knew them would be a TypeScript compiler with a CMS attached.
 *
 * The adapter is resolved from the language the component records, and a fatal diagnostic becomes
 * the refusal the publish path acts on.
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

const compileComponentBody = async (
  language: string,
  body: string,
  shape: ComponentShape
): Promise<CompiledComponent> => {
  const adapter = await getLanguageAdapter(language)
  const platform = soleTargetOf(language, adapter.platforms)
  const result = await adapter.compileBundle({ body, shape, platform })
  return { platform, executableCode: compiledCode(language, result) }
}

/**
 * Checks a body against the language's safety rules before anything is built from it.
 *
 * Separate from compiling because the two answer different questions and one of them is about to
 * grow: the safety ruleset is the guard work's, and a component that compiles perfectly well is
 * exactly the kind that needs checking.
 */
const analyzeComponentBody = async (
  language: string,
  body: string,
  shape: ComponentShape
): Promise<void> => {
  const adapter = await getLanguageAdapter(language)
  raiseFatal((await adapter.analyze({ body, shape })).diagnostics)
}

export {
  analyzeComponentBody,
  compileComponentBody
}

export type {
  CompiledComponent
}

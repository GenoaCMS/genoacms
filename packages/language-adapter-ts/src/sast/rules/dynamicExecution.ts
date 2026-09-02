import { Node, SyntaxKind } from 'ts-morph'
import type { CallExpression, SourceFile } from 'ts-morph'
import type { SecurityRuleDiagnostic } from '@genoacms/internal/languageAdapter'
import { violation, freeReferences, callsTo, accessesNamed, accessTargetText } from '../nodes.js'

/**
 * The rules that stop a component reaching outside itself: `SAST-01`, `SAST-02`, `SAST-03`.
 *
 * All three are about the same thing from different directions — turning source text into behavior
 * the author did not write, reaching the environment the component runs in, or reaching another
 * object's prototype. Each is decidable at commit time, so each rejects rather than warning.
 */

/** Turning a string into code. The single most direct way to make a signature attest to nothing. */
const EVALUATORS = ['eval', 'Function']

/** These take code as a string in one overload, and a function in the other. Only the first is a fault. */
const DEFERRED = ['setTimeout', 'setInterval']

/** A literal string of code, in any of the spellings that produce one. */
const isCodeString = (node: Node): boolean =>
  Node.isStringLiteral(node) ||
  Node.isTemplateExpression(node) ||
  Node.isNoSubstitutionTemplateLiteral(node)

/**
 * `SAST-01` — no dynamic evaluation.
 *
 * What makes this rule matter more than the others: the artifact is signed, and a signature over
 * source that builds its real behavior from a string attests to nothing an author or reviewer read.
 */
const noDynamicEvaluation = (sourceFile: SourceFile): SecurityRuleDiagnostic[] => {
  const named = EVALUATORS.flatMap(name =>
    freeReferences(sourceFile, name).map(id => violation(
      'SAST-01',
      sourceFile,
      id.getStart(),
      `\`${name}\` turns text into code, so what runs is not what was signed. It is not available ` +
      'to a component.'
    ))
  )

  // `setTimeout(() => {...})` is ordinary; `setTimeout('...')` is `eval` with a delay. Only the
  // string form is refused, so the rule does not cost authors the legitimate one.
  const deferred = DEFERRED.flatMap(name =>
    callsTo(sourceFile, name)
      .filter(call => {
        const first = call.getArguments()[0]
        return first !== undefined && isCodeString(first)
      })
      .map(call => violation(
        'SAST-01',
        sourceFile,
        call.getStart(),
        `\`${name}\` with a string argument evaluates that string as code. Pass a function instead.`
      ))
  )

  return [...named, ...deferred]
}

/**
 * The globals a component may not name.
 *
 * `document` is **deliberately absent**: a component compiled for the web returns DOM, so it has to
 * be able to build nodes. What is banned is the one property that is not about building anything.
 */
/**
 * Names that reach outside the component, refused as names.
 *
 * `document` is here for the reason the others are, and it was missed: from it a component reaches
 * `defaultView` and therefore `window`, `eval`, `localStorage` and the network, in one hop through a
 * name nothing banned. Refusing the members instead would not have worked — a property on a runtime
 * value is reachable by computed access, which is the whole reason these are banned as names.
 *
 * What a component builds nodes with instead is the `dom` parameter, supplied by the consumer's SDK.
 */
const BANNED_GLOBALS = [
  'globalThis', 'window', 'global', 'process', 'localStorage', 'document',
  /*
   * `arguments` is not a global, and is here because it defeats every rule that is expressed as a
   * name. A component's signature carries parameters the CMS supplies for its own use — the raw
   * network call the data bridge is built from among them — and `arguments[1]` reaches one without
   * naming it. In a module, which is strict, `arguments` holds what was passed rather than tracking
   * the parameters, so clearing a parameter afterwards does not clear this route to it.
   */
  'arguments'
]

/**
 * `SAST-02` — no global scope access.
 *
 * Banning the name is also what closes computed access: `globalThis['ev' + 'al']` cannot be resolved
 * statically, and does not need to be, because `globalThis` cannot be named to begin with.
 */
const noGlobalScopeAccess = (sourceFile: SourceFile): SecurityRuleDiagnostic[] => {
  const globals = BANNED_GLOBALS.flatMap(name =>
    freeReferences(sourceFile, name).map(id => violation(
      'SAST-02',
      sourceFile,
      id.getStart(),
      `\`${name}\` reaches the environment the component runs in. A component receives everything ` +
      'it may use as a parameter.'
    ))
  )

  // Not `document` itself, which a component needs to build the nodes it returns.
  const cookies = accessesNamed(sourceFile, 'cookie')
    .filter(node => accessTargetText(node) === 'document')
    .map(node => violation(
      'SAST-02',
      sourceFile,
      node.getStart(),
      '`document.cookie` reads and writes credentials belonging to the host application.'
    ))

  return [...globals, ...cookies]
}

/** Reaching a prototype, by whichever spelling. */
const MUTATORS = ['setPrototypeOf', 'defineProperty', 'defineProperties']

/** Whether what is being modified is a prototype, or `Object` itself. */
const targetsPrototype = (call: CallExpression): boolean => {
  const target = call.getArguments()[0]
  if (target === undefined) return false
  const text = target.getText()
  return /(^|\.)prototype$/.test(text) || text === 'Object'
}

/**
 * `SAST-03` — no prototype manipulation.
 *
 * `constructor` is here rather than under `SAST-01` because reaching it is not evaluation by itself.
 * It is how evaluation is *reconstructed* once the direct names are gone —
 * `({}).constructor.constructor('...')` reaches `Function` without ever writing it — which is
 * exactly the evasion a rule banning only the obvious spellings would miss.
 */
const noPrototypeManipulation = (sourceFile: SourceFile): SecurityRuleDiagnostic[] => {
  const proto = accessesNamed(sourceFile, '__proto__').map(node => violation(
    'SAST-03',
    sourceFile,
    node.getStart(),
    '`__proto__` reaches the prototype of an object the component did not create.'
  ))

  const constructors = accessesNamed(sourceFile, 'constructor').map(node => violation(
    'SAST-03',
    sourceFile,
    node.getStart(),
    '`.constructor` is how `Function` is reached without naming it, so it is refused with the ' +
    'evaluators.'
  ))

  const mutations = sourceFile
    .getDescendantsOfKind(SyntaxKind.CallExpression)
    .filter(call => {
      const callee = call.getExpression()
      if (!Node.isPropertyAccessExpression(callee)) return false
      if (callee.getExpression().getText() !== 'Object') return false
      if (!MUTATORS.includes(callee.getName())) return false
      // `Object.defineProperty(own, ...)` on the component's own object is ordinary; the fault is
      // doing it to a prototype, which changes objects the component never created.
      return callee.getName() === 'setPrototypeOf' || targetsPrototype(call)
    })
    .map(call => violation(
      'SAST-03',
      sourceFile,
      call.getStart(),
      'Changing a prototype changes objects the component never created, including the host ' +
      "application's."
    ))

  return [...proto, ...constructors, ...mutations]
}

export { noDynamicEvaluation, noGlobalScopeAccess, noPrototypeManipulation }

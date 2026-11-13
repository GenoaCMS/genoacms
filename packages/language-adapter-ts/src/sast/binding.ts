import type { SastRuleId } from '@genoacms/internal/sast'
import { EVALUATORS, DEFERRED, BANNED_GLOBALS, PROTOTYPE_MUTATORS } from './rules/dynamicExecution.js'
import { NETWORK } from './rules/moduleIsolation.js'
import { SIZED } from './rules/resourceUse.js'

/**
 * The TypeScript binding of the ruleset: what breaks each rule's intent in this language.
 *
 * The ruleset in `@genoacms/internal/sast` states each rule as a property of a component, in no
 * language's terms. This table is the other half, and belongs to this adapter alone: another
 * adapter binds the same identifiers to the constructs of its own language.
 *
 * Every list a rule bans by name is spelled from the constant that rule matches against, so the
 * binding cannot describe a ban the rule does not enforce, or miss one it does.
 */

const listed = (names: readonly string[]): string => names.join(', ')

const SAST_BINDING: Readonly<Record<SastRuleId, string>> = Object.freeze({
  'SAST-01': `Any reference to ${listed(EVALUATORS)}, and ${listed(DEFERRED)} called with a string.`,
  'SAST-02': `Any reference to ${listed(BANNED_GLOBALS)}, and document.cookie.`,
  'SAST-03': `Any __proto__ or .constructor access, Object.setPrototypeOf, and ` +
    `Object.${listed(PROTOTYPE_MUTATORS.filter(name => name !== 'setPrototypeOf'))} on a prototype ` +
    'or on Object.',
  'SAST-04': 'Any import or re-export declaration, import(), or require(). Type-only imports are ' +
    'erased before compilation and are allowed.',
  'SAST-05': `Any reference to ${listed(NETWORK)}, and a data bridge request whose literal target ` +
    'has an origin outside the allowlist.',
  'SAST-06': 'import() and require(), whose target is resolved at run time.',
  'SAST-07': 'A number attribute without a maximum in its schema that reaches a loop condition, the ' +
    'size of an allocation, or the argument of a self-recursive call.',
  'SAST-08': 'while and do … while with the condition true or 1, and for (;;), containing no break ' +
    'of their own and no return.',
  'SAST-09': 'A function declaration that calls itself and contains no if, switch or conditional ' +
    'expression. Mutual recursion and recursive arrow functions are left to the depth guard.',
  'SAST-10': `${listed(SIZED)} constructed with a size that is not a numeric literal.`,
  'SAST-11': 'An assignment to a member of a parameter, or a mutating array method called on one.'
})

export { SAST_BINDING }

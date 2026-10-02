---
type: architecture-index
title: Service contracts
prefix: C
codes: []
verified: 7174f7f
---

# Service contracts

## Design

### Overview

`@genoacms/contracts` holds what every adapter implements and core consumes: the adapter model
(descriptors, runtimes, the references that fill credential options, the registries that type each
provider entry) and one contract per service. An adapter depends on this package alone (U4), so a
third-party adapter needs nothing else to be written.

These documents follow the Spec Workflow ([`docs/WORKFLOW.md`](../../WORKFLOW.md)). The ID prefix is
`C`. The adapter model is not restructured yet, and its unprefixed IDs are those of the 2026-09
redesign ([`configuration.md`](../configuration.md)).

### Documents

| Document | Codes | Covers | State |
| :-- | :-- | :-- | :-- |
| [`adapter-model.md`](adapter-model.md) | — | descriptors and runtimes, references, registries, packages and their dependency direction | not restructured (`conforms: false`) |
| [`authentication.md`](authentication.md) | AUTHN | `authenticate`, `getIdentity`, and what core does with them: sign-in, session revalidation | conforming |
| [`conformance.md`](conformance.md) | CONF | `@genoacms/conformance`: the suites every adapter of a service runs | conforming |
| storage, database, secrets, language, deployment | — | not specified yet: `packages/contracts/src/<service>/` and `packages/internal` (language) are the only description | none |

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| CU1 | 2026-10-02: a method enters a service contract only when every adapter of that service can implement it, the services a first-party adapter targets included. A method only some can implement waits, or becomes an optional capability (CD1). | CD1; [`authentication.md`](authentication.md) |

**CD1. What only some adapters can do is an optional capability, offered whole or not at all.** No
capability exists yet.
*Why:* a mandatory method that some service cannot implement (a write on the array adapter's
read-only secret, a password reset on a store that sends no email) would be implemented by throwing,
and core could not tell an unsupported method from a failure. A capability is a property of the
adapter's instance, present or absent, so core decides what to offer from the provider itself.
*Cost:* core has to handle every combination of providers with and without a capability, and each
capability needs its own conformance suite.

### History

*History.* The contracts lived in `@genoacms/cloudabstraction`, beside a config loader and a build tool,
until the 2026-09 redesign moved them into `@genoacms/contracts` with their signatures unchanged
(RFC-0001, [`configuration.md`](../configuration.md) A1 to A6). On 2026-10-02 the adapter model moved
out of `configuration.md` into this directory, and the authentication contract and the conformance suites got a Specification.

### Register

Every `C` ID, where it lives, and its state.

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |
| CU1 | A method enters a contract only when every adapter can implement it | decided | README |
| CU2 | Credentials are user credentials; `GENOACMS_CREDENTIALS`, `users` | current | [`authentication.md`](authentication.md) |
| CU3 | `getIdentity`, and rejections that carry a reason | decided | [`authentication.md`](authentication.md) |
| CU4 | Providers one at a time; core limits failed sign-ins (5 per pair, 50 per address, 15 min) | decided | [`authentication.md`](authentication.md) |
| CD1 | What only some adapters can do is an optional capability | decided, none yet | README |
| CD2 | Sessions are revalidated with `getIdentity` at each refresh | new | [`authentication.md`](authentication.md) |
| CD3 | A rejection carries its reason; users see one message | new | [`authentication.md`](authentication.md) |
| CD7 | Core limits failed sign-ins per email and address, and per address | new | [`authentication.md`](authentication.md) |
| CD4 | A suite test checks only contract statements, and carries their IDs | new | [`conformance.md`](conformance.md) |
| CD5 | Each suite assertion is shown to fail against a mutant | new | [`conformance.md`](conformance.md) |
| CD6 | Suites use per-run names and clean up | new | [`conformance.md`](conformance.md) |
| CF1 | Nothing limits failed sign-ins | open, fixed by CD7 | [`authentication.md`](authentication.md) |
| CF2 | The array adapter compares plain-text passwords, not in constant time | open | [`authentication.md`](authentication.md) |
| CF3 | Every password is sent to every provider | mitigated, RFC-0030 | [`authentication.md`](authentication.md) |
| CF4 | A provider failure reads as a wrong password | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF5 | A disabled user keeps an open session until its family expires | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF6 | The storage suite's read check could not fail its test | fixed, `f22136c` | [`conformance.md`](conformance.md) |
| CF7 | The database suite never checks the update or the listing | open | [`conformance.md`](conformance.md) |
| CF8 | Nothing checks that a suite fails a non-conforming adapter | open (CD5) | [`conformance.md`](conformance.md) |
| CF9 | The storage suite writes a fixed name and may leave it behind | open (CD6) | [`conformance.md`](conformance.md) |
| CF10 | A refresh can skip revalidation and every test still passes | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF11 | The recorded provider is tested only at sign-in, and against the conventional key | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF12 | Parts of the sign-in trial that no test checks | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF13 | Revalidation of a family without a provider is checked with no failure | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF14 | The array adapter's `getIdentity` is tested only with its own subject and an unknown one | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF15 | The authentication suite checks neither the email nor when `disabled` may be reported | fixed, RFC-0030 | [`conformance.md`](conformance.md) |
| CF16 | Parts of the sign-in trial that CS2 found untested | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF17 | `login`'s joins to authorization and to the session are tested with one scenario each | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF18 | Parts of revalidation that CS2 found untested | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF19 | Host test 13 cannot see late construction or a cut list | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF20 | The authentication suite tries few inputs, once each | fixed, RFC-0030 | [`conformance.md`](conformance.md) |
| CF21 | A gone identity's family can stay in storage | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF22 | Parts of sign-in and revalidation that CS3 found untested | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF23 | The authentication suite still samples few inputs | fixed, RFC-0030 | [`conformance.md`](conformance.md) |
| CF24 | A refresh that loses its write race carries the old email | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF25 | A provider that answers `null` to `authenticate` crashes the sign-in | fixed, RFC-0030 | [`authentication.md`](authentication.md) |
| CF26 | A malformed rejection stopped the trial | open, fixed by RFC-0030 | [`authentication.md`](authentication.md) |
| CF27 | Parts of the third amendment that CS4 found untested | open | [`authentication.md`](authentication.md) |
| CF28 | The authentication suite catches some faults only by chance, and others not at all | open | [`conformance.md`](conformance.md) |
| CF29 | The authentication suite's tests outlast vitest's default timeout against a real provider | open, fixed by RFC-0030 | [`conformance.md`](conformance.md) |
| CS1 | Falsification audit of AUTHN-2 to AUTHN-7 and CONF-4 at `5dcc69f` | recorded | [`authentication.md`](authentication.md) |
| CS2 | Falsification audit of AUTHN-5 to AUTHN-7 and CONF-4 as amended, at `f7294c4` | recorded | [`authentication.md`](authentication.md) |
| CS3 | Falsification audit of AUTHN-5, AUTHN-7 and CONF-4 as amended again, at `eea34d9` | recorded | [`authentication.md`](authentication.md) |
| CS4 | Falsification audit of the third amendment's clauses, at `0c20ed9` | recorded | [`authentication.md`](authentication.md) |
| CQ1 | Where are failed sign-ins limited? | answered by CU4, CD7 | [`authentication.md`](authentication.md) |
| CQ2 | How are users created and changed from the CMS? | recommendation: an optional capability | [`authentication.md`](authentication.md) |

## Specification

None.

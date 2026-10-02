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
out of `configuration.md` into this directory, and the authentication contract got a Specification.

### Register

Every `C` ID, where it lives, and its state.

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |
| CU1 | A method enters a contract only when every adapter can implement it | decided | README |
| CU2 | Credentials are user credentials; `GENOACMS_CREDENTIALS`, `users` | current | [`authentication.md`](authentication.md) |
| CU3 | `getIdentity`, and rejections that carry a reason | decided | [`authentication.md`](authentication.md) |
| CD1 | What only some adapters can do is an optional capability | decided, none yet | README |
| CD2 | Sessions are revalidated with `getIdentity` at each refresh | new | [`authentication.md`](authentication.md) |
| CD3 | A rejection carries its reason; users see one message | new | [`authentication.md`](authentication.md) |
| CF1 | Nothing limits failed sign-ins | open | [`authentication.md`](authentication.md) |
| CF2 | The array adapter compares plain-text passwords, not in constant time | open | [`authentication.md`](authentication.md) |
| CF3 | Every password is sent to every provider | open | [`authentication.md`](authentication.md) |
| CF4 | A provider failure reads as a wrong password | open | [`authentication.md`](authentication.md) |
| CF5 | A disabled user keeps an open session until its family expires | open, fixed by CD2 | [`authentication.md`](authentication.md) |
| CQ1 | Where are failed sign-ins limited? | recommendation: in core | [`authentication.md`](authentication.md) |
| CQ2 | How are users created and changed from the CMS? | recommendation: an optional capability | [`authentication.md`](authentication.md) |

## Specification

None.

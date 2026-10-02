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
| storage, database, authentication, secrets, language, deployment | — | not specified yet: `packages/contracts/src/<service>/` and `packages/internal` (language) are the only description | none |

### Decisions

None.

### History

*History.* The contracts lived in `@genoacms/cloudabstraction`, beside a config loader and a build tool,
until the 2026-09 redesign moved them into `@genoacms/contracts` with their signatures unchanged
(RFC-0001, [`configuration.md`](../configuration.md) A1 to A6). On 2026-10-02 the adapter model moved
out of `configuration.md` into this directory.

### Register

Every `C` ID, where it lives, and its state.

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |

## Specification

None.

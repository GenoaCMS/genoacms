# `@genoacms/internal`

Contracts and vocabulary that more than one GenoaCMS package needs, and that belong to neither the
CMS application nor the cloud abstraction.

It is empty on creation. Modules arrive here as the packages that need them are built.

## Why it exists

`@genoacms/cloudabstraction` means one thing: **what an adapter must implement** in order to put
GenoaCMS on a storage provider, a database, a secret store. That is the promise its name makes, and
it is the promise a person writing an adapter reads it for.

Things that are shared but are *not* that had been accumulating there anyway, because it was the
only package everything already depended on. The permission vocabulary is the clearest case — no
adapter implements a permission table, yet it sat among the adapter contracts because
`genoa.config` declares roles and the config types live there too. Each such addition is defensible
alone and wrong in aggregate: the package stops meaning what its name says, and an adapter author
reads past contracts that have nothing to do with them.

This package is where those live instead.

## What belongs here

A module belongs here when **both** are true:

1. more than one package needs it — otherwise it belongs to the package that uses it;
2. it is not something a third party implements to plug GenoaCMS into a platform.

Concretely, that is the shared **vocabulary** (permission names and the rules for reading them) and
the extension points that are not cloud services — beginning with the language adapter contract,
which someone adding Kotlin or Swift support must depend on without depending on the CMS itself.

## What does not belong here

| If it is… | it goes to |
| :--- | :--- |
| implemented by an adapter for a platform | `@genoacms/cloudabstraction` |
| used only by the CMS application | `@genoacms/core` |
| a language's parser, analyzer or compiler | that language's adapter package |
| consumed only by a client application | `@genoacms/sdk` |

**"Shared" alone is not a reason.** Two packages happening to use the same helper is a case for
copying it or for one depending on the other, not for a third package in between. The bar is that
the thing is genuinely part of the contract *between* packages.

## Published, despite the name

"Internal" describes the audience, not the visibility. The package is published because a
third-party language adapter is compiled against these contracts, and a dependency that cannot be
installed is not an extension point. Nothing here is a stable public API for consumer applications —
those use `@genoacms/sdk`.

## Layout

Plain ESM with a hand-written `.d.ts` beside each module, matching `@genoacms/cloudabstraction`.
There is no build step anywhere outside `@genoacms/core`, and this package does not introduce one.
